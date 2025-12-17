# Payment Account MVP - Frontend Implementation Plan

## Status: Ready for Implementation

## Overview

Implement frontend UX for Payment Account MVP to support:
1. Payment Accounts & Activities CRUD
2. GoCardless connection for payment accounts
3. Import triggering using existing bank account patterns
4. Manual reconciliation workflow for uncertain matches

## Critical Files to Modify/Create

### New Files (Frontend)

**Types & API Client:**
- `src/types/payment-types.ts` - TypeScript interfaces
- `src/utils/payment-api-client.ts` - API client functions
- `src/utils/reconciliation-helpers.ts` - Confidence scoring

**Custom Hooks:**
- `src/hooks/usePaymentAccounts.ts` - CRUD operations (mirror useBankAccounts)
- `src/hooks/usePaymentActivities.ts` - Activities fetching/filtering
- `src/hooks/useReconciliation.ts` - Reconciliation operations

**Payment Accounts Pages:**
- `src/app/payment-accounts/page.tsx` - Main page with tabs
- `src/app/payment-accounts/gocardless-callback/page.tsx` - OAuth callback
- `src/app/payment-accounts/components/PaymentAccountForm.tsx`
- `src/app/payment-accounts/components/PaymentAccountList.tsx`
- `src/app/payment-accounts/components/PaymentAccountCard.tsx`
- `src/app/payment-accounts/components/GocardlessPaymentConnectionDialog.tsx`
- `src/app/payment-accounts/components/ImportPaymentActivitiesDialog.tsx`

**Payment Activities Pages:**
- `src/app/payment-activities/page.tsx` - Main activities page
- `src/app/payment-activities/components/PaymentActivitiesList.tsx`
- `src/app/payment-activities/components/PaymentActivityCard.tsx`
- `src/app/payment-activities/components/PaymentActivityDetail.tsx`
- `src/app/payment-activities/components/ReconciliationFilters.tsx`
- `src/app/payment-activities/components/ReconciliationStatsCard.tsx`

**Payment Reconciliation Pages:**
- `src/app/payment-reconciliation/page.tsx` - Manual reconciliation
- `src/app/payment-reconciliation/components/ReconciliationWorkflow.tsx`
- `src/app/payment-reconciliation/components/FailedReconciliationList.tsx`
- `src/app/payment-reconciliation/components/ReconciliationComparisonCard.tsx`
- `src/app/payment-reconciliation/components/TransactionMatchSearch.tsx`
- `src/app/payment-reconciliation/components/ManualReconciliationActions.tsx`

### Backend Modification Required

**Scheduled Sync Extension:**
- Modify `coffee-budget-backend/src/gocardless/gocardless-scheduler.service.ts` to include payment accounts in daily cron job

## Implementation Sequence (20 days total)

### Phase 1: Foundation (Day 1-2)

**Create TypeScript types, API client, and custom hooks**

1. Create `types/payment-types.ts` with interfaces:
   - PaymentAccount, PaymentActivity
   - CreatePaymentAccountDto, UpdatePaymentAccountDto
   - UpdateReconciliationDto, ReconciliationStats, ImportResult
   - PAYMENT_PROVIDERS and RECONCILIATION_STATUSES constants

2. Create `utils/payment-api-client.ts` mirroring existing api-client
3. Create `hooks/usePaymentAccounts.ts` copying useBankAccounts pattern
4. Create `hooks/usePaymentActivities.ts` and `hooks/useReconciliation.ts`
5. Write unit tests for all hooks (TDD approach)

### Phase 2: Payment Accounts CRUD (Day 3-4)

**Tab-based CRUD matching bank accounts pattern**

1. Copy `app/bank-accounts/page.tsx` structure exactly
2. Create PaymentAccountForm (Display Name, Provider dropdown, Linked Bank Account, Is Active checkbox)
3. Create PaymentAccountList (grid of cards)
4. Create PaymentAccountCard (Edit, Delete, Import Activities buttons)
5. E2E tests for create/edit/delete flows

### Phase 3: GoCardless Integration (Day 5-6)

**Adapt OAuth flow for payment accounts**

1. Copy and adapt `GocardlessIntegrationDialog.tsx` for payment accounts
2. Add provider selection step (PayPal, Klarna, etc.)
3. OAuth popup flow (600x700 centered window)
4. Account mapping step (create new OR associate existing)
5. Store gocardlessAccountId in providerConfig JSON field
6. Create callback page with postMessage communication

### Phase 4: Import Functionality (Day 7-8)

**Import dialog with date range selection**

1. Copy pattern from GocardlessImportOptions
2. Date range picker (default: last 90 days)
3. Payment account selector
4. Progress indicators
5. Rich toast notifications with stats

### Phase 5: Payment Activities Page (Day 9-11)

**Display activities with filtering and stats**

1. Create main page with filter panel and stats card
2. ReconciliationFilters (Account, Status, Date range)
3. ReconciliationStatsCard (Total, Pending, Reconciled %, Failed)
4. PaymentActivitiesList with cards
5. PaymentActivityDetail modal with full data

### Phase 6: Manual Reconciliation (Day 12-15)

**Two-column comparison workflow**

1. Copy pending-duplicates two-column pattern
2. FailedReconciliationList with checkboxes
3. ReconciliationComparisonCard (Activity vs Suggested Transaction)
4. TransactionMatchSearch for alternatives
5. ManualReconciliationActions (Link, Search, Mark Reviewed)
6. Bulk actions support

### Phase 7: Scheduled Sync Backend (Day 16)

**Extend cron job to include payment accounts**

Modify `GocardlessSchedulerService` to add `syncPaymentAccounts()` method called after existing bank account sync.

### Phase 8: Polish & Testing (Day 17-18)

**Comprehensive testing and refinement**

1. Loading states everywhere
2. Error handling improvements
3. Empty states for all lists
4. End-to-end testing
5. Cross-browser testing
6. Mobile responsive testing
7. Accessibility audit

### Phase 9: Documentation (Day 19-20)

**Complete documentation**

1. Update user documentation
2. Admin troubleshooting guide
3. Code comments
4. Storybook stories

## Key Design Decisions

**Tab-Based CRUD:** Matches bank accounts page for UX consistency

**Provider Config JSON:** Flexible storage for provider-specific data (gocardlessAccountId, API keys)

**Separate Reconciliation Page:** Complex workflow needs dedicated space (/payment-reconciliation)

**Two-Column Comparison:** Proven pattern from pending duplicates for clear visual comparison

**Confidence Badges:** Color-coded (Green >80%, Yellow 60-80%, Red <60%)

**Scheduled Sync Extension:** Leverage existing cron infrastructure with small addition

## Backend API Endpoints (Already Implemented)

- `GET/POST/PUT/DELETE /payment-accounts`
- `GET /payment-activities/payment-account/:id`
- `GET /payment-activities/pending/:id`
- `GET /payment-activities/stats/:id`
- `POST /payment-activities/import/:id`
- `POST /payment-activities/import-all-paypal`
- `PUT /payment-activities/:id/reconciliation`

## Success Criteria

- Payment Accounts CRUD fully functional
- GoCardless OAuth connection works end-to-end
- Import activities with date range selection
- Payment Activities list with filtering and stats
- Manual reconciliation workflow with comparison cards
- Bulk reconciliation actions
- Scheduled daily sync includes payment accounts
- 100% test success rate
- Mobile responsive on all pages
- Accessible (keyboard nav, screen reader)

## Next Steps After Approval

1. Verify all backend endpoints are functional
2. Start Phase 1 (Foundation) using TDD
3. Implement phases sequentially with testing
4. Deploy to staging for review
