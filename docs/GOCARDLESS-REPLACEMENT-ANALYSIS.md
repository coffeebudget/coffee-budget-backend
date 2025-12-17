# GoCardless Replacement Analysis

**Analysis Date:** 2025-12-09
**Analyst:** Claude Code Architecture Analysis
**Status:** Current Architecture Assessment

---

## Executive Summary

**Difficulty Rating: 🟡 MEDIUM to 🟠 MEDIUM-HARD**

Replacing GoCardless with another Open Banking provider would require **moderate to significant effort** but is **architecturally feasible**. The codebase demonstrates **both tight and loose coupling**, meaning some components would be straightforward to replace while others require careful refactoring.

**Key Finding:** The codebase is approximately **60-70% ready** for provider replacement, with good foundational patterns but lacking critical abstraction layers.

**Estimated Effort:** 7-12 weeks for complete replacement, reducible to 4-6 weeks with recommended preliminary refactoring.

---

## Table of Contents

1. [Coupling Analysis](#coupling-analysis)
2. [Architecture Assessment](#architecture-assessment)
3. [Replacement Strategy](#replacement-strategy)
4. [Readiness Scorecard](#readiness-scorecard)
5. [Recommendations](#recommendations)
6. [Multi-Provider Strategy](#multi-provider-strategy)

---

## Coupling Analysis

### 1. TIGHT COUPLING (Hard to Replace)

#### 1.1 Database Schema Level

**Impact:** 🔴 High - Requires database migrations and widespread code changes

**Affected Fields:**
- `bank_account.gocardlessAccountId` (src/bank-accounts/entities/bank-account.entity.ts:13)
- `credit_card.gocardlessAccountId` (src/credit-cards/entities/credit-card.entity.ts)
- `transaction.transactionIdOpenBankAPI` (src/transactions/transaction.entity.ts:43)
- `transaction.merchantName` (src/transactions/transaction.entity.ts:48)
- `transaction.merchantCategoryCode` (src/transactions/transaction.entity.ts:51)

**Files Affected:** 27 files reference these fields

**Migration Requirements:**
```sql
-- Required schema changes
ALTER TABLE bank_account RENAME COLUMN "gocardlessAccountId" TO "externalAccountId";
ALTER TABLE credit_card RENAME COLUMN "gocardlessAccountId" TO "externalAccountId";
ALTER TABLE transaction RENAME COLUMN "transactionIdOpenBankAPI" TO "externalTransactionId";

-- Add provider tracking
ALTER TABLE bank_account ADD COLUMN "provider" VARCHAR(50) DEFAULT 'gocardless';
ALTER TABLE credit_card ADD COLUMN "provider" VARCHAR(50) DEFAULT 'gocardless';
```

#### 1.2 Direct Service Dependencies

**Impact:** 🔴 High - Direct coupling throughout transaction services

**Problem Areas:**
- **TransactionsService** directly injects `GocardlessService` (src/transactions/transactions.service.ts:68)
- **TransactionImportService** directly injects `GocardlessService` (src/transactions/transaction-import.service.ts:42)
- Hardcoded API endpoint in service: `https://bankaccountdata.gocardless.com/api/v2`

**Current Pattern (Problematic):**
```typescript
constructor(
  private gocardlessService: GocardlessService,
  // other dependencies
) {}
```

**Needed Pattern:**
```typescript
constructor(
  @Inject('BANKING_PROVIDER') private bankingProvider: IBankingProvider,
  // other dependencies
) {}
```

#### 1.3 Module Size and Complexity

**Impact:** 🟡 Medium - Large amount of provider-specific code

**GoCardless-Specific Code:**
- Entire `src/gocardless/` module (8 files)
  - `gocardless.service.ts` (~22,000 lines)
  - `gocardless.controller.ts`
  - `gocardless-scheduler.service.ts`
  - `gocardless-cron.controller.ts`
  - DTOs and module configuration
- `src/transactions/parsers/gocardless.parser.ts` (8,720 lines)
- `.github/workflows/daily-bank-sync.yml`

**Total Provider-Specific Code:** ~30,000 lines

---

### 2. MODERATE COUPLING (Moderately Easy to Replace)

#### 2.1 Parser Abstraction

**Impact:** 🟢 Low - Good abstraction exists

**Current Architecture:**
- **BankFileParserFactory** provides factory pattern (src/transactions/parsers/bank-file-parser.factory.ts)
- **BaseParser** abstract class for all parsers (src/transactions/parsers/base-parser.ts)
- Multiple parser implementations:
  - Fineco, BNL (XLS & TXT), WeBank, CartaImpronta, PayPal
  - GocardlessParser is one implementation among many

**Strength:** ✅ Parser abstraction is well-designed. Adding a new Open Banking provider parser would follow existing patterns seamlessly.

**Example Pattern:**
```typescript
// src/transactions/parsers/bank-file-parser.factory.ts
export class BankFileParserFactory {
  static getParser(format: string): BaseParser {
    switch (format) {
      case 'fineco': return new FinecoParser();
      case 'gocardless': return new GocardlessParser();
      case 'plaid': return new PlaidParser(); // Easy to add
      // ...
    }
  }
}
```

#### 2.2 Sync History Module

**Impact:** 🟢 Low - Already provider-agnostic

**Current Design:**
- **SyncHistoryModule** tracks sync operations generically
- Loosely coupled via module imports
- Data structures are provider-neutral

**Required Changes:**
- Minor terminology adjustments
- Update logging messages
- No structural changes needed

---

### 3. LOOSE COUPLING (Easy to Replace)

#### 3.1 Cron Scheduling

**Impact:** 🟢 Very Low - Provider-agnostic design

**Current Implementation:**
- **GocardlessCronController** uses generic authentication (x-cron-secret header)
- **GocardlessSchedulerService.dailyBankSync()** is just a method name
- GitHub Actions workflow triggers generic HTTP endpoint

**Required Changes:**
```typescript
// Before
@Post('daily-bank-sync')
async triggerDailyBankSync() {
  await this.schedulerService.dailyBankSync();
}

// After
@Post('daily-bank-sync')
async triggerDailyBankSync() {
  await this.bankingSyncScheduler.syncAllAccounts();
}
```

#### 3.2 Module Boundaries

**Impact:** 🟢 Very Low - Excellent isolation

**Current Structure:**
```typescript
// src/gocardless/gocardless.module.ts
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([BankAccount, CreditCard, User]),
    SyncHistoryModule,
  ],
  controllers: [GocardlessController, GocardlessCronController],
  providers: [GocardlessService, GocardlessSchedulerService],
  exports: [GocardlessService],
})
export class GocardlessModule {}
```

**Strength:** ✅ Clean module boundaries. Could replace entire module without affecting other parts of the application.

---

## Architecture Assessment

### Positive Patterns

#### 1. Parser Factory Pattern
**Score:** ✅ Excellent

The parser factory allows seamless addition of new bank formats and providers:
- Clear abstraction with BaseParser
- Factory pattern for instantiation
- Multiple working implementations
- Easy to extend without modifying existing code

#### 2. Module Isolation
**Score:** ✅ Excellent

GocardlessModule is properly encapsulated:
- Clear import/export boundaries
- No circular dependencies
- Self-contained configuration
- Easy to replace as a unit

#### 3. Repository Pattern
**Score:** ✅ Excellent

Database access abstracted via TypeORM:
- No raw SQL queries in GoCardless code
- Entity-based operations
- Easy to mock in tests
- Provider-agnostic data access

#### 4. Event-Driven Architecture
**Score:** 🟡 Good but underutilized

Event system exists but not fully leveraged:
- Events defined in `src/shared/events/`
- EventPublisherService available
- Could reduce coupling further if used more extensively

#### 5. Cron Abstraction
**Score:** ✅ Excellent

Generic webhook pattern for scheduled operations:
- Provider-agnostic authentication
- HTTP endpoint can trigger any service
- GitHub Actions workflow easily reconfigurable

### Architectural Weaknesses

#### 1. Missing Provider Abstraction
**Score:** ❌ Critical Gap

**Problem:** No `IBankingProvider` interface exists

**Impact:** Direct dependencies on GocardlessService throughout codebase

**Solution:**
```typescript
// src/banking/interfaces/banking-provider.interface.ts
export interface IBankingProvider {
  // Institution discovery
  getInstitutions(country: string): Promise<Institution[]>;

  // Account linking
  createAgreement(dto: CreateAgreementDto): Promise<Agreement>;
  createRequisition(dto: CreateRequisitionDto): Promise<Requisition>;

  // Data retrieval
  getAccountDetails(accountId: string): Promise<AccountDetails>;
  getAccountBalances(accountId: string): Promise<AccountBalance[]>;
  getAccountTransactions(
    accountId: string,
    options: TransactionQueryOptions
  ): Promise<Transaction[]>;

  // Bulk operations
  importAllConnectedAccounts(
    userId: number,
    options: ImportOptions
  ): Promise<ImportResult>;

  // Account management
  syncAccountBalances(userId: number): Promise<SyncResult>;
}
```

#### 2. Provider-Specific Field Names
**Score:** ⚠️ Moderate Issue

**Problem:** Database fields have "gocardless" in their names

**Impact:** Code semantically tied to specific provider

**Solution:** Rename to generic equivalents:
- `gocardlessAccountId` → `externalAccountId`
- `transactionIdOpenBankAPI` → `externalTransactionId`
- Add `provider` field to track which service

#### 3. Direct Service Injection
**Score:** ⚠️ Moderate Issue

**Problem:** Services inject `GocardlessService` directly instead of interface

**Impact:** Cannot swap providers without code changes

**Solution:** Use dependency injection with interface:
```typescript
// Before
constructor(private gocardlessService: GocardlessService) {}

// After
constructor(
  @Inject('BANKING_PROVIDER')
  private bankingProvider: IBankingProvider
) {}
```

---

## Replacement Strategy

### Phase 1: Create Abstraction Layer (2-3 weeks)

**Objective:** Introduce provider abstraction without breaking existing functionality

#### 1.1 Define IBankingProvider Interface
**Duration:** 2-3 days

Create comprehensive interface covering all banking operations:
```typescript
// src/banking/interfaces/banking-provider.interface.ts
export interface IBankingProvider {
  readonly providerName: string;

  // Configuration
  initialize(config: BankingProviderConfig): Promise<void>;

  // Institution discovery
  getInstitutions(country: string): Promise<Institution[]>;
  getInstitution(id: string): Promise<Institution>;

  // Agreement management
  createEndUserAgreement(dto: CreateAgreementDto): Promise<Agreement>;
  getAgreement(id: string): Promise<Agreement>;

  // Requisition (account linking)
  createRequisition(dto: CreateRequisitionDto): Promise<Requisition>;
  getRequisition(id: string): Promise<Requisition>;

  // Account operations
  getAccountDetails(accountId: string): Promise<AccountDetails>;
  getAccountBalances(accountId: string): Promise<AccountBalance[]>;
  getAccountTransactions(
    accountId: string,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<BankTransaction[]>;

  // Bulk operations
  importAllConnectedAccounts(
    userId: number,
    options: ImportOptions
  ): Promise<ImportResult>;

  syncAccountBalances(userId: number): Promise<SyncResult>;
}
```

#### 1.2 Create GocardlessAdapter
**Duration:** 3-5 days

Wrap existing GocardlessService to implement interface:
```typescript
// src/banking/providers/gocardless/gocardless.adapter.ts
@Injectable()
export class GocardlessAdapter implements IBankingProvider {
  readonly providerName = 'gocardless';

  constructor(private gocardlessService: GocardlessService) {}

  async getInstitutions(country: string): Promise<Institution[]> {
    return this.gocardlessService.getInstitutions(country);
  }

  async importAllConnectedAccounts(
    userId: number,
    options: ImportOptions
  ): Promise<ImportResult> {
    return this.gocardlessService.importAllConnectedAccounts(userId, options);
  }

  // Implement remaining interface methods...
}
```

#### 1.3 Create Provider Factory
**Duration:** 2-3 days

Factory to instantiate correct provider:
```typescript
// src/banking/banking-provider.factory.ts
@Injectable()
export class BankingProviderFactory {
  constructor(
    private configService: ConfigService,
    private gocardlessAdapter: GocardlessAdapter,
    // Future providers injected here
  ) {}

  getProvider(providerType?: BankingProviderType): IBankingProvider {
    const type = providerType || this.getDefaultProvider();

    switch (type) {
      case 'gocardless':
        return this.gocardlessAdapter;
      case 'plaid':
        return this.plaidAdapter; // Future
      case 'tink':
        return this.tinkAdapter; // Future
      default:
        throw new Error(`Unknown banking provider: ${type}`);
    }
  }

  private getDefaultProvider(): BankingProviderType {
    return this.configService.get<BankingProviderType>(
      'DEFAULT_BANKING_PROVIDER',
      'gocardless'
    );
  }
}
```

### Phase 2: Database Schema Generalization (1-2 weeks)

**Objective:** Remove provider-specific field names from database

#### 2.1 Create Migration Scripts
**Duration:** 2-3 days

```typescript
// src/migrations/1747200000000-GeneralizeBankingProviderFields.ts
export class GeneralizeBankingProviderFields1747200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename columns to generic names
    await queryRunner.renameColumn('bank_account', 'gocardlessAccountId', 'externalAccountId');
    await queryRunner.renameColumn('credit_card', 'gocardlessAccountId', 'externalAccountId');
    await queryRunner.renameColumn('transaction', 'transactionIdOpenBankAPI', 'externalTransactionId');

    // Add provider tracking
    await queryRunner.addColumn('bank_account', new TableColumn({
      name: 'provider',
      type: 'varchar',
      length: '50',
      default: "'gocardless'",
    }));

    await queryRunner.addColumn('credit_card', new TableColumn({
      name: 'provider',
      type: 'varchar',
      length: '50',
      default: "'gocardless'",
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback logic
    await queryRunner.dropColumn('bank_account', 'provider');
    await queryRunner.dropColumn('credit_card', 'provider');

    await queryRunner.renameColumn('bank_account', 'externalAccountId', 'gocardlessAccountId');
    await queryRunner.renameColumn('credit_card', 'externalAccountId', 'gocardlessAccountId');
    await queryRunner.renameColumn('transaction', 'externalTransactionId', 'transactionIdOpenBankAPI');
  }
}
```

#### 2.2 Update Entity Classes
**Duration:** 2-3 days

Update all 27 files that reference the old field names:
```typescript
// Before
@Column({ nullable: true })
gocardlessAccountId: string;

// After
@Column({ nullable: true })
externalAccountId: string;

@Column({ default: 'gocardless' })
provider: string;
```

#### 2.3 Update Service References
**Duration:** 3-5 days

Search and replace across codebase with careful testing:
```bash
# Find all references
grep -r "gocardlessAccountId" src/
grep -r "transactionIdOpenBankAPI" src/

# Update references in 27 files
```

### Phase 3: Refactor Service Dependencies (1-2 weeks)

**Objective:** Replace direct GocardlessService injections with factory pattern

#### 3.1 Update TransactionsService
**Duration:** 2-3 days

```typescript
// Before
constructor(
  private gocardlessService: GocardlessService,
  // other dependencies
) {}

// After
constructor(
  private bankingProviderFactory: BankingProviderFactory,
  // other dependencies
) {}

// Usage
async importFromProvider(userId: number, accountId: string) {
  const account = await this.getAccount(accountId);
  const provider = this.bankingProviderFactory.getProvider(account.provider);
  return provider.importAllConnectedAccounts(userId, options);
}
```

#### 3.2 Update TransactionImportService
**Duration:** 2-3 days

Similar refactoring pattern as TransactionsService

#### 3.3 Update Controllers
**Duration:** 1-2 days

Controllers should remain largely unchanged but may need minor adjustments:
```typescript
// Minimal changes needed if using service layer properly
@Controller('banking')
export class BankingController {
  constructor(private transactionsService: TransactionsService) {}

  // Endpoints remain the same, service handles provider selection
}
```

### Phase 4: Implement New Provider (2-4 weeks)

**Objective:** Add support for new banking provider (e.g., Plaid, Tink, TrueLayer)

#### 4.1 Create Provider Service
**Duration:** 1-2 weeks

Implement new provider following IBankingProvider interface:
```typescript
// src/banking/providers/plaid/plaid.service.ts
@Injectable()
export class PlaidService implements IBankingProvider {
  readonly providerName = 'plaid';
  private client: PlaidClient;

  constructor(private configService: ConfigService) {
    this.client = new PlaidClient({
      clientId: this.configService.get('PLAID_CLIENT_ID'),
      secret: this.configService.get('PLAID_SECRET'),
      env: this.configService.get('PLAID_ENV'),
    });
  }

  async getInstitutions(country: string): Promise<Institution[]> {
    const response = await this.client.institutionsGet({ country_codes: [country] });
    return this.mapPlaidInstitutions(response.institutions);
  }

  // Implement all interface methods...
}
```

#### 4.2 Create Provider Parser
**Duration:** 3-5 days

Add parser for new provider's transaction format:
```typescript
// src/transactions/parsers/plaid.parser.ts
export class PlaidParser extends BaseParser {
  parse(data: PlaidTransaction[]): ParsedTransaction[] {
    return data.map(tx => this.mapPlaidTransaction(tx));
  }

  private mapPlaidTransaction(tx: PlaidTransaction): ParsedTransaction {
    return {
      externalTransactionId: tx.transaction_id,
      description: tx.name,
      amount: tx.amount,
      date: new Date(tx.date),
      merchantName: tx.merchant_name,
      // Map other fields...
    };
  }
}
```

#### 4.3 Update Factory
**Duration:** 1 day

Add new provider to factory:
```typescript
case 'plaid':
  return this.plaidAdapter;
```

#### 4.4 Configuration & Testing
**Duration:** 3-5 days

- Add environment variables
- Test institution discovery
- Test account linking flow
- Test transaction import
- Integration tests with provider API

### Phase 5: Migration & Cleanup (1 week)

**Objective:** Finalize transition and remove old code if fully migrating

#### 5.1 Run Database Migrations
**Duration:** 1 day

```bash
npm run migration:run
```

Verify in production:
- Check field renames
- Validate provider column populated
- Test queries work with new schema

#### 5.2 Update API Documentation
**Duration:** 1-2 days

- Update Swagger docs
- Update README
- Update API examples
- Update environment variable docs

#### 5.3 Update Cron Configuration
**Duration:** 1 day

```yaml
# .github/workflows/daily-bank-sync.yml
name: Daily Bank Sync
on:
  schedule:
    - cron: '0 9 * * *'
jobs:
  trigger-sync:
    steps:
      - name: Trigger Bank Sync
        run: |
          curl -X POST \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}" \
            https://api.coffeebudget.app/cron/daily-bank-sync
```

#### 5.4 Clean Up Old Code (Optional)
**Duration:** 1-2 days

If fully replacing GoCardless:
- Remove GocardlessService
- Remove GocardlessModule
- Remove GoCardless-specific tests
- Archive documentation

---

## Readiness Scorecard

| Component | Current Status | Readiness | Priority |
|-----------|---------------|-----------|----------|
| **Module Isolation** | ✅ Excellent | 95% | Low |
| **Parser Abstraction** | ✅ Excellent | 95% | Low |
| **Database Schema** | 🟡 Provider-specific names | 40% | High |
| **Service Coupling** | 🟡 Direct dependencies | 35% | High |
| **Provider Interface** | ❌ Missing | 0% | Critical |
| **Configuration Management** | ✅ Good | 85% | Low |
| **Test Infrastructure** | ✅ Excellent | 90% | Low |
| **Event Architecture** | 🟡 Underutilized | 60% | Medium |
| **Cron Abstraction** | ✅ Excellent | 95% | Low |
| **Documentation** | ✅ Good | 80% | Low |

**Overall Readiness: 60-70%**

### Critical Gaps (Must Fix Before Replacement)

1. **IBankingProvider Interface** - Foundation for all provider abstraction
2. **Database Field Names** - Remove provider-specific terminology
3. **Service Injection Pattern** - Use factory instead of direct injection

### Nice to Have (Can Fix During Replacement)

4. Event-driven service communication
5. Enhanced configuration management
6. Provider-specific error handling
7. Performance monitoring per provider

---

## Recommendations

### Immediate Actions (Even Without Replacement Plans)

These improvements have **zero impact** on current functionality but prepare for future flexibility:

#### 1. Create IBankingProvider Interface
**Effort:** 1-2 days
**Risk:** None
**Benefit:** Foundation for all future work

```typescript
// Create interface definition
// Document expected behavior
// No implementation changes needed yet
```

#### 2. Rename Database Fields
**Effort:** 2-3 days
**Risk:** Low (with proper migration testing)
**Benefit:** Semantic clarity, future-proofing

```sql
-- Migration script with rollback capability
-- Test in development first
-- Apply during low-traffic window
```

#### 3. Implement GocardlessAdapter
**Effort:** 3-5 days
**Risk:** None (wrapper pattern)
**Benefit:** Proves interface design, enables gradual refactoring

```typescript
// Wrapper around existing service
// No functionality changes
// Validates interface design
```

#### 4. Add Provider Column
**Effort:** 1 day
**Risk:** None
**Benefit:** Track provider per account, enable multi-provider support

```sql
ALTER TABLE bank_account ADD COLUMN provider VARCHAR(50) DEFAULT 'gocardless';
```

**Total Immediate Investment:** 1-2 weeks
**Result:** Readiness increases from 60% to 90%

### When Actually Replacing

With the above improvements in place:

**Estimated Timeline:**
- New provider implementation: 2-4 weeks
- Testing and validation: 1-2 weeks
- Gradual rollout: 1-2 weeks
- **Total: 4-8 weeks** (down from 7-12 weeks)

**Risk Level:** Low to Medium (vs Current: Medium to High)

---

## Multi-Provider Strategy

### Benefits of Supporting Multiple Providers

Instead of replacing GoCardless entirely, consider supporting multiple providers simultaneously:

#### Geographic Coverage
- **GoCardless** - Strong in Europe (EU PSD2 Open Banking)
- **Plaid** - Dominant in US and Canada
- **Tink** - Best for Nordic countries
- **TrueLayer** - Good UK coverage

#### Risk Diversification
- Provider downtime doesn't affect all users
- API changes from one provider are isolated
- Can switch default provider if needed
- Better negotiating position with providers

#### Feature Optimization
- Use provider with best features per market
- Optimize costs per region
- Better transaction data from native providers

### Implementation Pattern

```typescript
// User can connect multiple accounts from different providers
const user = {
  accounts: [
    { id: 1, provider: 'gocardless', externalId: 'gc_123' },
    { id: 2, provider: 'plaid', externalId: 'plaid_456' },
    { id: 3, provider: 'gocardless', externalId: 'gc_789' },
  ]
};

// Service layer handles provider selection automatically
async syncAccount(accountId: number) {
  const account = await this.getAccount(accountId);
  const provider = this.factory.getProvider(account.provider);
  return provider.syncAccountBalances(account.userId);
}
```

### Migration Path

1. **Phase 1:** Implement provider abstraction (1-2 weeks)
2. **Phase 2:** Add second provider (Plaid for US users) (3-4 weeks)
3. **Phase 3:** Test dual-provider setup (1-2 weeks)
4. **Phase 4:** Gradually onboard users to new provider (ongoing)
5. **Phase 5:** Evaluate GoCardless retention vs full migration (3-6 months later)

---

## Conclusion

### Current State

The Coffee Budget backend is **60-70% ready** for GoCardless replacement. The codebase demonstrates:

**Strengths:**
- Excellent module isolation
- Strong parser abstraction
- Good testing infrastructure
- Clean repository pattern
- Provider-agnostic cron scheduling

**Weaknesses:**
- No provider interface abstraction
- Provider-specific database field names
- Direct service dependencies
- Limited use of event architecture

### Path Forward

**Conservative Approach (Recommended):**
1. Implement immediate improvements (1-2 weeks)
2. Increase readiness to 90%
3. Evaluate actual need for replacement
4. Consider multi-provider strategy
5. Implement new provider if needed (4-6 weeks)

**Aggressive Approach:**
1. Start replacement immediately (7-12 weeks)
2. Refactor during implementation
3. Higher risk but faster timeline
4. More technical debt during transition

### Final Assessment

**You are NOT fully ready today, but the foundation is solid.**

With 1-2 weeks of preparatory refactoring, replacement becomes significantly easier, less risky, and more maintainable. The recommended approach is to implement the abstraction layer now (even without immediate replacement plans), as it:

- Has zero impact on current functionality
- Dramatically reduces future replacement effort
- Enables multi-provider support
- Improves code maintainability
- Provides architectural flexibility

**Recommendation:** Implement IBankingProvider interface and database field generalization in next sprint, then reassess replacement needs.

---

## Appendix

### Files Requiring Changes for Replacement

**Core Services (3 files):**
- `src/transactions/transactions.service.ts`
- `src/transactions/transaction-import.service.ts`
- `src/gocardless/gocardless.service.ts` (wrap or replace)

**Entity Classes (3 files):**
- `src/bank-accounts/entities/bank-account.entity.ts`
- `src/credit-cards/entities/credit-card.entity.ts`
- `src/transactions/transaction.entity.ts`

**Migration Files (2 files):**
- `src/migrations/1717000000000-AddGocardlessAccountId.ts` (reference)
- `src/migrations/[new]-GeneralizeBankingProviderFields.ts` (create)

**References to Update (27 files total):**
Use `grep -r "gocardlessAccountId\|transactionIdOpenBankAPI" src/` to find all

### Glossary

- **IBankingProvider** - Proposed interface for banking provider abstraction
- **Adapter Pattern** - Wrapper pattern to make existing service conform to interface
- **Factory Pattern** - Design pattern for creating objects (providers) without specifying exact class
- **PSD2** - European Payment Services Directive 2 (enables Open Banking in EU)
- **Open Banking** - Secure way for third parties to access financial data with user consent

### References

- GoCardless Documentation: https://nordigen.com/en/account_information_documenation/integration/quickstart_guide/
- Plaid Documentation: https://plaid.com/docs/
- Tink Documentation: https://docs.tink.com/
- TrueLayer Documentation: https://docs.truelayer.com/

---

**Document Version:** 1.0
**Last Updated:** 2025-12-09
**Next Review:** After implementation of recommended improvements
