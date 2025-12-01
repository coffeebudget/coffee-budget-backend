# GoCardless Bulk Import Duplicate Detection Analysis

## Problem Statement

After implementing the daily GoCardless sync via cron, we're seeing **20+ pending duplicates created every sync** even though:
- Transactions already exist in the database (imported on September 15th)
- Each transaction has a unique `transactionIdOpenBankAPI`
- A database unique constraint exists on `(user, transactionIdOpenBankAPI, source)`

## Root Cause Analysis

### Current Import Flow

```
GocardlessSchedulerService.dailyBankSync()
  ↓
GocardlessService.importAllConnectedAccounts()
  ↓
TransactionsService.importFromGoCardless()
  ↓
Loop through parsed transactions:
  ├─ Option 1: skipDuplicateCheck? → createTransactionFromAnyFormat() [BYPASSES CHECKS]
  ├─ Option 2: Use DuplicateDetectionService.checkForDuplicateBeforeCreation()
  │    └─ Only checks: description, amount, type, executionDate
  │    └─ **DOES NOT CHECK transactionIdOpenBankAPI**
  └─ Option 3: createTransactionFromAnyFormat() for new transactions
```

### The Missing Link

**`TransactionsService.importFromGoCardless()` at line 783-793:**
```typescript
const duplicateCheck = await this.transactionOperationsService
  .duplicateDetectionService.checkForDuplicateBeforeCreation(
    {
      description: transactionData.description || '',
      amount: transactionData.amount || 0,
      type: transactionData.type || 'expense',
      executionDate: transactionData.executionDate || new Date(),
      source: 'gocardless',
    },
    userId,
  );
```

**Problem:** The `transactionIdOpenBankAPI` field is **NOT passed** to the duplicate check!

The GoCardless parser **sets** `transactionIdOpenBankAPI` at `gocardless.parser.ts:73`, but it's **not used** during the duplicate detection in the import flow.

### Why createAutomatedTransaction() Has the Check

`TransactionOperationsService.createAutomatedTransaction()` at line 55-84 **DOES** check the API ID:

```typescript
if (transactionData.transactionIdOpenBankAPI && transactionData.source) {
  const existingTransaction = await this.transactionRepository.findOne({
    where: {
      user: { id: userId },
      transactionIdOpenBankAPI: transactionData.transactionIdOpenBankAPI,
      source: transactionData.source,
    },
  });

  if (existingTransaction) {
    // Prevent duplicate and log it
    await this.preventedDuplicatesService.createPreventedDuplicate(...);
    return null;
  }
}
```

**But:** The GoCardless import flow **does not use** `createAutomatedTransaction()`. It uses a **different path** that only checks similarity scores (description, amount, date, type).

## The Result

When the daily sync runs:

1. ✅ GoCardless API returns transactions from last 90 days (default range)
2. ✅ Parser correctly sets `transactionIdOpenBankAPI` for each transaction
3. ❌ `importFromGoCardless()` checks for duplicates **WITHOUT** using the API ID
4. ❌ Finds 80-90% similarity match (same description, amount, close dates)
5. ❌ Creates "pending duplicate" for manual review
6. ❌ This happens for **every transaction that was already imported**

## Why Database Constraint Doesn't Help

The unique constraint **only prevents the final insert**:
```sql
UNIQUE (user, transactionIdOpenBankAPI, source) WHERE transactionIdOpenBankAPI IS NOT NULL
```

The code **never attempts the insert** because it detects an 80%+ similarity and creates a pending duplicate instead.

## Solution Architecture

### Option 1: Add API ID Check to Import Flow (Recommended)

**Location:** `TransactionsService.importFromGoCardless()` line 783

**Change:**
```typescript
// BEFORE duplicate detection, check API ID first
if (transactionData.transactionIdOpenBankAPI) {
  const existingByApiId = await this.transactionRepository.findOne({
    where: {
      user: { id: userId },
      transactionIdOpenBankAPI: transactionData.transactionIdOpenBankAPI,
      source: 'gocardless',
    },
  });

  if (existingByApiId) {
    duplicatesCount++;
    await this.preventedDuplicatesService.createPreventedDuplicate(
      existingByApiId,
      transactionData,
      'gocardless',
      `gocardless_import_${Date.now()}`,
      100, // 100% match by API ID
      'Exact match by transactionIdOpenBankAPI',
      { id: userId } as User,
    );
    await this.importLogsService.appendToLog(
      importLog.id,
      `Prevented duplicate using API ID: ${transactionData.description}`,
    );
    continue; // Skip this transaction
  }
}

// Then proceed with similarity-based duplicate detection for manual imports
const duplicateCheck = await this.transactionOperationsService...
```

