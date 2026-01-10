import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Between } from 'typeorm';
import { TransactionCreationService } from './transaction-creation.service';
import { Transaction } from './transaction.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { DuplicateTransactionChoice } from './dto/duplicate-transaction-choice.dto';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import { PendingDuplicatesService } from '../pending-duplicates/pending-duplicates.service';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';

describe('TransactionCreationService', () => {
  let service: TransactionCreationService;
  let module: TestingModule;
  let transactionRepository: any;
  let bankAccountRepository: any;
  let creditCardRepository: any;
  let categoryRepository: any;
  let tagRepository: any;
  let categoriesService: any;
  let tagsService: any;
  let pendingDuplicatesService: any;

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
  };

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
  };

  const mockCreditCard = {
    id: 1,
    name: 'Test Credit Card',
    billingDay: 15,
    user: mockUser,
    bankAccount: mockBankAccount,
    transactions: [],
    recurringTransactions: [],
  };

  const mockCategory = {
    id: 1,
    name: 'Test Category',
    user: mockUser,
    transactions: [],
    recurringTransactions: [],
    keywords: [],
    excludeFromExpenseAnalytics: false,
    analyticsExclusionReason: null,
    budgetLevel: 'monthly',
    monthlyBudget: null,
    yearlyBudget: null,
    maxThreshold: null,
    warningThreshold: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTag = {
    id: 1,
    name: 'Test Tag',
    user: mockUser,
    transactions: [],
    recurringTransactions: [],
  };

  beforeEach(async () => {
    const mockCategoriesService = {
      suggestCategoryForDescription: jest.fn(),
      findOne: jest.fn(),
    };

    const mockTagsService = {
      findByIds: jest.fn(),
    };

    const mockPendingDuplicatesService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findMatchingTransactions: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        TransactionCreationService,
        RepositoryMockFactory.createRepositoryProvider(Transaction),
        RepositoryMockFactory.createRepositoryProvider(BankAccount),
        RepositoryMockFactory.createRepositoryProvider(CreditCard),
        RepositoryMockFactory.createRepositoryProvider(Category),
        RepositoryMockFactory.createRepositoryProvider(Tag),
        {
          provide: CategoriesService,
          useValue: mockCategoriesService,
        },
        {
          provide: TagsService,
          useValue: mockTagsService,
        },
        {
          provide: PendingDuplicatesService,
          useValue: mockPendingDuplicatesService,
        },
      ],
    }).compile();

    service = module.get<TransactionCreationService>(
      TransactionCreationService,
    );
    transactionRepository = module.get(getRepositoryToken(Transaction));
    bankAccountRepository = module.get(getRepositoryToken(BankAccount));
    creditCardRepository = module.get(getRepositoryToken(CreditCard));
    categoryRepository = module.get(getRepositoryToken(Category));
    tagRepository = module.get(getRepositoryToken(Tag));
    categoriesService = module.get<CategoriesService>(CategoriesService);
    tagsService = module.get<TagsService>(TagsService);
    pendingDuplicatesService = module.get<PendingDuplicatesService>(
      PendingDuplicatesService,
    );
  });

  afterEach(async () => {
    await module.close();
  });

  describe('createAndSaveTransaction', () => {
    it('should create a transaction with bank account', async () => {
      // Arrange
      const createDto: CreateTransactionDto = {
        description: 'Test Transaction',
        amount: 100.5,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        bankAccountId: 1,
        executionDate: new Date('2024-01-15'),
        categoryId: 1,
        tagIds: [1],
      };

      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(
        mockBankAccount,
      );
      (categoryRepository.findOne as jest.Mock).mockResolvedValue(mockCategory);
      (tagRepository.find as jest.Mock).mockResolvedValue([mockTag]);
      (transactionRepository.save as jest.Mock).mockResolvedValue({
        id: 1,
        ...createDto,
        user: mockUser,
        bankAccount: mockBankAccount,
        category: mockCategory,
        tags: [mockTag],
        status: 'executed',
        billingDate: new Date('2024-01-15'),
      } as any);

      // Act
      const result = await service.createAndSaveTransaction(
        createDto,
        mockUser.id,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.description).toBe('Test Transaction');
      expect(result.amount).toBe(100.5);
      expect(result.type).toBe('expense');
      expect(result.bankAccount).toBe(mockBankAccount);
      expect(result.category).toBe(mockCategory);
      expect(result.tags).toEqual([mockTag]);
      expect(transactionRepository.save).toHaveBeenCalled();
    });

    it('should create a transaction with credit card and calculate billing date', async () => {
      // Arrange
      const createDto: CreateTransactionDto = {
        description: 'Credit Card Transaction',
        amount: 250.75,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        creditCardId: 1,
        executionDate: new Date('2024-01-10'),
        categoryId: 1,
      };

      (creditCardRepository.findOne as jest.Mock).mockResolvedValue(
        mockCreditCard,
      );
      (categoryRepository.findOne as jest.Mock).mockResolvedValue(mockCategory);
      (transactionRepository.save as jest.Mock).mockResolvedValue({
        id: 1,
        ...createDto,
        user: mockUser,
        creditCard: mockCreditCard,
        category: mockCategory,
        status: 'executed',
        billingDate: new Date('2024-02-15'), // Calculated billing date
      } as any);

      // Act
      const result = await service.createAndSaveTransaction(
        createDto,
        mockUser.id,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.creditCard).toBe(mockCreditCard);
      expect(result.billingDate).toEqual(new Date('2024-02-15'));
      expect(transactionRepository.save).toHaveBeenCalled();
    });

    it('should auto-categorize transaction when no category provided', async () => {
      // Arrange
      const createDto: CreateTransactionDto = {
        description: 'Netflix Subscription',
        amount: 15.99,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        bankAccountId: 1,
        executionDate: new Date('2024-01-15'),
        categoryId: 0, // Use 0 to indicate no category provided
      };

      const suggestedCategory = { ...mockCategory, name: 'Entertainment' };

      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(
        mockBankAccount,
      );
      (categoryRepository.findOne as jest.Mock).mockResolvedValue(null); // No category found for ID 0
      (
        categoriesService.suggestCategoryForDescription as jest.Mock
      ).mockResolvedValue(suggestedCategory);
      (transactionRepository.save as jest.Mock).mockResolvedValue({
        id: 1,
        ...createDto,
        user: mockUser,
        bankAccount: mockBankAccount,
        category: suggestedCategory,
        status: 'executed',
      } as any);

      // Act
      const result = await service.createAndSaveTransaction(
        createDto,
        mockUser.id,
      );

      // Assert
      expect(
        categoriesService.suggestCategoryForDescription,
      ).toHaveBeenCalledWith('Netflix Subscription', mockUser.id);
      expect(result.category).toBe(suggestedCategory);
      expect(transactionRepository.save).toHaveBeenCalled();
    });

    it('should throw error when both bank account and credit card provided', async () => {
      // Arrange
      const createDto: CreateTransactionDto = {
        description: 'Invalid Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        bankAccountId: 1,
        creditCardId: 1,
        executionDate: new Date('2024-01-15'),
        categoryId: 1,
      };

      // Mock category repository to avoid NotFoundException
      (categoryRepository.findOne as jest.Mock).mockResolvedValue(mockCategory);

      // Act & Assert
      await expect(
        service.createAndSaveTransaction(createDto, mockUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when neither bank account nor credit card provided', async () => {
      // Arrange
      const createDto: CreateTransactionDto = {
        description: 'Invalid Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        executionDate: new Date('2024-01-15'),
        categoryId: 1,
      };

      // Mock category repository to avoid NotFoundException
      (categoryRepository.findOne as jest.Mock).mockResolvedValue(mockCategory);

      // Act & Assert
      await expect(
        service.createAndSaveTransaction(createDto, mockUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when bank account not found', async () => {
      // Arrange
      const createDto: CreateTransactionDto = {
        description: 'Test Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        bankAccountId: 999,
        executionDate: new Date('2024-01-15'),
        categoryId: 1,
      };

      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.createAndSaveTransaction(createDto, mockUser.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error when credit card not found', async () => {
      // Arrange
      const createDto: CreateTransactionDto = {
        description: 'Test Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        creditCardId: 999,
        executionDate: new Date('2024-01-15'),
        categoryId: 1,
      };

      (creditCardRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.createAndSaveTransaction(createDto, mockUser.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error when category not found', async () => {
      // Arrange
      const createDto: CreateTransactionDto = {
        description: 'Test Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        bankAccountId: 1,
        categoryId: 999,
        executionDate: new Date('2024-01-15'),
      };

      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(
        mockBankAccount,
      );
      (categoryRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.createAndSaveTransaction(createDto, mockUser.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle duplicate detection when duplicate found', async () => {
      // Arrange
      const createDto: CreateTransactionDto = {
        description: 'Duplicate Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        bankAccountId: 1,
        executionDate: new Date('2024-01-15'),
        categoryId: 1,
      };

      const existingTransaction = {
        id: 1,
        description: 'Duplicate Transaction',
        amount: 100,
        type: 'expense',
        executionDate: new Date('2024-01-15'),
        user: mockUser,
      };

      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(
        mockBankAccount,
      );
      (categoryRepository.findOne as jest.Mock).mockResolvedValue(mockCategory);
      jest
        .spyOn(service, 'findPotentialDuplicate')
        .mockResolvedValue(existingTransaction as any);
      jest.spyOn(service, 'handleDuplicateConfirmation').mockResolvedValue({
        id: 2,
        ...createDto,
        user: mockUser,
        bankAccount: mockBankAccount,
      } as any);

      // Act
      const result = await service.createAndSaveTransaction(
        createDto,
        mockUser.id,
      );

      // Assert
      expect(service.findPotentialDuplicate).toHaveBeenCalledWith(
        100,
        'expense',
        new Date('2024-01-15'),
        mockUser.id,
      );
      expect(service.handleDuplicateConfirmation).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should skip duplicate check when skipDuplicateCheck is true', async () => {
      // Arrange
      const createDto: CreateTransactionDto = {
        description: 'Test Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        bankAccountId: 1,
        executionDate: new Date('2024-01-15'),
        categoryId: 1,
      };

      (bankAccountRepository.findOne as jest.Mock).mockResolvedValue(
        mockBankAccount,
      );
      (categoryRepository.findOne as jest.Mock).mockResolvedValue(mockCategory);
      (transactionRepository.save as jest.Mock).mockResolvedValue({
        id: 1,
        ...createDto,
        user: mockUser,
        bankAccount: mockBankAccount,
        status: 'executed',
      } as any);

      // Mock the findPotentialDuplicate method to track calls
      const findPotentialDuplicateSpy = jest.spyOn(
        service,
        'findPotentialDuplicate',
      );

      // Act
      const result = await service.createAndSaveTransaction(
        createDto,
        mockUser.id,
        undefined,
        true,
      );

      // Assert
      expect(findPotentialDuplicateSpy).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findPotentialDuplicate', () => {
    it('should find potential duplicate transaction', async () => {
      // Arrange
      const amount = 100;
      const type = 'expense';
      const executionDate = new Date('2024-01-15');
      const userId = 1;

      const duplicateTransaction = {
        id: 1,
        description: 'Test Transaction',
        amount: 100,
        type: 'expense',
        executionDate: new Date('2024-01-15'),
        user: { id: 1 },
      };

      (transactionRepository.findOne as jest.Mock).mockResolvedValue(
        duplicateTransaction,
      );

      // Act
      const result = await service.findPotentialDuplicate(
        amount,
        type,
        executionDate,
        userId,
      );

      // Assert
      expect(result).toBe(duplicateTransaction);
      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: {
          amount,
          type,
          user: { id: userId },
          executionDate: Between(
            new Date(executionDate.getTime() - 24 * 60 * 60 * 1000),
            new Date(executionDate.getTime() + 24 * 60 * 60 * 1000),
          ),
        },
      } as any);
    });

    it('should return null when no duplicate found', async () => {
      // Arrange
      (transactionRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await service.findPotentialDuplicate(
        100,
        'expense',
        new Date('2024-01-15'),
        1,
      );

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('handleDuplicateConfirmation', () => {
    it('should handle duplicate with REPLACE choice', async () => {
      // Arrange
      const existingTransaction = {
        id: 1,
        description: 'Old Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        createdAt: new Date(),
        category: null,
        suggestedCategory: null,
        suggestedCategoryName: null,
        bankAccount: null,
        creditCard: null,
        user: mockUser,
        tags: [],
        executionDate: new Date('2024-01-15'),
        billingDate: new Date('2024-01-15'),
        categorizationConfidence: null,
        transactionIdOpenBankAPI: null,
      } as any;

      const newTransactionData: CreateTransactionDto = {
        description: 'New Transaction',
        amount: 150,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        bankAccountId: 1,
        executionDate: new Date('2024-01-15'),
        categoryId: 1,
      };

      jest.spyOn(service, 'handleDuplicateResolution').mockResolvedValue({
        id: 1,
        ...newTransactionData,
        user: mockUser,
      } as any);

      // Act
      const result = await service.handleDuplicateConfirmation(
        existingTransaction,
        newTransactionData,
        mockUser.id,
        DuplicateTransactionChoice.USE_NEW,
      );

      // Assert
      expect(service.handleDuplicateResolution).toHaveBeenCalledWith(
        existingTransaction,
        newTransactionData,
        mockUser.id,
        DuplicateTransactionChoice.USE_NEW,
      );
      expect(result).toBeDefined();
    });

    it('should handle duplicate with MAINTAIN_BOTH choice', async () => {
      // Arrange
      const existingTransaction = {
        id: 1,
        description: 'Existing Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        createdAt: new Date(),
        category: null,
        suggestedCategory: null,
        suggestedCategoryName: null,
        bankAccount: null,
        creditCard: null,
        user: mockUser,
        tags: [],
        executionDate: new Date('2024-01-15'),
        billingDate: new Date('2024-01-15'),
        categorizationConfidence: null,
        transactionIdOpenBankAPI: null,
      } as any;

      const newTransactionData: CreateTransactionDto = {
        description: 'New Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        bankAccountId: 1,
        executionDate: new Date('2024-01-15'),
        categoryId: 1,
      };

      jest.spyOn(service, 'handleDuplicateResolution').mockResolvedValue({
        id: 2,
        ...newTransactionData,
        user: mockUser,
      } as any);

      // Act
      const result = await service.handleDuplicateConfirmation(
        existingTransaction,
        newTransactionData,
        mockUser.id,
        DuplicateTransactionChoice.MAINTAIN_BOTH,
      );

      // Assert
      expect(service.handleDuplicateResolution).toHaveBeenCalledWith(
        existingTransaction,
        newTransactionData,
        mockUser.id,
        DuplicateTransactionChoice.MAINTAIN_BOTH,
      );
      expect(result).toBeDefined();
    });

    it('should handle duplicate with MERGE choice', async () => {
      // Arrange
      const existingTransaction = {
        id: 1,
        description: 'Existing Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        createdAt: new Date(),
        category: null,
        suggestedCategory: null,
        suggestedCategoryName: null,
        bankAccount: null,
        creditCard: null,
        user: mockUser,
        tags: [],
        executionDate: new Date('2024-01-15'),
        billingDate: new Date('2024-01-15'),
        categorizationConfidence: null,
        transactionIdOpenBankAPI: null,
      } as any;

      const newTransactionData: CreateTransactionDto = {
        description: 'New Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        bankAccountId: 1,
        executionDate: new Date('2024-01-15'),
        categoryId: 1,
      };

      jest.spyOn(service, 'handleDuplicateResolution').mockResolvedValue({
        id: 1,
        ...newTransactionData,
        user: mockUser,
      } as any);

      // Act
      const result = await service.handleDuplicateConfirmation(
        existingTransaction,
        newTransactionData,
        mockUser.id,
        DuplicateTransactionChoice.KEEP_EXISTING,
      );

      // Assert
      expect(service.handleDuplicateResolution).toHaveBeenCalledWith(
        existingTransaction,
        newTransactionData,
        mockUser.id,
        DuplicateTransactionChoice.KEEP_EXISTING,
      );
      expect(result).toBeDefined();
    });
  });

  describe('handleDuplicateResolution', () => {
    it('should replace existing transaction with REPLACE choice', async () => {
      // Arrange
      const existingTransaction = {
        id: 1,
        description: 'Old Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        createdAt: new Date(),
        category: null,
        suggestedCategory: null,
        suggestedCategoryName: null,
        bankAccount: null,
        creditCard: null,
        user: mockUser,
        tags: [],
        executionDate: new Date('2024-01-15'),
        billingDate: new Date('2024-01-15'),
        categorizationConfidence: null,
        transactionIdOpenBankAPI: null,
      } as any;

      const newTransactionData: CreateTransactionDto = {
        description: 'New Transaction',
        amount: 150,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        bankAccountId: 1,
        executionDate: new Date('2024-01-15'),
        categoryId: 1,
      };

      (transactionRepository.save as jest.Mock).mockResolvedValue({
        id: 1,
        ...newTransactionData,
        user: mockUser,
      } as any);

      // Mock the createAndSaveTransaction method to avoid internal calls
      const createAndSaveTransactionSpy = jest
        .spyOn(service, 'createAndSaveTransaction')
        .mockResolvedValue({
          id: 1,
          ...newTransactionData,
          user: mockUser,
        } as any);

      // Act
      const result = await service.handleDuplicateResolution(
        existingTransaction,
        newTransactionData,
        mockUser.id,
        DuplicateTransactionChoice.USE_NEW,
      );

      // Assert
      expect(createAndSaveTransactionSpy).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create new transaction with MAINTAIN_BOTH choice', async () => {
      // Arrange
      const existingTransaction = {
        id: 1,
        description: 'Existing Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        createdAt: new Date(),
        category: null,
        suggestedCategory: null,
        suggestedCategoryName: null,
        bankAccount: null,
        creditCard: null,
        user: mockUser,
        tags: [],
        executionDate: new Date('2024-01-15'),
        billingDate: new Date('2024-01-15'),
        categorizationConfidence: null,
        transactionIdOpenBankAPI: null,
      } as any;

      const newTransactionData: CreateTransactionDto = {
        description: 'New Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        bankAccountId: 1,
        executionDate: new Date('2024-01-15'),
        categoryId: 1,
      };

      (transactionRepository.save as jest.Mock).mockResolvedValue({
        id: 2,
        ...newTransactionData,
        user: mockUser,
      } as any);

      // Mock the createAndSaveTransaction method to avoid internal calls
      const createAndSaveTransactionSpy = jest
        .spyOn(service, 'createAndSaveTransaction')
        .mockResolvedValue({
          id: 2,
          ...newTransactionData,
          user: mockUser,
        } as any);

      // Act
      const result = await service.handleDuplicateResolution(
        existingTransaction,
        newTransactionData,
        mockUser.id,
        DuplicateTransactionChoice.MAINTAIN_BOTH,
      );

      // Assert
      expect(createAndSaveTransactionSpy).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should merge transactions with MERGE choice', async () => {
      // Arrange
      const existingTransaction = {
        id: 1,
        description: 'Existing Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        createdAt: new Date(),
        category: null,
        suggestedCategory: null,
        suggestedCategoryName: null,
        bankAccount: null,
        creditCard: null,
        user: mockUser,
        tags: [],
        executionDate: new Date('2024-01-15'),
        billingDate: new Date('2024-01-15'),
        categorizationConfidence: null,
        transactionIdOpenBankAPI: null,
      } as any;

      const newTransactionData: CreateTransactionDto = {
        description: 'New Transaction',
        amount: 100,
        type: 'expense',
        status: 'executed',
        source: 'manual',
        bankAccountId: 1,
        executionDate: new Date('2024-01-15'),
        categoryId: 1,
      };

      (transactionRepository.save as jest.Mock).mockResolvedValue({
        id: 1,
        ...newTransactionData,
        user: mockUser,
      } as any);

      // Act
      const result = await service.handleDuplicateResolution(
        existingTransaction,
        newTransactionData,
        mockUser.id,
        DuplicateTransactionChoice.KEEP_EXISTING,
      );

      // Assert
      expect(result).toBe(existingTransaction);
      expect(result).toBeDefined();
    });
  });

  describe('calculateBillingDate', () => {
    it('should calculate billing date for credit card transaction', () => {
      // Arrange
      const executionDate = new Date('2024-01-10');
      const billingDay = 15;

      // Act
      const result = service.calculateBillingDate(executionDate, billingDay);

      // Assert
      expect(result).toBeInstanceOf(Date);
      expect(result.getDate()).toBe(15);
    });

    it('should handle billing date calculation for next month', () => {
      // Arrange
      const executionDate = new Date('2024-01-20');
      const billingDay = 15;

      // Act
      const result = service.calculateBillingDate(executionDate, billingDay);

      // Assert
      expect(result).toBeInstanceOf(Date);
      expect(result.getMonth()).toBe(1); // February (0-indexed)
      expect(result.getDate()).toBe(15);
    });
  });

  describe('transactionExists', () => {
    it('should return true when transaction exists', async () => {
      // Arrange
      const amount = 100;
      const type = 'expense';
      const executionDate = new Date('2024-01-15');
      const userId = 1;

      (transactionRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        amount,
        type,
        executionDate,
        user: { id: userId },
      } as any);

      // Act
      const result = await service.transactionExists(
        amount,
        type,
        executionDate,
        userId,
      );

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when transaction does not exist', async () => {
      // Arrange
      (transactionRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await service.transactionExists(
        100,
        'expense',
        new Date('2024-01-15'),
        1,
      );

      // Assert
      expect(result).toBe(false);
    });

    it('should throw error when executionDate is null', async () => {
      // Act & Assert
      await expect(
        service.transactionExists(100, 'expense', null as any, 1),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
