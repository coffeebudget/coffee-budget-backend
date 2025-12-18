# Coffee Budget Backend - Feature Backlog

This document tracks upcoming features, enhancements, and technical improvements for the Coffee Budget backend.

**Last Updated:** 2025-12-18

---

## Table of Contents

1. [Payment Activity Categorization Enhancements](#payment-activity-categorization-enhancements)
2. [GoCardless Integration](#gocardless-integration)
3. [Duplicate Detection](#duplicate-detection)
4. [User Experience](#user-experience)
5. [Technical Debt](#technical-debt)

---

## Payment Activity Categorization Enhancements

### ✅ Completed
- **Automatic Categorization After Enrichment** (2025-12-18)
  - Implemented TransactionEnrichedEvent and handler
  - Re-categorizes transactions using enhanced merchant data
  - Integrated with manual and automatic reconciliation flows
  - 100% test coverage maintained (481/481 tests passing)

### 🔮 Phase 2 Enhancements

#### 1. ML-Based Category Suggestion
**Priority:** High
**Estimated Effort:** 2-3 days
**Dependencies:** OpenAI API integration (already available)

**Description:**
Use OpenAI to suggest categories based on enhanced merchant data when keyword matching fails or has low confidence.

**Implementation Approach:**
- Extend `TransactionEnrichedEventHandler` to call OpenAI when `suggestCategoryForDescription()` returns null
- Use GPT-4 with prompt: "Categorize this merchant: {enhancedMerchantName}"
- Store AI suggestions with confidence score (75-85 range)
- Fall back to existing keyword matching if API fails

**Benefits:**
- Improved categorization for merchants without keyword matches
- Better handling of new/unknown merchants
- Reduced manual categorization effort

**Technical Notes:**
- Use existing `AiService` in `src/ai/`
- Cache OpenAI responses to reduce API costs
- Add `aiCategorizedAt` timestamp to Transaction entity

---

#### 2. User Feedback Loop for Category Correction
**Priority:** High
**Estimated Effort:** 3-4 days
**Dependencies:** None

**Description:**
Allow users to correct auto-categorization and use corrections to improve future matching accuracy.

**Implementation Approach:**
- Track user category corrections (store old vs new category)
- Create `CategoryCorrection` entity:
  ```typescript
  {
    userId: number;
    merchantName: string;
    incorrectCategoryId: number;
    correctCategoryId: number;
    correctedAt: Date;
  }
  ```
- Build merchant-to-category mapping from corrections
- Prioritize user corrections over keyword matching
- Add "Learn from this" toggle when user changes category

**Benefits:**
- Personalized categorization based on user preferences
- Continuous improvement of categorization accuracy
- Reduced recurring categorization errors

**Technical Notes:**
- Use Redis cache for merchant → category mappings
- Apply corrections before keyword-based categorization
- Add correction count to category confidence score

---

#### 3. Bulk Re-categorization of Enriched Transactions
**Priority:** Medium
**Estimated Effort:** 1-2 days
**Dependencies:** Phase 2.1 or 2.2 (for better categorization logic)

**Description:**
Re-categorize all existing enriched transactions to apply improved categorization logic.

**Implementation Approach:**
- Create admin endpoint: `POST /admin/recategorize-enriched`
- Query all transactions with `enrichedFromPaymentActivityId IS NOT NULL`
- Re-run categorization using `enhancedMerchantName`
- Only update if new category confidence > current confidence
- Process in batches (100 transactions per batch)
- Return summary: { updated: 150, skipped: 50, failed: 0 }

**Benefits:**
- Applies improved categorization to historical data
- Fixes incorrect categorizations from initial implementation
- Provides data migration path for categorization upgrades

**Technical Notes:**
- Add `--dry-run` flag to preview changes
- Log all re-categorizations for audit trail
- Skip transactions with manual categories (confidence ≥95 or null)

---

#### 4. Category Confidence Dashboard
**Priority:** Low
**Estimated Effort:** 2-3 days
**Dependencies:** Frontend integration

**Description:**
Admin dashboard showing categorization accuracy metrics and low-confidence transactions.

**Implementation Approach:**
- New endpoint: `GET /admin/categorization-stats`
- Return metrics:
  ```typescript
  {
    totalTransactions: 1000,
    categorized: 950,
    uncategorized: 50,
    averageConfidence: 87.5,
    byConfidenceRange: {
      high: 800,      // ≥85
      medium: 100,    // 70-84
      low: 50,        // <70
    },
    topUncategorizedMerchants: [
      { merchantName: "Unknown Merchant", count: 10 }
    ]
  }
  ```
- Add filtering by date range, category, confidence level

**Benefits:**
- Visibility into categorization performance
- Identify merchants needing keyword additions
- Track improvement over time

**Technical Notes:**
- Add database indexes on `categorizationConfidence`
- Cache stats with 15-minute TTL
- Include charts in frontend dashboard

---

#### 5. Merchant Name Normalization
**Priority:** Medium
**Estimated Effort:** 2 days
**Dependencies:** None

**Description:**
Better handling of merchant name variations to improve categorization matching.

**Implementation Approach:**
- Create `MerchantNormalizationService`:
  ```typescript
  normalize(merchantName: string): string {
    // Remove common suffixes: "Inc", "LLC", "Ltd", "#123"
    // Normalize spacing and punctuation
    // Handle location variations: "Starbucks Seattle" → "Starbucks"
    // Map known aliases: "Mickey D's" → "McDonald's"
  }
  ```
- Apply normalization before category suggestion
- Store normalized name in `normalizedMerchantName` field
- Create merchant alias table for custom mappings

**Benefits:**
- Consistent categorization across merchant name variations
- Reduced duplicate keyword entries
- Better matching for chain stores with location suffixes

**Technical Notes:**
- Use regex patterns for common patterns
- Allow user-defined aliases via admin interface
- Update similarity detection to use normalized names

---

#### 6. Smart Merchant Category Code (MCC) Mapping
**Priority:** Low
**Estimated Effort:** 1 day
**Dependencies:** Payment activity MCC data availability

**Description:**
Use Merchant Category Codes (MCC) from payment activities to assist categorization.

**Implementation Approach:**
- Create MCC → Category mapping table:
  ```typescript
  {
    mcc: "5814",  // Fast Food
    categoryId: 3, // Restaurants
    priority: 1    // Lower = higher priority
  }
  ```
- When payment activity has `merchantCategoryCode`, check mapping first
- Use as fallback when keyword matching fails
- Allow users to customize MCC mappings

**Benefits:**
- Standardized categorization using industry codes
- Better accuracy for transactions with MCC data
- Reduced reliance on merchant name parsing

**Technical Notes:**
- Seed with standard ISO 18245 MCC mappings
- Add MCC to transaction enrichment data
- Combine MCC confidence with keyword confidence

---

## GoCardless Integration

### Planned Improvements
- **GoCardless Replacement Analysis** - See `docs/GOCARDLESS-REPLACEMENT-ANALYSIS.md`
- **Sync History API** - See `docs/development/PHASE3-SYNC-HISTORY-API-PLAN.md`
- **Multi-bank reconciliation** - Handle transactions from multiple banks

---

## Duplicate Detection

### Planned Improvements
- **Duplicate Detection Enhancements** - See `docs/DUPLICATE-DETECTION-IMPROVEMENTS-2025-11-06.md`
- **Improve similarity algorithm** - Add fuzzy matching for descriptions
- **Bank-specific duplicate handling** - Different rules per bank

---

## User Experience

### Planned Features
- **Transaction search and filtering** - Full-text search with advanced filters
- **Bulk transaction operations** - Select multiple transactions for categorization/deletion
- **Transaction notes** - Allow users to add custom notes to transactions
- **Transaction attachments** - Upload receipts/invoices
- **Export improvements** - Additional export formats (Excel, PDF)

---

## Technical Debt

### Backend Improvements
- **Complete TransactionsService refactoring** (Phase 2 in progress)
  - Break up 1780-line "god service"
  - Extract specialized services
  - Maintain 100% test success rate
- **Increase test coverage** - Target 90%+ coverage on all modules
- **API response pagination** - Implement cursor-based pagination
- **Database query optimization** - Add missing indexes, optimize N+1 queries
- **Error handling improvements** - Standardize error responses
- **API versioning** - Implement v1/v2 API versions

### Infrastructure
- **CI/CD pipeline** - Add automated testing and deployment
- **Database migrations** - Improve migration rollback strategy
- **Performance monitoring** - Add APM (Application Performance Monitoring)
- **Rate limiting enhancements** - Per-user and per-endpoint limits
- **Caching strategy** - Implement Redis caching layer

---

## How to Use This Backlog

### Priority Levels
- **High** - Critical for user experience or system stability
- **Medium** - Valuable but not blocking
- **Low** - Nice to have, can be deferred

### Status Indicators
- ✅ **Completed** - Implemented and deployed
- 🚧 **In Progress** - Currently being worked on
- 🔮 **Planned** - Approved and scheduled
- 💡 **Proposed** - Idea stage, needs discussion

### Adding New Items
1. Create detailed description with implementation approach
2. Estimate effort (days)
3. Identify dependencies
4. Assign priority
5. Add to relevant section

### Moving to Implementation
1. Copy item details to plan file in `docs/features/`
2. Create feature branch: `feature/item-name`
3. Follow TDD approach (RED → GREEN → REFACTOR)
4. Update status to 🚧 In Progress
5. Mark ✅ Completed when merged to main

---

## Related Documentation

- Feature Plans: `docs/features/`
- Development Plans: `docs/development/`
- Implementation Guide: `CLAUDE.md`
- Testing Standards: `docs/development/testing-standards.md`

---

**Questions or suggestions?** Open an issue or update this document directly.
