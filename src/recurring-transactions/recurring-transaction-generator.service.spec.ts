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
import { TransactionOperationsService } from '../shared/transaction-operations.service';

describe('RecurringTransactionGeneratorService', () => {
  let service: RecurringTransactionGeneratorService;
  let recurringTransactionRepository: jest.Mocked<Repository<RecurringTransaction>>;
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
    bankAccounts: [],
    creditCards: [],
    transactions: [],
    tags: [],
    categories: [],
    recurringTransactions: []
  } as User;

  const baseMockRecurringTransaction: Partial<RecurringTransaction> = {
    id: 1,
    name: 'Test Transaction',
    amount: 100,
    status: 'SCHEDULED',
    type: 'expense',
    category: {
      id: 1,
      name: 'Test Category',
      transactions: [],
      user: mockUser,
      recurringTransactions: [],
      keywords: []
    } as Category,
    user: mockUser,
    tags: [],
    bankAccount: {
      id: 1,
      name: 'Checking Account',
      balance: 1000,
      currency: 'USD',  
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
      transactions: [],
      creditCards: [],
      recurringTransactions: [],
      user: mockUser        
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

    service = module.get<RecurringTransactionGeneratorService>(RecurringTransactionGeneratorService);
    recurringTransactionRepository = module.get(getRepositoryToken(RecurringTransaction));
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

  describe('generateTransactions', () => {
    it('should generate next transaction for monthly recurring transaction', () => {
      const mockRecurringTransaction = {
        ...baseMockRecurringTransaction,
        startDate: new Date(Date.UTC(2024, 0, 1)), // January 1, 2024
        endDate: new Date(Date.UTC(2024, 11, 31)), // December 31, 2024
        frequencyType: 'monthly',
        frequencyEveryN: 1,
      } as RecurringTransaction;

      const result = service.generateTransactions(mockRecurringTransaction);

      expect(result).toBeDefined();
      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('executed');
      expect(result[1].status).toBe('pending');
      expect(result[1].executionDate).toEqual(new Date(Date.UTC(2024, 1, 1))); // February 1, 2024
    });

    it('should return empty array for paused recurring transaction', () => {
      const mockRecurringTransaction = {
        ...baseMockRecurringTransaction,
        status: 'PAUSED',
        frequencyType: 'monthly',
        frequencyEveryN: 1,
        startDate: new Date(Date.UTC(2024, 0, 1)),
      } as RecurringTransaction;

      const result = service.generateTransactions(mockRecurringTransaction);
      expect(result).toHaveLength(0); // Should be empty for paused transactions
    });

    it('should not generate pending transaction after end date', () => {
      const mockRecurringTransaction = {
        name: 'Ended Subscription',
        amount: 15.99,
        status: 'SCHEDULED',
        type: 'expense',
        frequencyType: 'monthly',
        frequencyEveryN: 1,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-14'),
        category: { id: 1 },
        user: { id: 1 }
      } as RecurringTransaction;

      const result = service.generateTransactions(mockRecurringTransaction);
      expect(result).toHaveLength(1); // Only the executed transaction
      expect(result[0].status).toBe('executed');
    });

    it('should generate historical and next pending transactions', () => {
      jest.setSystemTime(new Date(Date.UTC(2025, 2, 16))); // March 16, 2025
      
      const mockRecurringTransaction = {
        ...baseMockRecurringTransaction,
        startDate: new Date(Date.UTC(2024, 2, 13)), // March 13, 2024
        frequencyType: 'monthly',
        frequencyEveryN: 1,
      } as RecurringTransaction;

      const result = service.generateTransactions(mockRecurringTransaction);

      expect(result).toHaveLength(14);
      
      const executedTransactions = result.filter(t => t.status === 'executed');
      expect(executedTransactions).toHaveLength(13);

      const pendingTransactions = result.filter(t => t.status === 'pending');
      expect(pendingTransactions).toHaveLength(1);
      expect(pendingTransactions[0].executionDate).toEqual(new Date(Date.UTC(2025, 3, 13))); // April 13, 2025
    });

    it('should generate correct transactions for monthly recurring transaction with 20 occurrences', () => {
      // Mock current date to 2024-03-25 (after start date)
      jest.setSystemTime(new Date('2025-03-25'));

      const recurringTransaction = {
        ...baseMockRecurringTransaction,
        frequencyType: 'monthly',
        frequencyEveryN: 1,
        startDate: new Date('2024-03-12'),
        occurrences: 20,
        status: 'SCHEDULED',
        type: 'expense',
        amount: 100,
      };

      const transactions = service.generateTransactions(recurringTransaction as RecurringTransaction);

      // Should generate 14 transactions in total (13 executed + 1 pending)
      expect(transactions).toHaveLength(14);

      // Check executed transactions (from start date to current date)
      const executedTransactions = transactions.filter(t => t.status === 'executed');
      expect(executedTransactions).toHaveLength(13);

      // Check pending transactions
      const pendingTransactions = transactions.filter(t => t.status === 'pending');
      expect(pendingTransactions).toHaveLength(1);

      // Verify first transaction date
      expect(transactions[0].executionDate).toEqual(new Date('2024-03-12'));

      // Verify last pending transaction date
      expect(pendingTransactions[0].executionDate).toEqual(new Date('2025-04-12'));

      // Verify all transactions have correct properties
      transactions.forEach(transaction => {
        expect(transaction).toEqual(
          expect.objectContaining({
            description: recurringTransaction.name,
            amount: recurringTransaction.amount,
            type: recurringTransaction.type,
            category: recurringTransaction.category,
            bankAccount: recurringTransaction.bankAccount,
            creditCard: recurringTransaction.creditCard,
            tags: recurringTransaction.tags,
            user: recurringTransaction.user,
            source: 'recurring',
            recurringTransaction: recurringTransaction
          })
        );
      });
    });

    it('should generate correct transactions for monthly recurring with 20 occurrences starting March 12', () => {
      // Set current date to March 25, 2024
      jest.setSystemTime(new Date('2025-03-25'));
      
      const mockRecurringTransaction = {
        ...baseMockRecurringTransaction,
        name: 'Monthly Payment',
        amount: 100,
        status: 'SCHEDULED',
        type: 'expense',
        frequencyType: 'monthly',
        frequencyEveryN: 1,
        startDate: new Date('2024-03-12'),
        occurrences: 20,
      } as RecurringTransaction;

      const result = service.generateTransactions(mockRecurringTransaction);

      // Verify total number of transactions (13 executed + 1 pending = 14)
      expect(result).toHaveLength(14);

      // Check executed transactions
      const executedTransactions = result.filter(t => t.status === 'executed');
      expect(executedTransactions).toHaveLength(13);

      // Check pending transactions
      const pendingTransactions = result.filter(t => t.status === 'pending');
      expect(pendingTransactions).toHaveLength(1);

      // Verify first transaction date
      expect(result[0].executionDate).toEqual(new Date('2024-03-12'));

      // Verify pending transaction date
      expect(pendingTransactions[0].executionDate).toEqual(new Date('2025-04-12'));

      // Verify all transactions have correct properties
      result.forEach(transaction => {
        expect(transaction).toEqual(
          expect.objectContaining({
            description: mockRecurringTransaction.name,
            amount: mockRecurringTransaction.amount,
            type: mockRecurringTransaction.type,
            category: mockRecurringTransaction.category,
            bankAccount: mockRecurringTransaction.bankAccount,
            creditCard: mockRecurringTransaction.creditCard,
            tags: mockRecurringTransaction.tags,
            user: mockRecurringTransaction.user,
            source: 'recurring',
            recurringTransaction: mockRecurringTransaction
          })
        );
      });

      // Verify dates are sequential and monthly
      for (let i = 1; i < result.length; i++) {
        const currentDate = result[i].executionDate!;
        const previousDate = result[i-1].executionDate!;
        const monthDiff = (currentDate.getFullYear() - previousDate.getFullYear()) * 12 
                         + (currentDate.getMonth() - previousDate.getMonth());
        expect(monthDiff).toBe(1);
        expect(currentDate.getDate()).toBe(12); // Should maintain the same day of month
      }
    });
  });
}); 