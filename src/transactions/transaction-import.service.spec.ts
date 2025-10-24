import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionImportService } from './transaction-import.service';
import { Transaction } from './transaction.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { User } from '../users/user.entity';
import { ImportLogsService } from './import-logs.service';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import { TransactionOperationsService } from './transaction-operations.service';
import { RecurringPatternDetectorService } from '../recurring-transactions/recurring-pattern-detector.service';
import { GocardlessService } from '../gocardless/gocardless.service';
import { BankFileParserFactory } from './parsers';
import { ImportStatus } from './entities/import-log.entity';
import { ImportTransactionDto } from './dto/import-transaction.dto';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';
import { BadRequestException } from '@nestjs/common';

// Mock bank parser for testing
class MockBankParser {
  async parseFile(data: string, options: any): Promise<Partial<Transaction>[]> {
    const transactions = [
      {
        description: 'Test Transaction 1',
        amount: 100,
        type: 'expense' as 'income' | 'expense',
        executionDate: new Date('2024-01-15'),
        bankAccount: { id: 1 } as any,
      },
      {
        description: 'Test Transaction 2',
        amount: 200,
        type: 'income' as 'income' | 'expense',
        executionDate: new Date('2024-01-16'),
        bankAccount: { id: 1 } as any,
      },
    ];

    // If creditCardId is provided, set creditCard on transactions
    if (options.creditCardId) {
      transactions.forEach(tx => {
        (tx as any).creditCard = { id: options.creditCardId };
      });
    }

    return transactions;
  }
}

