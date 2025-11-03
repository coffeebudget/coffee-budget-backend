# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NestJS backend API for Coffee Budget - a personal finance application with intelligent transaction categorization, bank integration, and duplicate detection.

**Tech Stack:**
- NestJS 11+ with TypeScript 5.7+
- TypeORM 0.3.20 with PostgreSQL
- Passport JWT authentication (Auth0)
- EventEmitter2 for event-driven architecture
- Jest for testing with comprehensive mocking

## Development Commands

```bash
npm run start:dev           # Start in watch mode (port 3002)
npm run build              # Build for production
npm test                   # Run all tests
npm run test:watch         # Run tests in watch mode
npm run test:cov           # Run tests with coverage report
npm run test:debug         # Debug tests with Node inspector
npm run lint               # Lint and fix TypeScript files
npm run format             # Format code with Prettier

# Run single test file
npm test -- src/transactions/transactions.service.spec.ts

# Run tests matching pattern
npm test -- --testNamePattern="should create transaction"
```

## Architecture Overview

### Event-Driven Architecture (CRITICAL)

**NEVER use `forwardRef()` for circular dependencies - ALWAYS use events instead.**

This backend is built on an event-driven architecture to maintain loose coupling and prevent circular dependencies.

**Event Infrastructure:**
- `src/shared/events/base.event.ts` - BaseEventClass for all events
- `src/shared/events/event-publisher.service.ts` - EventPublisherService for publishing
- `src/shared/events/base.event-handler.ts` - BaseEventHandler for handling

**Event Pattern:**
```typescript
// 1. Define Event (in src/shared/events/)
export class TransactionCreatedEvent extends BaseEventClass {
  constructor(public readonly transaction: Transaction, userId: number) {
    super(userId);
  }
}

// 2. Publish Event (in service)
constructor(private eventPublisher: EventPublisherService) {}

async createTransaction(data: CreateTransactionDto) {
  const transaction = await this.repository.save(data);
  this.eventPublisher.publish(new TransactionCreatedEvent(transaction, userId));
  return transaction;
}

// 3. Handle Event (in consuming module)
@OnEvent('TransactionCreatedEvent')
async handleTransactionCreated(event: TransactionCreatedEvent): Promise<void> {
  // Handle event without direct service dependency
}
```

**Existing Events:**
- TransactionCreatedEvent
- BankAccountCreatedEvent/UpdatedEvent/DeletedEvent
- CategoryCreatedEvent/UpdatedEvent/DeletedEvent

**8 Event Handlers across modules:**
- PendingDuplicatesModule → Handles Transaction, BankAccount events
- RecurringTransactionsModule → Handles Transaction, Category events
- CategoriesModule → Handles Transaction events
- TagsModule → Handles Transaction events
- TransactionsModule → Handles BankAccount, Category events

### Module Structure

```
src/
├── main.ts                          # Bootstrap, Swagger at /api/docs
├── app.module.ts                    # Root module
├── auth/                            # JWT authentication strategy
├── users/                           # User management
├── transactions/                    # Core transaction module (largest)
│   ├── transactions.service.ts     # Main orchestrator (~1780 lines)
│   ├── transaction-*.service.ts    # Specialized services
│   ├── controllers/                # Multiple controllers
│   ├── dto/                        # Request/response DTOs
│   ├── entities/                   # TypeORM entities
│   └── parsers/                    # Bank-specific CSV parsers
├── categories/                      # Category & keyword management
├── tags/                           # Transaction tagging
├── bank-accounts/                  # Bank account management
├── credit-cards/                   # Credit card tracking
├── recurring-transactions/         # Pattern detection
├── pending-duplicates/             # Duplicate detection
├── prevented-duplicates/           # Duplicate prevention tracking
├── gocardless/                     # GoCardless API integration (~22k lines)
├── merchant-categorization/        # Merchant data enrichment
├── ai/                            # OpenAI integration
├── dashboard/                      # Analytics endpoints
├── shared/                         # Shared utilities & events
├── config/                         # Configuration modules
├── migrations/                     # Database migrations
├── enums/                          # Shared enums
└── utils/                          # Utility functions
```

## Key Services & Responsibilities

### TransactionsService (Main Orchestrator)
**Location:** `src/transactions/transactions.service.ts`

Currently ~1780 lines (Phase 2 refactoring in progress to break up).

**Delegates to specialized services:**
- **TransactionCreationService** - Creating transactions
- **TransactionImportService** - CSV import processing
- **TransactionCategorizationService** - Keyword-based categorization
- **TransactionBulkService** - Bulk operations
- **TransactionDuplicateService** - Duplicate detection
- **TransactionOperationsService** - Update/delete operations

### CategoriesService
**Location:** `src/categories/categories.service.ts`

