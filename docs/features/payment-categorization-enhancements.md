# Payment Activity Categorization Enhancements

**Feature Area:** Transaction Categorization
**Status:** Phase 1 ✅ Complete | Phase 2 🔮 Planned
**Last Updated:** 2025-12-18

---

## Table of Contents

1. [Overview](#overview)
2. [Phase 1: Automatic Categorization (Completed)](#phase-1-automatic-categorization-completed)
3. [Phase 2: Enhancement Roadmap](#phase-2-enhancement-roadmap)
4. [Technical Architecture](#technical-architecture)
5. [Implementation Guidelines](#implementation-guidelines)

---

## Overview

This document tracks the evolution of transaction categorization using payment activity enrichment data. When bank transactions like "PayPal Transfer" are enriched with payment activity details like "Starbucks Seattle", we can significantly improve categorization accuracy.

### Business Value
- **Improved Accuracy:** Categorize based on actual merchant, not payment intermediary
- **Reduced Manual Work:** Fewer transactions requiring manual categorization
- **Better Insights:** More accurate spending analysis and budgeting

### Current State
- ✅ Automatic re-categorization after enrichment
- ✅ Event-driven architecture (TransactionEnrichedEvent)
- ✅ Smart skip conditions (manual categories, similar names)
- ✅ 100% test coverage maintained

---

## Phase 1: Automatic Categorization (Completed)

### Implementation Summary
**Completed:** 2025-12-18
**Branch:** `feature/auto-categorize-after-enrichment`
**Test Coverage:** 23 new tests, 481/481 passing (100%)

### Key Components

#### 1. TransactionEnrichedEvent
```typescript
export class TransactionEnrichedEvent extends BaseEventClass {
  constructor(
    public readonly transaction: Transaction,
    public readonly paymentActivityId: number,
    public readonly enhancedMerchantName: string | null,
    public readonly originalMerchantName: string | null,
    userId: number,
  ) {
    super(userId);
  }
}
```

#### 2. TransactionEnrichedEventHandler
**Location:** `src/categories/event-handlers/transaction-enriched.event-handler.ts`

**Skip Conditions:**
- Enhanced merchant name is empty or whitespace
- Transaction has manual category (confidence ≥95 or null)
- Merchant names are too similar (>80% overlap or both reference same generic provider)
- Suggested category is same as current category

**Constants:**
```typescript
DEFAULT_ENRICHMENT_CONFIDENCE = 85.0
SIMILARITY_THRESHOLD = 0.8
MANUAL_CATEGORY_CONFIDENCE_THRESHOLD = 95.0
```

#### 3. Event Publishing
- **Manual Reconciliation:** `PaymentActivitiesService.updateReconciliation()` with `publishEvent: true` (default)
- **Automatic Reconciliation:** `PaymentActivityEventHandler.reconcileTransactionWithActivity()` with `publishEvent: false` (prevents duplicate events)

### Files Modified
- `src/shared/events/transaction.events.ts` - Added event definition
- `src/categories/categories.module.ts` - Registered event handler
- `src/payment-activities/payment-activities.service.ts` - Manual flow event publishing
- `src/transactions/event-handlers/payment-activity.event-handler.ts` - Automatic flow event publishing

### Files Created
- `src/shared/events/transaction.events.spec.ts` - Event tests
- `src/categories/event-handlers/transaction-enriched.event-handler.ts` - Handler implementation
- `src/categories/event-handlers/transaction-enriched.event-handler.spec.ts` - Handler tests
- `src/transactions/event-handlers/payment-activity.event-handler.spec.ts` - Automatic flow tests

---

## Phase 2: Enhancement Roadmap

### 2.1 ML-Based Category Suggestion

**Priority:** High
**Effort:** 2-3 days
**Dependencies:** OpenAI API integration (available)

#### Problem Statement
Current keyword-based categorization fails for:
- New merchants without keyword matches
- Merchants with ambiguous names
- Generic descriptions that don't match any keywords

#### Solution
Use OpenAI GPT-4 to suggest categories when keyword matching fails or returns low confidence.

#### Implementation Plan

**1. Extend TransactionEnrichedEventHandler**
```typescript
private async suggestCategoryWithAI(
  merchantName: string,
  userId: number,
): Promise<Category | null> {
  // Call existing keyword matching first
  let category = await this.categoriesService.suggestCategoryForDescription(
    merchantName,
    userId,
  );

  // If no match or low confidence, try OpenAI
  if (!category || confidence < 70) {
    category = await this.aiService.suggestCategory(merchantName, userId);
  }

  return category;
}
```

**2. Create AiCategorization Service**
```typescript
@Injectable()
export class AiCategorizationService {
  async suggestCategory(
    merchantName: string,
    userId: number,
  ): Promise<{ category: Category; confidence: number }> {
    // Get user's categories
    const categories = await this.categoriesService.findAll(userId);

    // Build prompt
    const prompt = `Categorize this merchant: "${merchantName}"

    Available categories:
    ${categories.map(c => `- ${c.name}: ${c.keywords.join(', ')}`).join('\n')}

    Return the best matching category name.`;

    // Call OpenAI
    const response = await this.openAiService.chat(prompt);

    // Find matching category
    const category = categories.find(c =>
      response.toLowerCase().includes(c.name.toLowerCase())
    );

    return { category, confidence: 80.0 };
  }
}
```

**3. Add Caching**
```typescript
// Cache AI responses to reduce API costs
private aiCategoryCache = new Map<string, { categoryId: number; expiresAt: Date }>();

// Store in Redis for persistence
await this.redis.set(
  `ai-category:${merchantName}`,
  JSON.stringify({ categoryId, confidence }),
  'EX',
  86400 // 24 hours
);
```

**4. Update Transaction Entity**
```typescript
@Column({ type: 'timestamp', nullable: true })
aiCategorizedAt: Date;

@Column({ type: 'varchar', length: 50, nullable: true })
aiModel: string; // e.g., "gpt-4-turbo"
```

**5. Testing Strategy**
- Mock OpenAI API responses
- Test fallback to keyword matching when API fails
- Test cache hit/miss scenarios
- Verify confidence scoring
- Load test with rate limiting

#### Success Criteria
- AI categorization has ≥85% accuracy
- API cost stays under $10/month for typical usage
- Response time <2 seconds with caching
- Graceful degradation when API is unavailable

---

### 2.2 User Feedback Loop for Category Correction

**Priority:** High
**Effort:** 3-4 days
**Dependencies:** None

#### Problem Statement
Users manually correct categories, but corrections don't improve future categorization. Same merchants get mis-categorized repeatedly.

#### Solution
Track user corrections and prioritize them over keyword/AI matching.

#### Implementation Plan

**1. Create CategoryCorrection Entity**
```typescript
@Entity('category_corrections')
export class CategoryCorrection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 255 })
  merchantName: string;

  @Column({ type: 'varchar', length: 255 })
  normalizedMerchantName: string; // For fuzzy matching

  @Column({ nullable: true })
  incorrectCategoryId: number;

  @Column()
  correctCategoryId: number;

  @Column({ type: 'integer', default: 1 })
  correctionCount: number; // How many times user made this correction

  @CreateDateColumn()
  correctedAt: Date;

  @ManyToOne(() => User)
  user: User;

  @ManyToOne(() => Category)
  correctCategory: Category;

  @ManyToOne(() => Category, { nullable: true })
  incorrectCategory: Category;
}
```

**2. Create CategoryCorrectionService**
```typescript
@Injectable()
export class CategoryCorrectionService {
  async recordCorrection(
    userId: number,
    merchantName: string,
    oldCategoryId: number | null,
    newCategoryId: number,
  ): Promise<void> {
    const normalized = this.normalizeMerchantName(merchantName);

    // Find or create correction
    let correction = await this.repository.findOne({
      where: { userId, normalizedMerchantName: normalized },
    });

    if (correction) {
      correction.correctionCount++;
      correction.correctCategoryId = newCategoryId;
      correction.correctedAt = new Date();
    } else {
      correction = this.repository.create({
        userId,
        merchantName,
        normalizedMerchantName: normalized,
        incorrectCategoryId: oldCategoryId,
        correctCategoryId: newCategoryId,
      });
    }

    await this.repository.save(correction);

    // Invalidate cache
    await this.redis.del(`category-correction:${userId}:${normalized}`);
  }

  async findCorrectionForMerchant(
    userId: number,
    merchantName: string,
  ): Promise<CategoryCorrection | null> {
    const normalized = this.normalizeMerchantName(merchantName);

    // Check cache first
    const cached = await this.redis.get(`category-correction:${userId}:${normalized}`);
    if (cached) return JSON.parse(cached);

    // Query database
    const correction = await this.repository.findOne({
      where: { userId, normalizedMerchantName: normalized },
      relations: ['correctCategory'],
    });

    if (correction) {
      // Cache for 7 days
      await this.redis.set(
        `category-correction:${userId}:${normalized}`,
        JSON.stringify(correction),
        'EX',
        604800,
      );
    }

    return correction;
  }
}
```

**3. Integrate with Categorization Flow**
```typescript
// In CategoriesService.suggestCategoryForDescription()
async suggestCategoryForDescription(
  description: string,
  userId: number,
): Promise<Category | null> {
  // 1. Check user corrections FIRST (highest priority)
  const correction = await this.categoryCorrection.findCorrectionForMerchant(
    userId,
    description,
  );
  if (correction) {
    return correction.correctCategory;
  }

  // 2. Fall back to keyword matching
  const category = await this.keywordBasedMatching(description, userId);

  // 3. Fall back to AI if needed
  if (!category) {
    return this.aiCategorization.suggestCategory(description, userId);
  }

  return category;
}
```

**4. Frontend Integration**
```typescript
// Add "Learn from this" toggle when user changes category
PATCH /transactions/:id/category
{
  categoryId: 5,
  learnFromThis: true  // NEW: Record as correction
}

// Backend endpoint
async updateCategory(
  id: number,
  userId: number,
  data: { categoryId: number; learnFromThis?: boolean },
): Promise<Transaction> {
  const transaction = await this.findOne(id, userId);
  const oldCategoryId = transaction.category?.id;

  transaction.category = await this.categories.findOne(data.categoryId);
  transaction.categorizationConfidence = null; // Manual = null
  const saved = await this.repository.save(transaction);

  // Record correction if requested
  if (data.learnFromThis && transaction.enhancedMerchantName) {
    await this.categoryCorrection.recordCorrection(
      userId,
      transaction.enhancedMerchantName,
      oldCategoryId,
      data.categoryId,
    );
  }

  return saved;
}
```

**5. Migration Strategy**
```typescript
// Backfill corrections from historical data
// Find transactions where user manually changed category
SELECT
  user_id,
  enhanced_merchant_name,
  category_id,
  COUNT(*) as correction_count
FROM transactions
WHERE
  enhanced_merchant_name IS NOT NULL
  AND categorization_confidence IS NULL  -- Manual category
GROUP BY user_id, enhanced_merchant_name, category_id
HAVING COUNT(*) >= 2  -- User categorized same merchant multiple times
```

#### Success Criteria
- User corrections applied with 100% priority
- <100ms lookup time for corrections (with cache)
- Corrections persist across sessions
- Bulk apply corrections to similar transactions

---

### 2.3 Bulk Re-categorization

**Priority:** Medium
**Effort:** 1-2 days
**Dependencies:** Phase 2.1 or 2.2

#### Implementation Plan

**1. Admin Endpoint**
```typescript
@Post('admin/recategorize-enriched')
@UseGuards(JwtAuthGuard, AdminGuard)
async bulkRecategorize(
  @Query('dryRun') dryRun: boolean = false,
  @Query('batchSize') batchSize: number = 100,
): Promise<BulkRecategorizeResult> {
  const result = {
    total: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    changes: [],
  };

  // Get all enriched transactions
  const total = await this.repository.count({
    where: {
      enrichedFromPaymentActivityId: Not(IsNull()),
      categorizationConfidence: Not(IsNull()), // Skip manual
    },
  });

  result.total = total;
  const batches = Math.ceil(total / batchSize);

  for (let i = 0; i < batches; i++) {
    const transactions = await this.repository.find({
      where: {
        enrichedFromPaymentActivityId: Not(IsNull()),
        categorizationConfidence: Not(IsNull()),
      },
      take: batchSize,
      skip: i * batchSize,
      relations: ['category'],
    });

    for (const transaction of transactions) {
      try {
        // Re-run categorization
        const newCategory = await this.categories.suggestCategoryForDescription(
          transaction.enhancedMerchantName,
          transaction.user.id,
        );

        if (newCategory && newCategory.id !== transaction.category?.id) {
          result.changes.push({
            transactionId: transaction.id,
            oldCategory: transaction.category?.name,
            newCategory: newCategory.name,
          });

          if (!dryRun) {
            transaction.category = newCategory;
            await this.repository.save(transaction);
          }

          result.updated++;
        } else {
          result.skipped++;
        }
      } catch (error) {
        result.failed++;
        this.logger.error(`Failed to recategorize transaction ${transaction.id}`, error);
      }
    }
  }

  return result;
}
```

**2. CLI Command**
```bash
npm run recategorize:enriched -- --dry-run
npm run recategorize:enriched -- --batch-size=50
```

---

### 2.4 Category Confidence Dashboard

**Priority:** Low
**Effort:** 2-3 days
**Dependencies:** Frontend dashboard

#### Implementation Plan

**1. Stats Endpoint**
```typescript
@Get('admin/categorization-stats')
@UseGuards(JwtAuthGuard, AdminGuard)
async getCategorizationStats(
  @Query('startDate') startDate?: string,
  @Query('endDate') endDate?: string,
): Promise<CategorizationStats> {
  // Use SQL for performance
  const stats = await this.repository.query(`
    SELECT
      COUNT(*) as total_transactions,
      COUNT(category_id) as categorized,
      COUNT(*) - COUNT(category_id) as uncategorized,
      AVG(categorization_confidence) as avg_confidence,
      COUNT(CASE WHEN categorization_confidence >= 85 THEN 1 END) as high_confidence,
      COUNT(CASE WHEN categorization_confidence BETWEEN 70 AND 84 THEN 1 END) as medium_confidence,
      COUNT(CASE WHEN categorization_confidence < 70 THEN 1 END) as low_confidence
    FROM transactions
    WHERE execution_date BETWEEN $1 AND $2
  `, [startDate, endDate]);

  // Top uncategorized merchants
  const uncategorized = await this.repository.query(`
    SELECT
      enhanced_merchant_name,
      COUNT(*) as count
    FROM transactions
    WHERE
      category_id IS NULL
      AND enhanced_merchant_name IS NOT NULL
    GROUP BY enhanced_merchant_name
    ORDER BY count DESC
    LIMIT 10
  `);

  return {
    ...stats[0],
    topUncategorizedMerchants: uncategorized,
  };
}
```

---

### 2.5 Merchant Name Normalization

**Priority:** Medium
**Effort:** 2 days

#### Implementation Plan

**1. Normalization Service**
```typescript
@Injectable()
export class MerchantNormalizationService {
  private readonly patterns = [
    // Remove common suffixes
    { pattern: /\s+(Inc\.?|LLC|Ltd\.?|Limited|Corp\.?|Corporation)$/i, replace: '' },

    // Remove location suffixes
    { pattern: /\s+#\d+$/, replace: '' }, // "Starbucks #123" → "Starbucks"
    { pattern: /\s+-\s+[A-Z]{2}$/, replace: '' }, // "Walmart - CA" → "Walmart"

    // Normalize spacing
    { pattern: /\s+/g, replace: ' ' },
    { pattern: /^\s+|\s+$/g, replace: '' },
  ];

  private readonly aliases = new Map<string, string>([
    ['mcdonald\'s', 'McDonald\'s'],
    ['mickey d\'s', 'McDonald\'s'],
    ['mcd', 'McDonald\'s'],
    ['sbux', 'Starbucks'],
  ]);

  normalize(merchantName: string): string {
    if (!merchantName) return '';

    let normalized = merchantName;

    // Apply regex patterns
    for (const { pattern, replace } of this.patterns) {
      normalized = normalized.replace(pattern, replace);
    }

    // Apply aliases
    const lower = normalized.toLowerCase();
    for (const [alias, canonical] of this.aliases) {
      if (lower === alias) {
        return canonical;
      }
    }

    return normalized.trim();
  }
}
```

**2. Database Schema**
```typescript
// Add normalized field to Transaction
@Column({ type: 'varchar', length: 255, nullable: true })
normalizedMerchantName: string;

// Create index
@Index('idx_normalized_merchant')
```

**3. Merchant Alias Entity**
```typescript
@Entity('merchant_aliases')
export class MerchantAlias {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number; // User-specific aliases

  @Column()
  alias: string; // "Mickey D's"

  @Column()
  canonical: string; // "McDonald's"
}
```

---

### 2.6 MCC-Based Categorization

**Priority:** Low
**Effort:** 1 day

#### Implementation Plan

**1. MCC Mapping Entity**
```typescript
@Entity('mcc_category_mappings')
export class MccCategoryMapping {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 4 })
  mcc: string; // "5814" = Fast Food

  @Column()
  categoryId: number;

  @Column({ type: 'integer', default: 1 })
  priority: number; // Lower = higher priority

  @Column({ type: 'boolean', default: false })
  isCustom: boolean; // User customization

  @ManyToOne(() => Category)
  category: Category;
}
```

**2. Seed Data**
```typescript
// Standard MCC mappings (ISO 18245)
const standardMccMappings = [
  { mcc: '5814', category: 'Restaurants', priority: 1 }, // Fast Food
  { mcc: '5812', category: 'Restaurants', priority: 1 }, // Eating Places
  { mcc: '5411', category: 'Groceries', priority: 1 },   // Grocery Stores
  { mcc: '5541', category: 'Transportation', priority: 1 }, // Gas Stations
  { mcc: '5732', category: 'Electronics', priority: 1 },  // Electronics
  // ... more mappings
];
```

**3. Integration**
```typescript
async suggestCategoryForDescription(
  description: string,
  userId: number,
  mcc?: string,
): Promise<Category | null> {
  // 1. User corrections (highest priority)
  // 2. MCC mapping (if available)
  if (mcc) {
    const mapping = await this.mccMapping.findMapping(mcc, userId);
    if (mapping) return mapping.category;
  }
  // 3. Keyword matching
  // 4. AI suggestion
}
```

---

## Technical Architecture

### Event Flow
```
Payment Activity Created/Reconciled
  ↓
PaymentActivityCreatedEvent OR updateReconciliation()
  ↓
Transaction enriched with merchant data
  ↓
TransactionEnrichedEvent published
  ↓
TransactionEnrichedEventHandler
  ↓
1. Check skip conditions
2. Get category suggestion:
   a. User corrections (Phase 2.2)
   b. MCC mapping (Phase 2.6)
   c. Keyword matching (existing)
   d. AI suggestion (Phase 2.1)
3. Apply normalization (Phase 2.5)
4. Update transaction
```

### Database Schema Evolution

**Phase 1:**
- No schema changes required
- Uses existing transaction fields

**Phase 2:**
```sql
-- Transaction table additions
ALTER TABLE transactions ADD COLUMN ai_categorized_at TIMESTAMP;
ALTER TABLE transactions ADD COLUMN ai_model VARCHAR(50);
ALTER TABLE transactions ADD COLUMN normalized_merchant_name VARCHAR(255);
CREATE INDEX idx_normalized_merchant ON transactions(normalized_merchant_name);

-- New tables
CREATE TABLE category_corrections (...);
CREATE TABLE merchant_aliases (...);
CREATE TABLE mcc_category_mappings (...);
```

---

## Implementation Guidelines

### Testing Requirements
- **Unit Tests:** 100% coverage for new services
- **Integration Tests:** Event flow end-to-end
- **Performance Tests:** Bulk operations, cache efficiency
- **User Acceptance:** Manual testing checklist

### Performance Considerations
- Cache aggressively (Redis)
- Batch database operations
- Index all lookup fields
- Monitor API costs (OpenAI)

### Rollout Strategy
1. Feature flag for each enhancement
2. A/B testing for AI vs keyword
3. Gradual rollout: 10% → 50% → 100%
4. Monitor categorization accuracy
5. Rollback plan for each phase

### Monitoring & Metrics
```typescript
// Track categorization method distribution
{
  userCorrection: 150,   // 30%
  mccMapping: 75,        // 15%
  keywordMatch: 200,     // 40%
  aiSuggestion: 75,      // 15%
}

// Track accuracy by method
{
  userCorrection: 100%,  // Always correct
  mccMapping: 95%,
  keywordMatch: 87%,
  aiSuggestion: 85%,
}
```

---

## Related Documentation

- Main Backlog: `docs/BACKLOG.md`
- PayPal Reconciliation: `docs/features/paypal-reconciliation-implementation-plan.md`
- Testing Standards: `docs/development/testing-standards.md`
- Event System Guide: `src/shared/events/README.md`

---

**Last Updated:** 2025-12-18
**Maintained By:** Development Team
**Questions?** Open an issue or update this document directly.
