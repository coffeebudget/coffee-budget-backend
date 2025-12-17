import { Test, TestingModule } from '@nestjs/testing';
import { RecurringTransactionGeneratorService } from './recurring-transaction-generator.service';
import { RecurringTransaction } from './entities/recurring-transaction.entity';
import { User } from '../users/user.entity';
import { Category } from '../categories/entities/category.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { RecurringTransactionsService } from './recurring-transactions.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from '../tags/entities/tag.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionOperationsService } from '../transactions/transaction-operations.service';
import { createCategoryMock } from '../../test/test-utils';
import { addDays, addMonths, format } from 'date-fns';

describe('RecurringTransactionGeneratorService', () => {
  let service: RecurringTransactionGeneratorService;
  let recurringTransactionRepository: jest.Mocked<
    Repository<RecurringTransaction>
  >;
  let categoryRepository: jest.Mocked<Repository<Category>>;
  let tagRepository: jest.Mocked<Repository<Tag>>;
  let bankAccountRepository: jest.Mocked<Repository<BankAccount>>;
  let creditCardRepository: jest.Mocked<Repository<CreditCard>>;
  let transactionRepository: jest.Mocked<Repository<Transaction>>;
  let transactionsService: jest.Mocked<TransactionsService>;
  let transactionOperationsService: TransactionOperationsService;

  const mockUser = {
    id: 1,
    auth0Id: 'test-auth0-id',
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
    paymentAccounts: [],
  } as User;

  const baseMockRecurringTransaction: Partial<RecurringTransaction> = {
    id: 1,
    name: 'Test Transaction',
    amount: 100,
    status: 'SCHEDULED',
    type: 'expense',
    category: createCategoryMock() as unknown as Category,
    user: mockUser,
    tags: [],
    bankAccount: {
      id: 1,
      name: 'Checking Account',
      balance: 1000,
      currency: 'USD',
      type: 'checking',
      gocardlessAccountId: 'test-gocardless-id',
      createdAt: new Date(),
      updatedAt: new Date(),
      transactions: [],
      creditCards: [],
      recurringTransactions: [],
      user: mockUser,
    } as BankAccount,
    creditCard: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    // Mock the current date to 2024-01-15
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringTransactionGeneratorService,
        {
          provide: getRepositoryToken(RecurringTransaction),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Category),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Tag),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(BankAccount),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CreditCard),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: TransactionsService,
          useValue: {
            create: jest.fn(),
            createAutomatedTransaction: jest.fn(),
          },
        },
        {
          provide: TransactionOperationsService,
          useValue: {
            findMatchingTransactions: jest.fn(),
            handleDuplicateResolution: jest.fn(),
            createPendingDuplicate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RecurringTransactionGeneratorService>(
      RecurringTransactionGeneratorService,
    );
    recurringTransactionRepository = module.get(
      getRepositoryToken(RecurringTransaction),
    );
    categoryRepository = module.get(getRepositoryToken(Category));
    tagRepository = module.get(getRepositoryToken(Tag));
    bankAccountRepository = module.get(getRepositoryToken(BankAccount));
    creditCardRepository = module.get(getRepositoryToken(CreditCard));
    transactionRepository = module.get(getRepositoryToken(Transaction));
    transactionsService = module.get(TransactionsService);
    transactionOperationsService = module.get(TransactionOperationsService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateNextExecutionDate', () => {
    it('should calculate correct next execution date for monthly recurring transactions', () => {
      const startDate = new Date('2023-01-01');
      const mockRecurringTransaction = {
        id: 1,
        amount: 100,
        description: 'Monthly subscription',
        type: 'expense',
        frequencyType: 'monthly',
        frequencyEveryN: 1,
        startDate: new Date('2023-01-01'),
        nextOccurrence: new Date('2023-01-15'),
        status: 'SCHEDULED',
      } as unknown as RecurringTransaction;

      const result = service.calculateNextExecutionDate(
        startDate,
        mockRecurringTransaction,
      );

      expect(result).toEqual(new Date('2023-01-15'));
    });

    it('should calculate correct next execution date for weekly recurring transactions', () => {
      const startDate = new Date('2023-01-01'); // Sunday
      const mockRecurringTransaction = {
        id: 1,
        amount: 100,
        description: 'Weekly subscription',
        type: 'expense',
        frequencyType: 'weekly',
        frequencyEveryN: 1,
        startDate: new Date('2023-01-01'),
        nextOccurrence: new Date('2023-01-04'),
        status: 'SCHEDULED',
      } as unknown as RecurringTransaction;

      const result = service.calculateNextExecutionDate(
        startDate,
        mockRecurringTransaction,
      );

      expect(result).toEqual(new Date('2023-01-04'));
    });

    it('should calculate correct next execution date for bi-weekly recurring transactions', () => {
      const startDate = new Date('2023-01-01');
      const mockRecurringTransaction = {
        id: 1,
        amount: 100,
        description: 'Bi-weekly subscription',
        type: 'expense',
        frequencyType: 'weekly',
        frequencyEveryN: 2,
        startDate: new Date('2022-12-15'),
        status: 'SCHEDULED',
        nextOccurrence: new Date('2023-01-12'),
      } as unknown as RecurringTransaction;

      const result = service.calculateNextExecutionDate(
        startDate,
        mockRecurringTransaction,
      );

      expect(result).toEqual(new Date('2023-01-12'));
    });

    it('should calculate correct next execution date for yearly recurring transactions', () => {
      const startDate = new Date('2023-01-01');
      const mockRecurringTransaction = {
        id: 1,
        amount: 100,
        description: 'Yearly subscription',
        type: 'expense',
        frequencyType: 'yearly',
        frequencyEveryN: 1,
        month: 4, // May (0-indexed)
        dayOfMonth: 15,
        status: 'SCHEDULED',
        nextOccurrence: new Date('2023-05-15'),
        startDate: new Date('2022-05-15'),
      } as unknown as RecurringTransaction;

      const result = service.calculateNextExecutionDate(
        startDate,
        mockRecurringTransaction,
      );

      expect(result).toEqual(new Date('2023-05-15'));
    });

    it('should return the nextExecutionDate from the recurring transaction', () => {
      const startDate = new Date('2023-01-01');
      const recurringTransaction = {
        id: 1,
        nextOccurrence: new Date('2023-02-15'),
        startDate: new Date('2023-01-01'),
        frequencyType: 'monthly',
        frequencyEveryN: 1,
        dayOfMonth: 15,
      } as unknown as RecurringTransaction;

      const result = service.calculateNextExecutionDate(
        startDate,
        recurringTransaction,
      );

      expect(result).toEqual(new Date('2023-02-15'));
    });

    it('should handle the case when no valid execution date can be calculated', () => {
      const startDate = new Date('2023-01-01');
      const mockRecurringTransaction = {
        id: 1,
        amount: 100,
        description: 'Invalid frequency',
        type: 'expense',
        frequencyType: 'invalid',
        status: 'SCHEDULED',
        startDate: new Date('2023-01-01'),
      } as any;

      const result = service.calculateNextExecutionDate(
        startDate,
        mockRecurringTransaction,
      );

      // Should return the start date if no valid execution date can be calculated
      expect(result).toEqual(startDate);
    });
  });
});
