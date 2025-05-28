# Recurring Transactions Module (Analytics Only)

This module has been simplified to provide analytics-only functionality for recurring transactions. The bidirectional relationship between Transaction and RecurringTransaction entities has been removed, and the transaction generation capability has been eliminated.

## Key Components

1. **RecurringTransaction Entity**
   - Stores recurring transaction patterns
   - Used for forecasting and analytics
   - Now includes additional date calculation fields: dayOfMonth, dayOfWeek, month

2. **RecurringTransactionGeneratorService**
   - Simplified to only calculate next execution dates
   - Used by the dashboard service for forecasting future transactions

3. **RecurringPatternDetectorService**
   - Analyzes past transactions to detect recurring patterns
   - No longer creates or links to recurring transactions
   - Returns pattern analysis results only

4. **RecurringTransactionsService**
   - Handles basic CRUD operations for recurring transactions
   - Provides pattern detection capabilities for analytics

## Usage

The module is now focused on these primary use cases:

1. **Creating and managing recurring transaction records** - These are now standalone records not linked to actual transactions.
2. **Detecting patterns** in user transaction history
3. **Generating forecasts** for dashboard analytics
4. **Calculating dates** for recurring patterns

## Database Changes

A migration has been created to:
1. Remove the `recurringTransactionId` column from the `transaction` table
2. Add new columns to the `recurring_transaction` table for better date calculations

## Implementation Notes

- Recurring transactions are now only used for analytics and forecasting
- No actual transactions are generated or modified by this module
- The module is fully decoupled from the transaction creation flow 