**Responsibilities:**
- Keyword-based categorization logic
- Multi-word vs single-word keyword matching
- Confidence scoring for matches
- Budget management
- Expense analysis and analytics exclusion

**Categorization Algorithm:**
- Multi-word keywords: Exact phrase match required
- Single-word keywords: Can match partial words
- Case-insensitive matching
- Confidence levels based on match quality

### GocardlessService
**Location:** `src/gocardless/gocardless.service.ts`

**Responsibilities:**
- GoCardless Open Banking API integration
- Bank account synchronization
- Transaction import from banks
- Webhook event handling
- Requisition management

~22,000 lines - handles complex financial data flows.

### PendingDuplicatesService
**Location:** `src/pending-duplicates/pending-duplicates.service.ts`

**Duplicate Detection Algorithm:**
- **Amount similarity: 30%** - Must match exactly
- **Type similarity: 10%** - Expense vs Income
- **Description similarity: 40%** - Levenshtein distance
- **Date similarity: 20%** - Days difference (within 7 days max)
- **Confidence levels:** High (≥85%), Medium (70-84%), Low (<70%)

### RecurringTransactionsService
**Location:** `src/recurring-transactions/recurring-transactions.service.ts`

**Pattern Detection:**
- Identifies recurring payments (subscriptions, bills)
- Analytics-only (no automatic creation)
- Pattern recognition based on amount and date intervals

## Database Configuration

**Location:** `src/config/database.config.ts`

Supports two connection methods:

1. **DATABASE_URL** (single connection string - Railway default)
   ```
   postgresql://user:password@host:port/database
   ```

2. **Individual credentials:**
   ```
   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
   ```

**Railway Template Variable Handling:**
- Detects and handles `${{...}}` template variables gracefully
- Extensive debug logging for connection issues
- Production safety: `synchronize: false` in production

### Migrations

```bash
# Generate migration after entity changes
npm run migration:generate -- -n MigrationName

# Run pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

Migrations located in `src/migrations/`.

## Test-Driven Development (TDD)

**MANDATORY: Write tests BEFORE implementation.**

### TDD Workflow

1. **RED**: Write failing test that defines desired behavior
2. **GREEN**: Write minimal code to make test pass
3. **REFACTOR**: Improve code while keeping tests green
4. **Repeat**: Continue with next behavior

**Current Status:**
- 29/29 test suites passing (100%)
- 145/145 individual tests passing (100%)
- Overall coverage: ~37% (target: 75%+)
- New code target: 90%+ coverage

### Testing Standards

**ALWAYS use RepositoryMockFactory for repository mocks:**

```typescript
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';

const module: TestingModule = await Test.createTestingModule({
  providers: [
    ServiceName,
    RepositoryMockFactory.createRepositoryProvider(Transaction),
    RepositoryMockFactory.createRepositoryProvider(BankAccount),
    // Other dependencies
  ],
}).compile();
```

**Complete entity mocks with ALL required properties:**

```typescript
const mockUser = {
  id: 1,
  auth0Id: 'auth0|123456',
  email: 'test@example.com',
  isDemoUser: false,
  demoExpiryDate: new Date('2024-12-31'),
  demoActivatedAt: new Date('2024-01-01'),
  bankAccounts: [],
  creditCards: [],
  transactions: [],
  tags: [],
  categories: [],
  recurringTransactions: [],
} as User;
```

**Mock EventPublisherService for services that publish events:**

```typescript
{
  provide: EventPublisherService,
  useValue: {
    publish: jest.fn(),
  },
}
```

**Test Structure (AAA Pattern):**

```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  let repository: Repository<Entity>;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ServiceName,
        RepositoryMockFactory.createRepositoryProvider(Entity),
      ],
    }).compile();

    service = module.get<ServiceName>(ServiceName);
    repository = module.get(getRepositoryToken(Entity));
  });

  afterEach(async () => {
    await module.close();
  });

  describe('methodName', () => {
    it('should handle success case', async () => {
      // Arrange
      const input = { /* test data */ };
      (repository.save as jest.Mock).mockResolvedValue(mockEntity);

      // Act
      const result = await service.methodName(input);

      // Assert
      expect(result).toEqual(mockEntity);
      expect(repository.save).toHaveBeenCalledWith(input);
    });

    it('should throw error when entity not found', async () => {
      // Arrange
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.methodName(1)).rejects.toThrow('Entity not found');
    });
  });
});
```

## NestJS Patterns

### Service Layer Pattern
```typescript
@Injectable()
export class MyService {
  constructor(
    @InjectRepository(Entity)
    private readonly repository: Repository<Entity>,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  async createEntity(dto: CreateDto, userId: number): Promise<Entity> {
    const entity = this.repository.create({ ...dto, userId });
    const saved = await this.repository.save(entity);
    this.eventPublisher.publish(new EntityCreatedEvent(saved, userId));
    return saved;
  }
}
```

### Controller Pattern
```typescript
@Controller('entities')
@UseGuards(JwtAuthGuard)
export class MyController {
  constructor(private readonly service: MyService) {}