**Benefits:**
- ✅ **Fast**: Single database query by indexed unique field
- ✅ **Accurate**: 100% match guarantee with API ID
- ✅ **Non-intrusive**: Doesn't change existing duplicate detection logic
- ✅ **Logs prevention**: Creates audit trail in `prevented_duplicates` table

### Option 2: Unify Transaction Creation (Complex Refactoring)

**Goal:** Make **all** transaction creation paths use `createAutomatedTransaction()`

**Challenges:**
- `importFromGoCardless()` has specialized logic for bulk operations
- Different error handling and logging requirements
- Performance considerations (N queries vs batch operations)
- Risk of breaking existing CSV import flows

**Estimated effort:** 3-5 days of refactoring + comprehensive testing

### Option 3: Add API ID to Similarity Check (Partial Solution)

**Location:** `DuplicateDetectionService.checkForDuplicateBeforeCreation()`

**Issue:** This method signature doesn't accept `transactionIdOpenBankAPI` parameter

**Would require:**
- Changing method signature (breaks other callers)
- Updating all call sites
- Still less efficient than Option 1

## Recommended Implementation

**Implement Option 1** as an immediate fix:

1. Add API ID pre-check in `importFromGoCardless()` (30 minutes)
2. Test with existing pending duplicates (15 minutes)
3. Deploy and verify next sync run (observe)
4. **Future:** Consider Option 2 as part of Phase 3 refactoring

## Expected Results After Fix

**Before:**
- 20+ pending duplicates per sync
- User must manually resolve each one
- Same transactions flagged every day

**After:**
- 0 pending duplicates for already-imported transactions
- Only new transaction similarities flagged for review
- Clean audit trail in `prevented_duplicates` table

## Testing Plan

```bash
# 1. Create test script to simulate import
node scripts/test-duplicate-prevention.js

# 2. Check prevented_duplicates table
SELECT COUNT(*) FROM prevented_duplicates
WHERE reason = 'Exact match by transactionIdOpenBankAPI'
AND "createdAt" >= CURRENT_DATE;

# 3. Verify no pending_duplicates created
SELECT COUNT(*) FROM pending_duplicates
WHERE "createdAt" >= CURRENT_DATE
AND "newTransactionData"->>'transactionIdOpenBankAPI' IN (
  SELECT "transactionIdOpenBankAPI" FROM transaction
  WHERE source = 'gocardless'
);

# 4. Run daily sync and verify
railway logs --filter "Prevented duplicate using API ID"
```

## Long-term Maintainability

### Recommendation: Transaction Creation Service (Phase 3)

Create a **centralized transaction creation service** that handles:

1. **API ID validation** (primary duplicate check)
2. **Similarity-based detection** (secondary check for manual imports)
3. **Categorization** (keyword-based)
4. **Event publishing** (for other modules)
5. **Audit logging** (import logs, prevented duplicates)

**Structure:**
```typescript
TransactionCreationService
  ├─ createFromAPI(data, options)      // For GoCardless, PayPal, etc.
  ├─ createFromCSV(data, options)      // For manual imports
  ├─ createManual(data, user)          // For user-created transactions
  └─ Private methods:
      ├─ validateApiId()
      ├─ detectSimilarityDuplicates()
      ├─ applyCategorization()
      ├─ publishEvents()
      └─ auditLog()
```

**Benefits:**
- ✅ Single source of truth for transaction creation
- ✅ All paths use same duplicate detection logic
- ✅ Easier to test and maintain
- ✅ Clear separation of concerns
- ✅ Consistent behavior across all import sources

## Issue #22 Resolution

**Current Status:**
- ✅ Database constraint prevents actual duplicates
- ✅ `createAutomatedTransaction()` has API ID check
- ❌ **GoCardless bulk import bypasses the check**

**After implementing Option 1:**
- ✅ All import paths check API ID first
- ✅ Issue #22 can be marked as RESOLVED

**Documentation needed:**
- Update Issue #22 with analysis and fix
- Document the import flow in architecture docs
- Add testing guidelines for bulk imports
