# Backend Utility Scripts

This directory contains utility scripts for database maintenance, data reconciliation, and analysis.

## PayPal Reconciliation Script

### Overview

The `reconcile-existing-paypal.js` script is a **one-time migration script** that reconciles existing PayPal transactions in your database with their corresponding bank transactions.

This script processes historical data that existed before the PayPal reconciliation feature was implemented. Once run, the daily scheduler (`GocardlessSchedulerService`) will automatically handle reconciliation for new transactions going forward.

### What It Does

1. **Connects to Railway Database**: Uses the production DATABASE_URL
2. **Fetches All Users**: Processes all non-demo users in the system
3. **Processes Each User**: For each user, finds unreconciled PayPal transactions and matches them with bank transactions
4. **Enriches Data**:
   - Marks PayPal transactions as `reconciled_as_secondary`
   - Marks bank transactions as `reconciled_as_primary`
   - Enriches bank transaction descriptions with PayPal merchant details
5. **Reports Results**: Provides detailed statistics on reconciliation success

### When to Use

- **After initial feature deployment** - To reconcile historical PayPal transactions
- **After data import** - If bulk transactions were imported that need reconciliation
- **Database restoration** - After restoring from backup if reconciliation data was lost

**Important**: This is a **safe, idempotent** script - you can run it multiple times without causing duplicate reconciliations.

### How to Run

#### Option 1: Using npm script (Recommended)

```bash
# From backend directory
railway run npm run reconcile:paypal
```

#### Option 2: Direct execution

```bash
# Build first (required for NestJS bootstrap)
npm run build

# Run on Railway
railway run node scripts/reconcile-existing-paypal.js

# Or run locally (if DATABASE_URL is set)
node scripts/reconcile-existing-paypal.js
```

### Expected Output

```
🚀 Starting PayPal Reconciliation Script
=========================================

📦 Bootstrapping NestJS application...
✅ Application context created

👥 Fetching all users...
✅ Found 3 non-demo users

🔄 Processing users...

📊 Processing User 1 (user@example.com)
──────────────────────────────────────────────────
  ✅ Reconciled: 15
  ⚠️  Unreconciled: 3

  Unreconciled transactions:
    1. PayPal *OldMerchant - €25.50 (2024-01-15)
    2. PayPal *AnotherMerchant - €10.00 (2024-02-20)
    3. PayPal Transfer - €50.00 (2024-03-10)


📈 RECONCILIATION SUMMARY
==================================================
Total Users Processed: 3/3
Total Reconciled: 42
Total Unreconciled: 8
Errors: 0

✅ Reconciliation completed successfully!
   Bank transactions have been enriched with PayPal merchant details.
   PayPal transactions marked as secondary to avoid double-counting.

👋 Application context closed

✅ Script completed successfully
```

### What Gets Reconciled

The script uses the existing `GocardlessPaypalReconciliationService` logic:

- **Matching Criteria**:
  - Amount: ±1% tolerance
  - Date: ±3 days window
  - Description: Must contain "paypal" (case-insensitive)
  - Source: PayPal transaction (source='gocardless_paypal') with bank transaction (source='gocardless_bank')

- **Reconciliation Actions**:
  - Bank transaction marked as `reconciled_as_primary`
  - PayPal transaction marked as `reconciled_as_secondary` with `reconciledWithTransaction` relationship
  - Bank transaction description enriched with PayPal `merchantName` if available

### Troubleshooting

#### Script fails to build

```bash
# Clean and rebuild
npm run build
```

#### Connection errors

Ensure you're running with Railway CLI:
```bash
railway run node scripts/reconcile-existing-paypal.js
```

#### No transactions reconciled

Possible reasons:
- No unreconciled PayPal transactions exist
- PayPal transactions have no matching bank transactions
- Transactions fall outside the ±3 day matching window
- Amount differences exceed ±1% tolerance

Check the "Unreconciled transactions" section in the output for details.

#### Script hangs or times out

The script processes users sequentially to avoid database overload. For large databases with many users, this may take several minutes. This is expected behavior.

### Database Impact

- **Read Operations**: Queries Transaction table for unreconciled PayPal and bank transactions
- **Write Operations**: Updates `reconciliationStatus` and `reconciledWithTransaction` fields for matched transactions
- **Safety**: Uses TypeORM transactions with rollback capability
- **Performance**: Processes users sequentially to avoid database contention

### After Running

1. **Verify Results**: Check the summary statistics match expectations
2. **Review Unreconciled**: Investigate unreconciled transactions if needed
3. **Monitor Dashboard**: Expense analytics should now exclude reconciled PayPal transactions
4. **Daily Sync**: Future transactions will be automatically reconciled by the scheduler

### Related Documentation

- `docs/integrations/PAYPAL-RECONCILIATION.md` - Feature documentation
- `src/gocardless/gocardless-paypal-reconciliation.service.ts` - Service implementation
- `src/gocardless/gocardless-scheduler.service.ts` - Daily sync integration

## Other Scripts

### check-duplicates.js
Analyzes pending and prevented duplicate transactions.

### check-sync-status.js
Monitors GoCardless sync history and status.

### analyze-date-discrepancies.js
Identifies date-related issues in transaction data.

### cleanup-gocardless-duplicates.js
Cleans up duplicate GoCardless transactions.

### investigate-duplicates.js
Deep dive analysis of duplicate detection patterns.
