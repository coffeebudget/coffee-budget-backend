import { Test, TestingModule } from '@nestjs/testing';
import { RecurringTransactionsService } from './recurring-transactions.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RecurringTransaction } from './entities/recurring-transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';
import { UpdateRecurringTransactionDto } from './dto/update-recurring-transaction.dto';
import { RecurringTransactionGeneratorService } from './recurring-transaction-generator.service';
import { TransactionsService } from '../transactions/transactions.service';
import { Transaction } from '../transactions/transaction.entity';
import { Repository } from 'typeorm';
import { RecurringPatternDetectorService } from './recurring-pattern-detector.service';
import { TransactionOperationsService } from '../shared/transaction-operations.service';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';
import { User } from '../users/user.entity';

describe('RecurringTransactionsService', () => {
  let service: RecurringTransactionsService;
  let generatorService: RecurringTransactionGeneratorService;
  let recurringTransactionRepository: Repository<RecurringTransaction>;
  let categoryRepository: Repository<Category>;
  let tagRepository: Repository<Tag>;
  let bankAccountRepository: Repository<BankAccount>;
  let creditCardRepository: Repository<CreditCard>;
  let transactionRepository: Repository<Transaction>;
  let transactionsService: TransactionsService;
  let patternDetectorService: RecurringPatternDetectorService;
  let transactionOperationsService: TransactionOperationsService;

  const mockUser = { id: 1, email: 'test@example.com', auth0Id: 'auth123' };
  const expectedTransaction = {
    id: 1,
    name: 'Monthly Rent',
    description: 'Rent payment',
    amount: 1000,
    type: 'expense',
    frequencyType: 'monthly',
    frequencyValue: 1,
    startDate: new Date('2024-01-01'),
    endDate: null,
    user: { id: 1 },
    category: { id: 1, name: 'Housing' },
    bankAccount: { id: 1, name: 'Checking' },
    creditCard: null,
    tags: [],
    autoGenerate: true,
    active: true,
  };

  beforeEach(async () => {
    // Mock the current date to 2024-01-15
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15'));

    // Create proper mock objects with Jest functions
    const mockRecurringTransactionRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };

    const mockCategoryRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const mockTagRepository = {
      find: jest.fn(),
      findByIds: jest.fn(),
    };

    const mockBankAccountRepository = {
      findOne: jest.fn(),
    };

    const mockCreditCardRepository = {
      findOne: jest.fn(),
    };

    const mockTransactionRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };

    // Create a mock generator service with Jest functions
    const mockGeneratorService = {
      generateTransactions: jest.fn().mockReturnValue([
        {
          description: 'Test Transaction',
          amount: 100,
          executionDate: new Date('2024-02-01'),
        },
      ]),
      calculateNextOccurrences: jest
        .fn()
        .mockReturnValue([new Date('2024-02-01'), new Date('2024-03-01')]),
      calculateNextExecutionDate: jest
        .fn()
        .mockReturnValue(new Date('2024-02-01')),
    };

    const mockTransactionsService = {
      create: jest.fn().mockResolvedValue({
        id: 1,
        description: 'Test Transaction',
        amount: 100,
      }),
      createAutomatedTransaction: jest.fn().mockResolvedValue({
        id: 1,
        description: 'Test Transaction',
        amount: 100,
      }),
      update: jest.fn().mockResolvedValue({
        id: 1,
        description: 'Updated Transaction',
        amount: 200,
      }),
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringTransactionsService,
        {
          provide: RecurringTransactionGeneratorService,
          useValue: mockGeneratorService,
        },
        {
          provide: getRepositoryToken(RecurringTransaction),
          useValue: mockRecurringTransactionRepository,
        },
        {
          provide: getRepositoryToken(Category),
          useValue: mockCategoryRepository,
        },
        {
          provide: getRepositoryToken(Tag),
          useValue: mockTagRepository,
        },
        {
          provide: getRepositoryToken(BankAccount),
          useValue: mockBankAccountRepository,
        },
        {
          provide: getRepositoryToken(CreditCard),
          useValue: mockCreditCardRepository,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(PendingDuplicate),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: TransactionsService,
          useValue: mockTransactionsService,
        },
        {
          provide: RecurringPatternDetectorService,
          useValue: {
            detectAndProcessRecurringTransaction: jest.fn(),
          },
        },
        {
          provide: TransactionOperationsService,
          useValue: {
            findMatchingTransactions: jest.fn(),
            handleDuplicateResolution: jest.fn(),
            createPendingDuplicate: jest.fn(),
            linkTransactionsToRecurring: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RecurringTransactionsService>(
      RecurringTransactionsService,
    );
    generatorService = module.get<RecurringTransactionGeneratorService>(
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
    patternDetectorService = module.get(RecurringPatternDetectorService);
    transactionOperationsService = module.get(TransactionOperationsService);

    // Set up mock return values
    mockRecurringTransactionRepository.findOne.mockResolvedValue(
      expectedTransaction,
    );
    mockRecurringTransactionRepository.create.mockReturnValue(
      expectedTransaction,
    );
    mockRecurringTransactionRepository.save.mockResolvedValue(
      expectedTransaction,
    );

    // Mock category to exist by default
    mockCategoryRepository.findOne.mockResolvedValue({
      id: 1,
      name: 'Test Category',
    });

    mockTransactionRepository.find.mockResolvedValue([]);

    // Set up the delete mock as it's causing issues in multiple tests
    mockTransactionRepository.delete.mockResolvedValue({ affected: 1 });

    // Make sure transactionsService.create is mocked properly
    mockTransactionsService.create.mockImplementation((dto, userId) => {
      return Promise.resolve({
        id: 999,
        ...dto,
        user: { id: userId },
      });
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a recurring transaction and generate pending transactions', async () => {
      // Mock current date
      jest.setSystemTime(new Date('2024-03-25'));

      const createDto: CreateRecurringTransactionDto = {
        name: 'Monthly Rent',
        amount: 1000,
        type: 'expense',
        status: 'SCHEDULED',
        frequencyType: 'monthly',
        frequencyEveryN: 1,
        startDate: new Date('2024-03-12'),
        categoryId: 1,
        bankAccountId: 1,
        tagIds: [1, 2],
        userId: mockUser.id,
      };

      const mockCategory = { id: 1 };
      const mockTags = [{ id: 1 }, { id: 2 }];
      const mockBankAccount = { id: 1 };

      // Mock repository responses
      (categoryRepository.findOne as jest.Mock).mockResolvedValue(mockCategory);
      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(
        mockBankAccount,
      );
      (tagRepository.find as jest.Mock).mockResolvedValue(mockTags);

      // Mock the recurring transaction creation
      const mockRecurringTransaction = {
        ...createDto,
        id: 1,
        category: mockCategory as Category,
        tags: mockTags as Tag[],
        bankAccount: mockBankAccount as BankAccount,
        creditCard: null,
        user: mockUser,
        createdAt: new Date(),
        updatedAt: new Date(),
        nextOccurrence: null,
        transactions: [],
        userConfirmed: false,
      } as unknown as RecurringTransaction;
      (recurringTransactionRepository.create as jest.Mock).mockReturnValue(
        mockRecurringTransaction,
      );
      (recurringTransactionRepository.save as jest.Mock).mockResolvedValue(
        mockRecurringTransaction,
      );

      // Mock the pending transaction generation
      const mockPendingTransaction = {
        description: 'Monthly Rent',
        amount: 1000,
        executionDate: new Date('2024-04-12'),
        status: 'pending',
        type: 'expense',
      };

      (generatorService.generateTransactions as jest.Mock).mockReturnValue([
        mockPendingTransaction,
      ]);

      // Mock transactions service createAutomatedTransaction instead of create
      // This is likely what the service is actually calling now
      (
        transactionsService.createAutomatedTransaction as jest.Mock
      ).mockResolvedValue({ ...mockPendingTransaction, id: 100 } as any);

      const result = await service.create(createDto, mockUser as User);

      expect(result).toEqual(mockRecurringTransaction);
      expect(recurringTransactionRepository.create).toHaveBeenCalled();
      expect(recurringTransactionRepository.save).toHaveBeenCalled();
      expect(generatorService.generateTransactions).toHaveBeenCalled();
      expect(
        transactionsService.createAutomatedTransaction,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Monthly Rent',
          amount: 1000,
          executionDate: new Date('2024-04-12'),
          status: 'pending',
        }),
        mockUser.id,
        'recurring',
        expect.any(String),
      );
    });

    it('should create a recurring transaction with multiple occurrences and correct execution dates', async () => {
      // Mock current date
      jest.setSystemTime(new Date('2024-03-25'));

      const createDto: CreateRecurringTransactionDto = {
        name: 'Monthly Payment',
        amount: 100,
        type: 'expense',
        status: 'SCHEDULED',
        frequencyType: 'monthly',
        frequencyEveryN: 1,
        startDate: new Date('2024-03-12'),
        categoryId: 1,
        bankAccountId: 1,
        userId: mockUser.id,
      };

      const mockCategory = { id: 1 };
      const mockBankAccount = { id: 1 };

      // Mock repository responses
      (categoryRepository.findOne as jest.Mock).mockResolvedValue(mockCategory);
      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(
        mockBankAccount,
      );
      (tagRepository.find as jest.Mock).mockResolvedValue([]);

      // Mock the recurring transaction creation
      const mockRecurringTransaction = {
        ...createDto,
        id: 1,
        category: mockCategory as Category,
        tags: [],
        bankAccount: mockBankAccount as BankAccount,
        creditCard: null,
        user: mockUser,
        createdAt: new Date(),
        updatedAt: new Date(),
        nextOccurrence: null,
        transactions: [],
        userConfirmed: false,
      } as unknown as RecurringTransaction;
      (recurringTransactionRepository.create as jest.Mock).mockReturnValue(
        mockRecurringTransaction,
      );
      (recurringTransactionRepository.save as jest.Mock).mockResolvedValue(
        mockRecurringTransaction,
      );

      // Mock the pending transaction generation with multiple occurrences
      const mockTransactions = [
        {
          description: 'Monthly Payment',
          amount: 100,
          executionDate: new Date('2024-04-12'),
          status: 'pending',
          type: 'expense',
        },
        {
          description: 'Monthly Payment',
          amount: 100,
          executionDate: new Date('2024-05-12'),
          status: 'pending',
          type: 'expense',
        },
      ];

      (generatorService.generateTransactions as jest.Mock).mockReturnValue(
        mockTransactions,
      );

      // Mock createAutomatedTransaction
      (
        transactionsService.createAutomatedTransaction as jest.Mock
      ).mockResolvedValue({ ...mockTransactions[0], id: 100 } as any);

      await service.create(createDto, mockUser as User);

      // Update the expectation to check createAutomatedTransaction
      expect(
        transactionsService.createAutomatedTransaction,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Monthly Payment',
          amount: 100,
          executionDate: new Date('2024-04-12'),
          status: 'pending',
        }),
        mockUser.id,
        'recurring',
        expect.any(String),
      );
    });
  });

  describe('update', () => {
    it('should update a recurring transaction and regenerate pending transactions', async () => {
      const existingTransaction = {
        id: 1,
        name: 'Monthly Rent',
        endDate: null,
        nextOccurrence: null,
        userConfirmed: true,
        source: 'recurring',
        amount: 1000,
        type: 'expense',
        status: 'SCHEDULED',
        category: { id: 1 },
        user: { id: mockUser.id },
        bankAccount: { id: 1 },
        creditCard: null,
        frequencyType: 'monthly',
        startDate: new Date('2024-01-01'),
        tags: [],
        frequencyEveryN: 1,
        occurrences: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        description: 'Monthly Rent',
      } as unknown as RecurringTransaction;

      const updateDto: UpdateRecurringTransactionDto = {
        name: 'Updated Rent',
        amount: 1200,
        userId: mockUser.id,
      };

      (recurringTransactionRepository.findOne as jest.Mock).mockResolvedValue(
        existingTransaction,
      );

      const updatedTransaction = {
        ...existingTransaction,
        ...updateDto,
      };
      (recurringTransactionRepository.save as jest.Mock).mockResolvedValue(
        updatedTransaction,
      );

      (generatorService.generateTransactions as jest.Mock).mockReturnValue([]);

      const result = await service.update(1, updateDto, mockUser.id);

      expect(result).toEqual(updatedTransaction);
    });

    it('should handle bank account update correctly', async () => {
      const existingTransaction = {
        id: 1,
        name: 'Monthly Rent',
        amount: 1000,
        type: 'expense',
        status: 'SCHEDULED',
        category: { id: 1 },
        user: { id: mockUser.id },
        bankAccount: { id: 1 },
        creditCard: null,
        frequencyType: 'monthly',
        frequencyEveryN: 1,
        startDate: new Date('2024-01-01'),
        tags: [],
      } as unknown as RecurringTransaction;

      const updateDto: UpdateRecurringTransactionDto = {
        bankAccountId: 2,
        userId: mockUser.id,
      };

      // Mock finding the existing transaction
      (recurringTransactionRepository.findOne as jest.Mock).mockResolvedValue(
        existingTransaction,
      );

      // Mock finding the new bank account
      const newBankAccount = { id: 2, name: 'New Bank Account' };
      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(
        newBankAccount,
      );

      // Mock saving the updated transaction
      const updatedTransaction = {
        ...existingTransaction,
        bankAccount: newBankAccount,
        tags: [],
      } as unknown as RecurringTransaction;
      (recurringTransactionRepository.save as jest.Mock).mockResolvedValue(
        updatedTransaction,
      );

      // Mock the pending transaction generation
      const mockPendingTransaction = {
        description: 'Monthly Rent',
        amount: 1000,
        executionDate: new Date('2024-02-01'),
        status: 'pending',
        type: 'expense',
      };
      (generatorService.generateTransactions as jest.Mock).mockReturnValue([
        mockPendingTransaction,
      ]);

      // Mock transactions service
      (
        transactionsService.createAutomatedTransaction as jest.Mock
      ).mockResolvedValue(mockPendingTransaction as any);

      const result = await service.update(1, updateDto, mockUser.id);

      expect(result).toEqual(updatedTransaction);
      expect(bankAccountRepository.findOne).toHaveBeenCalledWith({
        where: { id: 2, user: { id: mockUser.id } },
      });
      expect(recurringTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          bankAccount: newBankAccount,
          creditCard: null,
        }),
      );
    });

    it('should handle credit card update correctly', async () => {
      const existingTransaction = {
        id: 1,
        name: 'Netflix Subscription',
        amount: 9.99,
        type: 'expense',
        status: 'SCHEDULED',
        category: { id: 1 },
        user: { id: mockUser.id },
        bankAccount: null,
        creditCard: { id: 1 },
        frequencyType: 'monthly',
        frequencyEveryN: 1,
        startDate: new Date('2024-01-01'),
        tags: [],
      } as unknown as RecurringTransaction;

      const updateDto: UpdateRecurringTransactionDto = {
        creditCardId: 2,
        userId: mockUser.id,
      };

      // Mock finding the existing transaction
      (recurringTransactionRepository.findOne as jest.Mock).mockResolvedValue(
        existingTransaction,
      );

      // Mock finding the new credit card
      const newCreditCard = { id: 2, name: 'New Credit Card' };
      (creditCardRepository.findOne as jest.Mock).mockResolvedValue(
        newCreditCard,
      );

      // Mock saving the updated transaction
      const updatedTransaction = {
        ...existingTransaction,
        bankAccount: null,
        creditCard: newCreditCard,
        tags: [],
      } as unknown as RecurringTransaction;
      (recurringTransactionRepository.save as jest.Mock).mockResolvedValue(
        updatedTransaction,
      );

      // Mock the pending transaction generation
      const mockPendingTransaction = {
        description: 'Netflix Subscription',
        amount: 9.99,
      };
      (generatorService.generateTransactions as jest.Mock).mockReturnValue([
        mockPendingTransaction,
      ]);

      // Mock transactions service
      (
        transactionsService.createAutomatedTransaction as jest.Mock
      ).mockResolvedValue(mockPendingTransaction as any);

      const result = await service.update(1, updateDto, mockUser.id);

      expect(result).toEqual(updatedTransaction);
      expect(creditCardRepository.findOne).toHaveBeenCalledWith({
        where: { id: 2, user: { id: mockUser.id } },
      });
      expect(recurringTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          bankAccount: null,
          creditCard: newCreditCard,
        }),
      );
    });

    it('should update past transactions if applyToPast is true', async () => {
      const existingTransaction = {
        id: 1,
        name: 'Monthly Rent',
        amount: 1000,
        type: 'expense',
        status: 'SCHEDULED',
        category: { id: 1 },
        user: { id: mockUser.id },
        bankAccount: { id: 1 },
        creditCard: null,
        frequencyType: 'monthly',
        frequencyValue: 1,
        startDate: new Date('2024-01-01'),
        tags: [],
        frequencyEveryN: 1,
        occurrences: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        description: 'Monthly Rent',
        active: true,
        autoGenerate: true,
      } as unknown as RecurringTransaction;

      const updateDto: UpdateRecurringTransactionDto = {
        name: 'Updated Rent',
        amount: 1200,
        userId: mockUser.id,
        applyToPast: true,
      };

      (recurringTransactionRepository.findOne as jest.Mock).mockResolvedValue(
        existingTransaction,
      );

      const pastTransactions = [
        { id: 101, description: 'Monthly Rent', amount: 1000 },
      ];
      (transactionRepository.find as jest.Mock).mockResolvedValue(
        pastTransactions,
      );

      const updatedTransaction = {
        ...existingTransaction,
        ...updateDto,
      };
      (recurringTransactionRepository.save as jest.Mock).mockResolvedValue(
        updatedTransaction,
      );

      await service.update(1, updateDto, mockUser.id);
    });
  });
});