  @Get()
  async findAll(@User() user: UserPayload) {
    return this.service.findAll(user.userId);
  }

  @Post()
  async create(@Body() dto: CreateDto, @User() user: UserPayload) {
    return this.service.create(dto, user.userId);
  }
}
```

### DTO Validation
```typescript
import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTransactionDto {
  @ApiProperty({ description: 'Transaction description' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Transaction amount' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  categoryId?: number;
}
```

## Security & Authentication

### JWT Authentication
- **Strategy:** Passport JWT in `src/auth/jwt.strategy.ts`
- **Provider:** Auth0 with JWKS validation
- **Guard:** Applied globally via `@UseGuards(JwtAuthGuard)`
- **User Decorator:** `@User()` extracts user from JWT payload

### User Isolation
**CRITICAL: All queries MUST filter by authenticated user's auth0Id.**

```typescript
// ✅ Correct - user isolated
const transactions = await this.repository.find({
  where: { userId: user.userId },
});

// ❌ Wrong - no user isolation
const transactions = await this.repository.find();
```

### Security Measures
- **Rate Limiting:** 100 requests/minute (ThrottlerModule)
- **Helmet.js:** Security headers configured in main.ts
- **CORS:** Environment-aware configuration
- **Input Validation:** class-validator on all DTOs
- **SQL Injection:** TypeORM parameterized queries

## API Documentation

Swagger/OpenAPI available at: **http://localhost:3002/api/docs**

Configured in `src/main.ts` with:
- API grouping by module
- DTO schemas
- JWT authentication decorator
- Response examples

## Common Patterns

### Creating New Feature Module

1. Generate module:
   ```bash
   nest g module features/my-feature
   nest g service features/my-feature
   nest g controller features/my-feature
   ```

2. Create entity in `features/my-feature/entities/`
3. Create DTOs in `features/my-feature/dto/`
4. Import TypeORM repository in module
5. Add to `app.module.ts` imports
6. **Write tests FIRST** using RepositoryMockFactory
7. Implement service methods
8. Add controller endpoints
9. Publish events if other modules need to react

### Refactoring Services

When breaking up large services:
1. Identify logical responsibility boundaries
2. Extract new service with focused responsibility
3. Update dependency injection
4. **Replace direct dependencies with events** where possible
5. Update tests for both services
6. Verify 100% test success rate
7. Update documentation

## Environment Variables

Required in `.env.development`:
```bash
# Database (use ONE method)
DATABASE_URL=postgresql://user:pass@localhost:5432/coffeebudget
# OR
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=coffeebudget

# Auth0
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://your-api-identifier

# GoCardless (optional)
GOCARDLESS_SECRET_ID=your-secret-id
GOCARDLESS_SECRET_KEY=your-secret-key

# OpenAI (optional)
OPENAI_API_KEY=sk-...
```

## Current Development Phase

**Phase 2: Refactoring TransactionsService**
- Breaking up 1780-line "god service"
- Extracting specialized services
- Maintaining 100% test success rate
- Using events to prevent circular dependencies
- Target: 90%+ coverage on refactored code

**Phase 1: COMPLETED**
- Testing foundation established
- RepositoryMockFactory implemented
- 100% test success rate achieved
- Comprehensive documentation created

## Common Issues & Solutions

### Circular Dependency Error
**Solution:** Use events, not direct service dependencies. Replace:
```typescript
// ❌ Creates circular dependency
constructor(private readonly otherService: OtherService) {}
```
With:
```typescript
// ✅ Use events
constructor(private readonly eventPublisher: EventPublisherService) {}
this.eventPublisher.publish(new MyEvent(data, userId));
```

### Test Failures with Repository Mocks
**Solution:** Always use RepositoryMockFactory, ensure all entity properties are mocked.

### Database Connection Issues on Railway
**Solution:** Check `src/config/database.config.ts` logs. Railway uses DATABASE_URL with template variables that need special handling.

## Important Files

- `src/main.ts` - Application bootstrap, middleware, Swagger
- `src/app.module.ts` - Root module with all feature imports
- `src/config/database.config.ts` - Database connection with Railway support
- `src/shared/events/` - Event infrastructure
- `src/test/test-utils/repository-mocks.ts` - RepositoryMockFactory
- `.cursorrules` - Development guidelines and TDD workflow

## Documentation

Refer to `../docs/` directory:
- `development/` - Testing standards, TDD guidelines
- `features/` - Feature-specific documentation
- `integrations/` - GoCardless integration details
- `security/` - Security implementation guide
