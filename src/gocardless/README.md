# GoCardless Module

This module handles GoCardless Open Banking API integration for bank account synchronization and transaction imports.

## Services

### GocardlessService
Main service for GoCardless API integration:
- Bank account synchronization
- Transaction import from banks
- Requisition management
- Webhook event handling

### GocardlessSchedulerService
Scheduled tasks for automatic synchronization:
- Daily bank sync at 9:00 AM
- Automatic PayPal reconciliation (deprecated)

### PaymentAccountService
Payment account management for OAuth connections:
- PayPal account connection via GoCardless
- Provider configuration management
- Activity import coordination

---

## ⚠️ DEPRECATED: Transaction-to-Transaction Reconciliation

The old reconciliation system using `GocardlessPaypalReconciliationService` and the `Transaction.reconciledWithTransactionId` field is **deprecated** and will be removed in v2.0.

### Why Deprecated?

The old system had several issues:
1. **Confusion**: Two transactions linked together is unclear
2. **Poor separation**: Payment provider data mixed with bank data
3. **Limited enrichment**: Hard to preserve original data when enhancing

### New System: PaymentActivity-Based Reconciliation

The new architecture uses `PaymentActivity` entities:

```
PayPal/Klarna/etc. Activities
         ↓
  PaymentActivity entity
         ↓
  Matches with bank Transaction
         ↓
  Enriches Transaction with merchant data
```

**Benefits:**
- Clear separation of concerns
- Better data model for payment provider activities
- Proper enrichment tracking with audit trail
- Support for multiple payment providers

### Migration Path

| Old System | New System |
|------------|------------|
| `Transaction.reconciledWithTransactionId` | `PaymentActivity.reconciledTransactionId` |
| `Transaction.reconciliationStatus` (3 values) | `PaymentActivity.reconciliationStatus` (5 values) |
| `GocardlessPaypalReconciliationService` | `PaymentActivityService` |

### Timeline

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Deprecation warnings added | ✅ Current |
| **Phase 2** | Data migration script | 🔜 Scheduled |
| **Phase 3** | Schema cleanup and removal | 🔜 Scheduled |

### For Developers

**Do NOT use:**
- `GocardlessPaypalReconciliationService.findPotentialPayPalMatch()`
- `GocardlessPaypalReconciliationService.reconcileTransactions()`
- `GocardlessPaypalReconciliationService.processPayPalReconciliation()`
- `Transaction.reconciledWithTransaction`
- `Transaction.reconciliationStatus`

**Use instead:**
- `PaymentActivityService` for import and reconciliation
- `Transaction.enrichedFromPaymentActivityId` for tracking enrichment source

### Reference

See full migration details:
- [Cleanup Task](../../../../docs/tasks/active/REFACTOR-20251217-cleanup-old-reconciliation.md)
- [Payment Activity Improvements](../../../../docs/payment-features/PAYMENT-ACTIVITY-RECONCILIATION-IMPROVEMENTS.md)
