# Pending Duplicates Amount Issue - Diagnostic Guide

## Issue
400+ pending duplicates showing "-" for amount value in frontend.

## Root Cause Analysis

### Backend Code Review
1. **PendingDuplicate Entity** stores transaction data in JSON columns:
   - `existingTransactionData` - JSON string (nullable)
   - `newTransactionData` - JSON object (not nullable)

2. **Storage Inconsistency** (potential bug):
   ```typescript
   // Line 49-51: existingTransactionData is stringified
   pendingDuplicate.existingTransactionData = existingTransaction
     ? JSON.stringify(existingTransaction)
     : null;
   
   // Line 52: newTransactionData stored as-is
   pendingDuplicate.newTransactionData = newTransactionData;
   ```

3. **Amount Parsing** is robust - throws error if invalid, so shouldn't produce null.

## Diagnostic Steps

### Step 1: Install Railway CLI (if not already installed)
```bash
npm install -g @railway/cli
railway login
railway link
```

### Step 2: Connect to Railway PostgreSQL
```bash
railway run psql
```

### Step 3: Run Diagnostic Queries

#### Query 1: Count missing amounts
```sql
SELECT 
    COUNT(*) as total_duplicates,
    COUNT(*) FILTER (WHERE newTransactionData->>'amount' IS NULL OR newTransactionData->>'amount' = '') as missing_new_amount,
    COUNT(*) FILTER (WHERE existingTransactionData->>'amount' IS NULL OR existingTransactionData->>'amount' = '') as missing_existing_amount
FROM pending_duplicates
WHERE resolved = false;
```

#### Query 2: Sample records with missing amounts
```sql
SELECT 
    id,
    source,
    source_reference,
    newTransactionData->>'amount' as new_amount,
    newTransactionData->>'description' as new_desc,
    newTransactionData->>'type' as new_type,
    existingTransactionData->>'amount' as existing_amount,
    created_at
FROM pending_duplicates
WHERE 
    resolved = false
    AND (newTransactionData->>'amount' IS NULL OR newTransactionData->>'amount' = '')
LIMIT 10;
```

#### Query 3: Check data types and structure
```sql
SELECT 
    id,
    pg_typeof(newTransactionData) as new_data_type,
    pg_typeof(existingTransactionData) as existing_data_type,
    jsonb_typeof(newTransactionData) as new_json_type,
    jsonb_typeof(existingTransactionData) as existing_json_type
FROM pending_duplicates
LIMIT 5;
```

#### Query 4: Full JSON structure sample
```sql
SELECT 
    id,
    source,
    newTransactionData,
    existingTransactionData
FROM pending_duplicates
WHERE resolved = false
LIMIT 3;
```

## Expected Findings

### Scenario A: Amount is NULL in JSON
- **Cause**: CSV import had empty amount fields
- **Fix**: Add validation to reject CSV rows with missing amounts

### Scenario B: Amount property missing entirely
- **Cause**: Parser didn't set amount field
- **Fix**: Update parsers to ensure amount is always set

### Scenario C: Amount exists but frontend shows "-"
- **Cause**: Frontend formatting issue, not backend data issue
- **Fix**: Update frontend to handle edge cases properly

### Scenario D: Type mismatch (json vs jsonb)
- **Cause**: Database column type inconsistency
- **Fix**: Migration to standardize column types

## Solutions

### Solution 1: Add Validation (Preventive)
Add DTO validation to ensure amount is always present:

```typescript
// src/pending-duplicates/dto/create-pending-duplicate.dto.ts
export class CreatePendingDuplicateDto {
  @IsNotEmpty()
  @IsNumber()
  amount: number;
  
  // ... other fields
}
```

### Solution 2: Fix Existing Data (Reactive)
If amount is truly missing, these records are invalid and should be:
1. Marked as resolved
2. Or deleted
3. Or manually corrected if recoverable

```sql
-- Mark invalid duplicates as resolved
UPDATE pending_duplicates
SET resolved = true
WHERE (newTransactionData->>'amount' IS NULL OR newTransactionData->>'amount' = '');
```

### Solution 3: Fix Storage Inconsistency
Update `pending-duplicates.service.ts` to be consistent:

```typescript
// Both should be JSON objects, not strings
pendingDuplicate.existingTransactionData = existingTransaction || null;
pendingDuplicate.newTransactionData = newTransactionData;
```

**But this requires migration to change column type from 'json' to 'jsonb'**

## Frontend Check

If amounts exist in database but show as "-", check frontend code:

```typescript
// Look for formatting logic like:
const displayAmount = transaction.amount ?? '-';
const displayAmount = transaction.amount || '-';
```

## Next Steps

1. Run diagnostic queries to identify which scenario applies
2. Share query results
3. Implement appropriate fix based on findings
