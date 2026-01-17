# CLAUDE.md - Coffee Budget Backend

NestJS API for Coffee Budget - personal finance with intelligent categorization.

> **Full Documentation**: `../docs/` (architecture, deployment, features)
> **Quick References**: `../docs/claude-context/BACKEND-PATTERNS.md`

## Quick Start

```bash
npm run start:dev      # Dev server (port 3002)
npm test               # Run all tests
npm run test:watch     # Watch mode
npm run test:cov       # Coverage report
npm run lint           # Lint & fix
```

## Critical Rules

1. **NEVER use `forwardRef()`** → Use events for cross-module communication
2. **Always filter by userId** → User isolation is mandatory
3. **TDD always** → Write tests BEFORE implementation
4. **Use RepositoryMockFactory** → Standard test mocking pattern

## Event-Driven Architecture

```typescript
// Publishing events (in service)
this.eventPublisher.publish(new TransactionCreatedEvent(transaction, userId));

// Handling events (in consuming module)
@OnEvent('TransactionCreatedEvent')
async handleTransactionCreated(event: TransactionCreatedEvent) { }
```

**Event files**: `src/shared/events/`

## Testing Pattern

```typescript
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';

const module = await Test.createTestingModule({
  providers: [
    ServiceName,
    RepositoryMockFactory.createRepositoryProvider(Entity),
    { provide: EventPublisherService, useValue: { publish: jest.fn() } },
  ],
}).compile();
```

**Status**: 145/145 tests passing (100%)

## Key Modules

| Module | Purpose |
|--------|---------|
| `transactions/` | Core transaction management (~1780 lines, refactoring in progress) |
| `categories/` | Keyword-based categorization |
| `expense-plans/` | Virtual envelope budgeting |
| `smart-recurrence/` | AI-powered expense plan suggestions |
| `gocardless/` | Open Banking integration |
| `pending-duplicates/` | Duplicate detection |

## Database

```bash
npm run migration:generate -- -n Name  # Generate migration
npm run migration:run                   # Run migrations
npm run migration:revert                # Revert last
```

## API Docs

Swagger: http://localhost:3002/api/docs

## Service Pattern

```typescript
@Injectable()
export class MyService {
  constructor(
    @InjectRepository(Entity) private repo: Repository<Entity>,
    private eventPublisher: EventPublisherService,
  ) {}

  async create(dto: CreateDto, userId: number) {
    const entity = this.repo.create({ ...dto, userId });
    const saved = await this.repo.save(entity);
    this.eventPublisher.publish(new EntityCreatedEvent(saved, userId));
    return saved;
  }
}
```

## Current Phase

**Refactoring TransactionsService** - Breaking up "god service" into specialized services while maintaining 100% test pass rate.