describe('TransactionImportService', () => {
  let service: TransactionImportService;
  let transactionRepository: jest.Mocked<Repository<Transaction>>;
  let bankAccountRepository: jest.Mocked<Repository<BankAccount>>;
  let creditCardRepository: jest.Mocked<Repository<CreditCard>>;
  let categoryRepository: jest.Mocked<Repository<Category>>;
  let tagRepository: jest.Mocked<Repository<Tag>>;
  let importLogsService: jest.Mocked<ImportLogsService>;
  let categoriesService: jest.Mocked<CategoriesService>;
  let tagsService: jest.Mocked<TagsService>;
  let transactionOperationsService: jest.Mocked<TransactionOperationsService>;
  let recurringPatternDetectorService: jest.Mocked<RecurringPatternDetectorService>;
  let gocardlessService: jest.Mocked<GocardlessService>;

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

  const mockBankAccount = {
    id: 1,
    name: 'Test Account',
    balance: 1000,
    type: 'CHECKING',
    gocardlessAccountId: 'test-gocardless-id',
    user: mockUser,
    currency: 'USD',
    transactions: [],
    creditCards: [],
    recurringTransactions: [],
  } as BankAccount;

  const mockCreditCard = {
    id: 1,
    name: 'Test Card',
    billingDay: 15,
    creditLimit: 5000,
    availableCredit: 5000,
    currentBalance: 0,
    interestRate: 0,
    bankAccountId: 1,
    gocardlessAccountId: 'test-gocardless-id',
    user: mockUser,
    bankAccount: mockBankAccount,
    transactions: [],
    recurringTransactions: [],
  } as any;

  const mockCategory = {
    id: 1,
    name: 'Test Category',
    user: mockUser,
    keywords: [],
    transactions: [],
    recurringTransactions: [],
    excludeFromExpenseAnalytics: false,
    analyticsExclusionReason: '',
    budgetLevel: null,
    monthlyBudget: null,
    yearlyBudget: null,
    maxThreshold: null,
    warningThreshold: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  const mockTag = {
    id: 1,
    name: 'Test Tag',
    user: mockUser,
    transactions: [],
    recurringTransactions: [],
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionImportService,
        RepositoryMockFactory.createRepositoryProvider(Transaction),
        RepositoryMockFactory.createRepositoryProvider(BankAccount),
        RepositoryMockFactory.createRepositoryProvider(CreditCard),
        RepositoryMockFactory.createRepositoryProvider(Category),
        RepositoryMockFactory.createRepositoryProvider(Tag),
        {
          provide: ImportLogsService,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 1 }),
            appendToLog: jest.fn(),
            update: jest.fn(),
            updateStatus: jest.fn(),
            incrementCounters: jest.fn(),
          },
        },
        {
          provide: CategoriesService,
          useValue: {
            suggestCategoryForDescription: jest.fn(),
            findByName: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: TagsService,
          useValue: {
            findByName: jest.fn(),
            create: jest.fn(),
            resolveTagsFromString: jest.fn(),
          },
        },
        {
          provide: TransactionOperationsService,
          useValue: {
            createAutomatedTransaction: jest.fn(),
          },
        },
        {
          provide: RecurringPatternDetectorService,
          useValue: {
            detectAllRecurringPatterns: jest.fn(),
          },
        },
        {
          provide: GocardlessService,
          useValue: {
            getTransactions: jest.fn(),
            getAccounts: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionImportService>(TransactionImportService);
    transactionRepository = module.get(getRepositoryToken(Transaction));
    bankAccountRepository = module.get(getRepositoryToken(BankAccount));
    creditCardRepository = module.get(getRepositoryToken(CreditCard));
    categoryRepository = module.get(getRepositoryToken(Category));
    tagRepository = module.get(getRepositoryToken(Tag));
    importLogsService = module.get(ImportLogsService);
    categoriesService = module.get(CategoriesService);
    tagsService = module.get(TagsService);
    transactionOperationsService = module.get(TransactionOperationsService);
    recurringPatternDetectorService = module.get(RecurringPatternDetectorService);
    gocardlessService = module.get(GocardlessService);
  });

  describe('importTransactions', () => {
    it('should import bank-specific CSV format successfully', async () => {
      // Arrange
      const importDto: ImportTransactionDto = {
        bankFormat: 'bnl_txt',
        csvData: 'sample data',
        bankAccountId: 1,
      };

      jest.spyOn(BankFileParserFactory, 'getParser').mockReturnValue(new MockBankParser());
      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(mockBankAccount);
      (transactionOperationsService.createAutomatedTransaction as jest.Mock).mockResolvedValue({
        id: 1,
        description: 'Test Transaction 1',
        amount: 100,
        type: 'expense' as 'income' | 'expense',
      } as Transaction);

      // Act
      const result = await service.importTransactions(importDto, mockUser.id);

      // Assert
      expect(result).toBeDefined();
      expect(result.transactions).toHaveLength(2);
      expect(result.status).toBe(ImportStatus.COMPLETED);
      expect(importLogsService.create).toHaveBeenCalled();
      expect(transactionOperationsService.createAutomatedTransaction).toHaveBeenCalledTimes(2);
    });

    it('should import generic CSV format successfully', async () => {
      // Arrange
      const importDto: ImportTransactionDto = {
        csvData: 'description,amount,type,executionDate\nTest Transaction,100,expense,2024-01-15',
        columnMappings: {
          description: 'description',
          amount: 'amount',
          type: 'type',
          executionDate: 'executionDate',
          categoryName: 'categoryName',
          tagNames: 'tagNames',
        },
        bankAccountId: 1,
      };

      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(mockBankAccount);
      (transactionOperationsService.createAutomatedTransaction as jest.Mock).mockResolvedValue({
        id: 1,
        description: 'Test Transaction',
        amount: 100,
        type: 'expense' as 'income' | 'expense',
      } as Transaction);

      // Act
      const result = await service.importTransactions(importDto, mockUser.id);

      // Assert
      expect(result).toBeDefined();
      expect(result.transactions).toHaveLength(1);
      expect(result.status).toBe(ImportStatus.COMPLETED);
      expect(importLogsService.create).toHaveBeenCalled();
    });

    it('should handle base64 encoded CSV data', async () => {
      // Arrange
      const csvData = Buffer.from('description,amount,type,executionDate\nTest Transaction,100,expense,2024-01-15').toString('base64');
      const importDto: ImportTransactionDto = {
        csvData,
        columnMappings: {
          description: 'description',
          amount: 'amount',
          type: 'type',
          executionDate: 'executionDate',
          categoryName: 'categoryName',
          tagNames: 'tagNames',
        },
        bankAccountId: 1,
      };

      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(mockBankAccount);
      (transactionOperationsService.createAutomatedTransaction as jest.Mock).mockResolvedValue({
        id: 1,
        description: 'Test Transaction',
        amount: 100,
        type: 'expense' as 'income' | 'expense',
      } as Transaction);

      // Act
      const result = await service.importTransactions(importDto, mockUser.id);

      // Assert
      expect(result).toBeDefined();
      expect(result.transactions).toHaveLength(1);
      expect(importLogsService.appendToLog).toHaveBeenCalledWith(expect.any(Number), 'Successfully decoded base64 CSV data');
    });

    it('should throw error when CSV data is missing for generic import', async () => {
      // Arrange
      const importDto: ImportTransactionDto = {
        columnMappings: {
          description: 'description',
          amount: 'amount',
          type: 'type',
          executionDate: 'executionDate',
          categoryName: 'categoryName',
          tagNames: 'tagNames',
        },
      };

      // Act & Assert
      await expect(service.importTransactions(importDto, mockUser.id))
        .rejects.toThrow(BadRequestException);
    });

    it('should handle import errors gracefully', async () => {
      // Arrange
      const importDto: ImportTransactionDto = {
        bankFormat: 'bnl_txt',
        csvData: 'sample data',
      };

      jest.spyOn(BankFileParserFactory, 'getParser').mockImplementation(() => {
        throw new Error('Invalid parser');
      });

      // Act & Assert
      await expect(service.importTransactions(importDto, mockUser.id))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('processBankSpecificImport', () => {
    it('should process bank-specific import with credit card', async () => {
      // Arrange
      const importDto: ImportTransactionDto = {
        bankFormat: 'bnl_txt',
        csvData: 'sample data',
        creditCardId: 1,
      };

      jest.spyOn(BankFileParserFactory, 'getParser').mockReturnValue(new MockBankParser());
      (creditCardRepository.findOne as jest.Mock).mockResolvedValue(mockCreditCard);
      (transactionOperationsService.createAutomatedTransaction as jest.Mock).mockResolvedValue({
        id: 1,
        description: 'Test Transaction',
        amount: 100,
        type: 'expense' as 'income' | 'expense',
      } as Transaction);

      // Act
      const result = await service.processBankSpecificImport(importDto, mockUser.id, 1);

      // Assert
      expect(result).toBeDefined();
      expect(result.transactions).toHaveLength(2);
      expect(creditCardRepository.findOne).toHaveBeenCalled();
    });

    it('should process bank-specific import with bank account', async () => {
      // Arrange
      const importDto: ImportTransactionDto = {
        bankFormat: 'bnl_txt',
        csvData: 'sample data',
        bankAccountId: 1,
      };

      jest.spyOn(BankFileParserFactory, 'getParser').mockReturnValue(new MockBankParser());
      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(mockBankAccount);
      (transactionOperationsService.createAutomatedTransaction as jest.Mock).mockResolvedValue({
        id: 1,
        description: 'Test Transaction',
        amount: 100,
        type: 'expense' as 'income' | 'expense',
      } as Transaction);

      // Act
      const result = await service.processBankSpecificImport(importDto, mockUser.id, 1);

      // Assert
      expect(result).toBeDefined();
      expect(result.transactions).toHaveLength(2);
      // Note: Bank account repository is not called in bank-specific import flow
      // The bank account is already set by the parser
    });
  });

  describe('processGenericImport', () => {
    it('should process generic CSV import successfully', async () => {
      // Arrange
      const importDto: ImportTransactionDto = {
        csvData: 'description,amount,type,executionDate\nTest Transaction,100,expense,2024-01-15',
        columnMappings: {
          description: 'description',
          amount: 'amount',
          type: 'type',
          executionDate: 'executionDate',
          categoryName: 'categoryName',
          tagNames: 'tagNames',
        },
        bankAccountId: 1,
      };

      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(mockBankAccount);
      (transactionOperationsService.createAutomatedTransaction as jest.Mock).mockResolvedValue({
        id: 1,
        description: 'Test Transaction',
        amount: 100,
        type: 'expense' as 'income' | 'expense',
      } as Transaction);

      // Act
      const result = await service.processGenericImport(importDto, mockUser.id, 1);

      // Assert
      expect(result).toBeDefined();
      expect(result.transactions).toHaveLength(1);
    });

    it('should handle empty CSV data', async () => {
      // Arrange
      const importDto: ImportTransactionDto = {
        csvData: 'description,amount,type,executionDate\n',
        columnMappings: {
          description: 'description',
          amount: 'amount',
          type: 'type',
          executionDate: 'executionDate',
          categoryName: 'categoryName',
          tagNames: 'tagNames',
        },
      };

      // Act
      const result = await service.processGenericImport(importDto, mockUser.id, 1);

      // Assert
      expect(result).toBeDefined();
      expect(result.transactions).toHaveLength(0);
      expect(result.status).toBe(ImportStatus.COMPLETED);
    });

    it('should handle invalid amount format', async () => {
      // Arrange
      const importDto: ImportTransactionDto = {
        csvData: 'description,amount,type,executionDate\nTest Transaction,invalid,expense,2024-01-15',
        columnMappings: {
          description: 'description',
          amount: 'amount',
          type: 'type',
          executionDate: 'executionDate',
          categoryName: 'categoryName',
          tagNames: 'tagNames',
        },
        bankAccountId: 1,
      };

      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(mockBankAccount);

      // Act
      const result = await service.processGenericImport(importDto, mockUser.id, 1);

      // Assert
      expect(result).toBeDefined();
      expect(result.transactions).toHaveLength(0);
      expect(result.status).toBe(ImportStatus.PARTIALLY_COMPLETED);
    });
  });

  describe('processTransactionData', () => {
    it('should process transaction data with category creation', async () => {
      // Arrange
      const transactionData = {
        description: 'Test Transaction',
        amount: 100,
        type: 'expense' as 'income' | 'expense',
        executionDate: new Date('2024-01-15'),
        bankAccount: { id: 1 } as any,
      };

      (categoriesService.suggestCategoryForDescription as jest.Mock).mockResolvedValue(mockCategory);

      // Act
      const result = await service.processTransactionData(transactionData, mockUser.id);

      // Assert
      expect(result).toBeDefined();
      expect(result.category).toBe(mockCategory);
      expect(categoriesService.suggestCategoryForDescription).toHaveBeenCalledWith('Test Transaction', mockUser.id);
    });

    it('should process transaction data with tag creation', async () => {
      // Arrange
      const transactionData = {
        description: 'Test Transaction',
        amount: 100,
        type: 'expense' as 'income' | 'expense',
        executionDate: new Date('2024-01-15'),
        bankAccount: { id: 1 } as any,
        tagNames: ['tag1', 'tag2'],
      };

      (tagsService.findByName as jest.Mock).mockResolvedValue(null);
      (tagsService.create as jest.Mock).mockResolvedValue(mockTag);

      // Act
      const result = await service.processTransactionData(transactionData, mockUser.id);

      // Assert
      expect(result).toBeDefined();
      expect(result.tags).toHaveLength(2);
      expect(tagsService.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('calculateBillingDate', () => {
    it('should calculate billing date for credit card transaction', () => {
      // Arrange
      const executionDate = new Date('2024-01-15');
      const billingDay = 15;

      // Act
      const result = service.calculateBillingDate(executionDate, billingDay);

      // Assert
      expect(result).toBeInstanceOf(Date);
      expect(result.getDate()).toBe(15);
      expect(result.getMonth()).toBe(1); // February (next month)
    });

    it('should handle billing date calculation for next month', () => {
      // Arrange
      const executionDate = new Date('2024-01-20');
      const billingDay = 15;

      // Act
      const result = service.calculateBillingDate(executionDate, billingDay);

      // Assert
      expect(result).toBeInstanceOf(Date);
      expect(result.getDate()).toBe(15);
      expect(result.getMonth()).toBe(1); // February (next month)
    });
  });

  describe('processForRecurringPatterns', () => {
    it('should process transactions for recurring patterns', async () => {
      // Arrange
      const transactions = [
        { id: 1, description: 'Test Transaction 1' },
        { id: 2, description: 'Test Transaction 2' },
      ] as Transaction[];

      (recurringPatternDetectorService.detectAllRecurringPatterns as jest.Mock).mockResolvedValue([]);

      // Act
      await service.processForRecurringPatterns(transactions, mockUser.id);

      // Assert
      expect(recurringPatternDetectorService.detectAllRecurringPatterns).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('isBase64', () => {
    it('should detect base64 encoded string', () => {
      // Arrange
      const base64String = Buffer.from('test data that is long enough to pass the base64 detection').toString('base64');

      // Act
      const result = service.isBase64(base64String);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-base64 string', () => {
      // Arrange
      const regularString = 'test data';

      // Act
      const result = service.isBase64(regularString);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('normalizeAmount', () => {
    it('should normalize positive amount for income', () => {
      // Act
      const result = service.normalizeAmount(100, 'income');

      // Assert
      expect(result).toBe(100);
    });

    it('should normalize negative amount for expense', () => {
      // Act
      const result = service.normalizeAmount(-100, 'expense');

      // Assert
      expect(result).toBe(-100);
    });

    it('should normalize positive amount for expense', () => {
      // Act
      const result = service.normalizeAmount(100, 'expense');

      // Assert
      expect(result).toBe(-100);
    });
  });
});
