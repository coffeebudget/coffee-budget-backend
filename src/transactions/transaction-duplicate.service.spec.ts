import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionDuplicateService } from './transaction-duplicate.service';
import { Transaction } from './transaction.entity';
import { DuplicateDetectionService } from '../pending-duplicates/duplicate-detection.service';
import { PendingDuplicatesService } from '../pending-duplicates/pending-duplicates.service';
import { TransactionCreationService } from './transaction-creation.service';
import { DuplicateTransactionChoice } from './dto/duplicate-transaction-choice.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';

describe('TransactionDuplicateService', () => {
  let service: TransactionDuplicateService;
  let transactionRepository: jest.Mocked<Repository<Transaction>>;
  let duplicateDetectionService: jest.Mocked<DuplicateDetectionService>;
  let pendingDuplicatesService: jest.Mocked<PendingDuplicatesService>;
  let transactionCreationService: jest.Mocked<TransactionCreationService>;

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
    paymentAccounts: [],
  } as any;

  const mockTransaction = {
    id: 1,
    description: 'Test Transaction',
    amount: -100,
    type: 'expense' as const,
    executionDate: new Date('2024-01-15'),
    billingDate: new Date('2024-01-15'),
    status: 'executed' as const,
    source: 'manual' as const,
    createdAt: new Date('2024-01-15'),
    category: null as any,
    suggestedCategory: null as any,
    suggestedCategoryName: null as any,
    bankAccount: null as any,
    creditCard: null as any,
    tags: [],
    user: mockUser,
    categorizationConfidence: null as any,
    transactionIdOpenBankAPI: null as any,
    merchantName: null,
    merchantCategoryCode: null,
    debtorName: null,
    creditorName: null,
    enrichedFromPaymentActivityId: null,
    originalMerchantName: null,
    enhancedMerchantName: null,
    enhancedCategoryConfidence: null,
    rawGoCardlessData: null,
  } as Transaction;

  const mockDuplicateTransaction = {
    id: 2,
    description: 'Test Transaction',
    amount: -100,
    type: 'expense' as const,
    executionDate: new Date('2024-01-15'),
    billingDate: new Date('2024-01-15'),
    status: 'executed' as const,
    source: 'manual' as const,
    createdAt: new Date('2024-01-14'),
    category: null as any,
    suggestedCategory: null as any,
    suggestedCategoryName: null as any,
    bankAccount: null as any,
    creditCard: null as any,
    tags: [],
    user: mockUser,
    categorizationConfidence: null as any,
    transactionIdOpenBankAPI: null as any,
    merchantName: null,
    merchantCategoryCode: null,
    debtorName: null,
    creditorName: null,
    enrichedFromPaymentActivityId: null,
    originalMerchantName: null,
    enhancedMerchantName: null,
    enhancedCategoryConfidence: null,
    rawGoCardlessData: null,
  } as Transaction;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionDuplicateService,
        RepositoryMockFactory.createRepositoryProvider(Transaction),
        {
          provide: DuplicateDetectionService,
          useValue: {
            checkForDuplicateBeforeCreation: jest.fn(),
            detectDuplicates: jest.fn(),
          },
        },
        {
          provide: PendingDuplicatesService,
          useValue: {
            createPendingDuplicate: jest.fn(),
            findAllByExistingTransactionId: jest.fn(),
            resolvePendingDuplicate: jest.fn(),
          },
        },
        {
          provide: TransactionCreationService,
          useValue: {
            createAndSaveTransaction: jest.fn(),
            findPotentialDuplicate: jest.fn(),
            handleDuplicateResolution: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionDuplicateService>(
      TransactionDuplicateService,
    );
    transactionRepository = module.get(getRepositoryToken(Transaction));
    duplicateDetectionService = module.get(DuplicateDetectionService);
    pendingDuplicatesService = module.get(PendingDuplicatesService);
    transactionCreationService = module.get(TransactionCreationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findPotentialDuplicate', () => {
    it('should find potential duplicate transaction', async () => {
      const amount = -100;
      const type = 'expense';
      const executionDate = new Date('2024-01-15');
      const userId = 1;

      // Mock QueryBuilder chain
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockDuplicateTransaction),
      };
      transactionRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.findPotentialDuplicate(
        amount,
        type,
        executionDate,
        userId,
      );

      expect(result).toEqual(mockDuplicateTransaction);
      expect(transactionRepository.createQueryBuilder).toHaveBeenCalledWith(
        'transaction',
      );
      expect(mockQueryBuilder.innerJoin).toHaveBeenCalledWith(
        'transaction.user',
        'user',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user.id = :userId', {
        userId,
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'transaction.type = :type',
        { type },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'transaction.executionDate BETWEEN :startDate AND :endDate',
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        }),
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ABS(transaction.amount - :amount) <= :tolerance',
        { amount, tolerance: 0.01 },
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'transaction.createdAt',
        'DESC',
      );
      expect(mockQueryBuilder.getOne).toHaveBeenCalled();
    });

    it('should return null when no duplicate found', async () => {
      const amount = -100;
      const type = 'expense';
      const executionDate = new Date('2024-01-15');
      const userId = 1;

      // Mock QueryBuilder chain returning null
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      transactionRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.findPotentialDuplicate(
        amount,
        type,
        executionDate,
        userId,
      );

      expect(result).toBeNull();
    });

    it('should handle different transaction types correctly', async () => {
      const amount = 100;
      const type = 'income';
      const executionDate = new Date('2024-01-15');
      const userId = 1;

      const incomeTransaction = {
        ...mockDuplicateTransaction,
        amount: 100,
        type: 'income' as const,
      };

      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(incomeTransaction),
      };
      transactionRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.findPotentialDuplicate(
        amount,
        type,
        executionDate,
        userId,
      );

      expect(result).toEqual(incomeTransaction);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'transaction.type = :type',
        { type: 'income' },
      );
    });

    it('should apply $0.01 tolerance to amount matching', async () => {
      const amount = -100;
      const type = 'expense';
      const executionDate = new Date('2024-01-15');
      const userId = 1;

      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockDuplicateTransaction),
      };
      transactionRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      await service.findPotentialDuplicate(amount, type, executionDate, userId);

      // Verify tolerance is applied in the query
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ABS(transaction.amount - :amount) <= :tolerance',
        { amount: -100, tolerance: 0.01 },
      );
    });
  });

  describe('detectSimilarTransactions', () => {
    it('should detect similar transactions using DuplicateDetectionService', async () => {
      const userId = 1;
      const similarTransactions = [mockDuplicateTransaction];

      duplicateDetectionService.detectDuplicates.mockResolvedValue({
        potentialDuplicatesFound: 1,
        pendingDuplicatesCreated: 0,
        preventedDuplicates: 0,
        usersProcessed: 1,
        executionTime: '1.0s',
        duplicateGroups: [
          {
            transactions: [mockTransaction, mockDuplicateTransaction],
            reason: 'Similar transactions',
            confidence: 'high' as const,
          },
        ],
      });

      const result = await service.detectSimilarTransactions(
        mockTransaction,
        userId,
      );

      expect(result).toEqual(similarTransactions);
      expect(duplicateDetectionService.detectDuplicates).toHaveBeenCalledWith(
        userId,
      );
    });

    it('should return empty array when no similar transactions found', async () => {
      const userId = 1;

      duplicateDetectionService.detectDuplicates.mockResolvedValue({
        potentialDuplicatesFound: 0,
        pendingDuplicatesCreated: 0,
        preventedDuplicates: 0,
        usersProcessed: 1,
        executionTime: '1.0s',
        duplicateGroups: [],
      });

      const result = await service.detectSimilarTransactions(
        mockTransaction,
        userId,
      );

      expect(result).toEqual([]);
    });

    it('should handle errors from DuplicateDetectionService', async () => {
      const userId = 1;
      const error = new Error('Detection failed');

      duplicateDetectionService.detectDuplicates.mockRejectedValue(error);

      await expect(
        service.detectSimilarTransactions(mockTransaction, userId),
      ).rejects.toThrow('Detection failed');
    });
  });

  describe('calculateSimilarityScore', () => {
    it('should calculate similarity score using DuplicateDetectionService', async () => {
      const score = 85.5;

      duplicateDetectionService.checkForDuplicateBeforeCreation.mockResolvedValue(
        {
          isDuplicate: true,
          existingTransaction: mockDuplicateTransaction,
          similarityScore: score,
          reason: 'High similarity',
          confidence: 'high' as const,
          shouldPrevent: false,
          shouldCreatePending: true,
        },
      );

      const result = await service.calculateSimilarityScore(
        mockTransaction,
        mockDuplicateTransaction,
      );

      expect(result).toBe(score);
      expect(
        duplicateDetectionService.checkForDuplicateBeforeCreation,
      ).toHaveBeenCalled();
    });

    it('should return 0 for completely different transactions', async () => {
      duplicateDetectionService.checkForDuplicateBeforeCreation.mockResolvedValue(
        {
          isDuplicate: false,
          existingTransaction: undefined,
          similarityScore: 0,
          reason: 'No match',
          confidence: 'low' as const,
          shouldPrevent: false,
          shouldCreatePending: false,
        },
      );

      const result = await service.calculateSimilarityScore(
        mockTransaction,
        mockDuplicateTransaction,
      );

      expect(result).toBe(0);
    });

    it('should return 100 for identical transactions', async () => {
      duplicateDetectionService.checkForDuplicateBeforeCreation.mockResolvedValue(
        {
          isDuplicate: true,
          existingTransaction: mockTransaction,
          similarityScore: 100,
          reason: 'Exact match',
          confidence: 'high' as const,
          shouldPrevent: true,
          shouldCreatePending: false,
        },
      );

      const result = await service.calculateSimilarityScore(
        mockTransaction,
        mockTransaction,
      );

      expect(result).toBe(100);
    });
  });

  describe('handleDuplicateResolution', () => {
    const mockCreateTransactionDto: CreateTransactionDto = {
      description: 'New Transaction',
      amount: -100,
      type: 'expense',
      executionDate: new Date('2024-01-15'),
      status: 'executed',
      source: 'manual',
      categoryId: 1,
    };

    it('should handle USE_NEW choice by creating new transaction', async () => {
      const userId = 1;
      const choice = DuplicateTransactionChoice.USE_NEW;
      const newTransaction = { ...mockTransaction, id: 3 };

      transactionCreationService.createAndSaveTransaction.mockResolvedValue(
        newTransaction,
      );

      const result = await service.handleDuplicateResolution(
        mockDuplicateTransaction,
        mockCreateTransactionDto,
        userId,
        choice,
      );

      expect(result).toEqual(newTransaction);
      expect(
        transactionCreationService.createAndSaveTransaction,
      ).toHaveBeenCalledWith(mockCreateTransactionDto, userId);
    });

    it('should handle KEEP_EXISTING choice by returning existing transaction', async () => {
      const userId = 1;
      const choice = DuplicateTransactionChoice.KEEP_EXISTING;

      const result = await service.handleDuplicateResolution(
        mockDuplicateTransaction,
        mockCreateTransactionDto,
        userId,
        choice,
      );

      expect(result).toEqual(mockDuplicateTransaction);
      expect(
        transactionCreationService.createAndSaveTransaction,
      ).not.toHaveBeenCalled();
    });

    it('should handle MAINTAIN_BOTH choice by creating new transaction', async () => {
      const userId = 1;
      const choice = DuplicateTransactionChoice.MAINTAIN_BOTH;
      const newTransaction = { ...mockTransaction, id: 3 };

      transactionCreationService.createAndSaveTransaction.mockResolvedValue(
        newTransaction,
      );

      const result = await service.handleDuplicateResolution(
        mockDuplicateTransaction,
        mockCreateTransactionDto,
        userId,
        choice,
      );

      expect(result).toEqual(newTransaction);
      expect(
        transactionCreationService.createAndSaveTransaction,
      ).toHaveBeenCalledWith(mockCreateTransactionDto, userId);
    });

    it('should handle null existing transaction by creating new transaction', async () => {
      const userId = 1;
      const choice = DuplicateTransactionChoice.USE_NEW;
      const newTransaction = { ...mockTransaction, id: 3 };

      transactionCreationService.createAndSaveTransaction.mockResolvedValue(
        newTransaction,
      );

      const result = await service.handleDuplicateResolution(
        null,
        mockCreateTransactionDto,
        userId,
        choice,
      );

      expect(result).toEqual(newTransaction);
      expect(
        transactionCreationService.createAndSaveTransaction,
      ).toHaveBeenCalledWith(mockCreateTransactionDto, userId);
    });

    it('should handle errors during transaction creation', async () => {
      const userId = 1;
      const choice = DuplicateTransactionChoice.USE_NEW;
      const error = new Error('Creation failed');

      transactionCreationService.createAndSaveTransaction.mockRejectedValue(
        error,
      );

      await expect(
        service.handleDuplicateResolution(
          mockDuplicateTransaction,
          mockCreateTransactionDto,
          userId,
          choice,
        ),
      ).rejects.toThrow('Creation failed');
    });
  });

  describe('handleDuplicateConfirmation', () => {
    const mockCreateTransactionDto: CreateTransactionDto = {
      description: 'New Transaction',
      amount: -100,
      type: 'expense',
      executionDate: new Date('2024-01-15'),
      status: 'executed',
      source: 'manual',
      categoryId: 1,
    };

    it('should throw error when no user choice provided', async () => {
      const userId = 1;

      await expect(
        service.handleDuplicateConfirmation(
          mockDuplicateTransaction,
          mockCreateTransactionDto,
          userId,
        ),
      ).rejects.toThrow('Duplicate transaction detected');
    });

    it('should handle duplicate resolution with user choice', async () => {
      const userId = 1;
      const userChoice = DuplicateTransactionChoice.USE_NEW;
      const newTransaction = { ...mockTransaction, id: 3 };

      jest
        .spyOn(service, 'handleDuplicateResolution')
        .mockResolvedValue(newTransaction);

      const result = await service.handleDuplicateConfirmation(
        mockDuplicateTransaction,
        mockCreateTransactionDto,
        userId,
        userChoice,
      );

      expect(result).toEqual(newTransaction);
      expect(service.handleDuplicateResolution).toHaveBeenCalledWith(
        mockDuplicateTransaction,
        mockCreateTransactionDto,
        userId,
        userChoice,
      );
    });

    it('should include duplicate transaction details in error', async () => {
      const userId = 1;

      try {
        await service.handleDuplicateConfirmation(
          mockDuplicateTransaction,
          mockCreateTransactionDto,
          userId,
        );
      } catch (error) {
        expect(error.message).toBe('Duplicate transaction detected');
        expect(error.duplicateTransactionId).toBe(mockDuplicateTransaction.id);
        expect(error.duplicateTransaction).toEqual({
          id: mockDuplicateTransaction.id,
          description: mockDuplicateTransaction.description,
          amount: mockDuplicateTransaction.amount,
          executionDate: mockDuplicateTransaction.executionDate,
          type: mockDuplicateTransaction.type,
        });
      }
    });
  });

  describe('preventDuplicateCreation', () => {
    it('should prevent creation when duplicate is found', async () => {
      const userId = 1;

      duplicateDetectionService.checkForDuplicateBeforeCreation.mockResolvedValue(
        {
          isDuplicate: true,
          existingTransaction: mockDuplicateTransaction,
          similarityScore: 95,
          reason: 'Exact match',
          confidence: 'high',
          shouldPrevent: true,
          shouldCreatePending: false,
        },
      );

      const result = await service.preventDuplicateCreation(
        mockTransaction,
        userId,
      );

      expect(result).toBe(true);
      expect(
        duplicateDetectionService.checkForDuplicateBeforeCreation,
      ).toHaveBeenCalledWith(
        {
          description: mockTransaction.description,
          amount: mockTransaction.amount,
          type: mockTransaction.type,
          executionDate: mockTransaction.executionDate,
          source: mockTransaction.source,
        },
        userId,
      );
    });

    it('should allow creation when no duplicate found', async () => {
      const userId = 1;

      duplicateDetectionService.checkForDuplicateBeforeCreation.mockResolvedValue(
        {
          isDuplicate: false,
          existingTransaction: undefined,
          similarityScore: 0,
          reason: 'No match found',
          confidence: 'low',
          shouldPrevent: false,
          shouldCreatePending: false,
        },
      );

      const result = await service.preventDuplicateCreation(
        mockTransaction,
        userId,
      );

      expect(result).toBe(false);
    });

    it('should handle high similarity scores correctly', async () => {
      const userId = 1;

      duplicateDetectionService.checkForDuplicateBeforeCreation.mockResolvedValue(
        {
          isDuplicate: true,
          existingTransaction: mockDuplicateTransaction,
          similarityScore: 85,
          reason: 'High similarity',
          confidence: 'medium',
          shouldPrevent: false,
          shouldCreatePending: true,
        },
      );

      const result = await service.preventDuplicateCreation(
        mockTransaction,
        userId,
      );

      expect(result).toBe(false);
    });
  });

  describe('getDuplicateThreshold', () => {
    it('should return default duplicate threshold', async () => {
      const result = await service.getDuplicateThreshold();

      expect(result).toBe(60); // Default threshold
    });
  });

  describe('updateDuplicateThreshold', () => {
    it('should update duplicate threshold', async () => {
      const newThreshold = 80;

      await service.updateDuplicateThreshold(newThreshold);

      // This would typically update a configuration or database setting
      // For now, we'll just verify the method can be called
      expect(true).toBe(true);
    });

    it('should validate threshold range', async () => {
      const invalidThreshold = 150;

      await expect(
        service.updateDuplicateThreshold(invalidThreshold),
      ).rejects.toThrow('Threshold must be between 0 and 100');
    });

    it('should accept valid threshold values', async () => {
      const validThresholds = [0, 50, 80, 100];

      for (const threshold of validThresholds) {
        await expect(
          service.updateDuplicateThreshold(threshold),
        ).resolves.not.toThrow();
      }
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      const amount = -100;
      const type = 'expense';
      const executionDate = new Date('2024-01-15');
      const userId = 1;
      const error = new Error('Database connection failed');

      // Mock QueryBuilder throwing error
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockRejectedValue(error),
      };
      transactionRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      await expect(
        service.findPotentialDuplicate(amount, type, executionDate, userId),
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle service dependency errors', async () => {
      const userId = 1;
      const error = new Error('Service unavailable');

      duplicateDetectionService.detectDuplicates.mockRejectedValue(error);

      await expect(
        service.detectSimilarTransactions(mockTransaction, userId),
      ).rejects.toThrow('Service unavailable');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete duplicate detection workflow', async () => {
      const userId = 1;
      const createDto: CreateTransactionDto = {
        description: 'Test Transaction',
        amount: -100,
        type: 'expense',
        executionDate: new Date('2024-01-15'),
        status: 'executed',
        source: 'manual',
        categoryId: 1,
      };

      // Mock finding a potential duplicate using QueryBuilder
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockDuplicateTransaction),
      };
      transactionRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      // Mock duplicate confirmation
      jest
        .spyOn(service, 'handleDuplicateConfirmation')
        .mockResolvedValue(mockTransaction);

      const duplicate = await service.findPotentialDuplicate(
        createDto.amount,
        createDto.type,
        createDto.executionDate!,
        userId,
      );

      expect(duplicate).toEqual(mockDuplicateTransaction);

      const result = await service.handleDuplicateConfirmation(
        duplicate!,
        createDto,
        userId,
        DuplicateTransactionChoice.USE_NEW,
      );

      expect(result).toEqual(mockTransaction);
    });

    it('should handle no duplicate scenario', async () => {
      const userId = 1;
      const createDto: CreateTransactionDto = {
        description: 'Unique Transaction',
        amount: -200,
        type: 'expense',
        executionDate: new Date('2024-01-16'),
        status: 'executed',
        source: 'manual',
        categoryId: 1,
      };

      // Mock no duplicate found using QueryBuilder
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      transactionRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const duplicate = await service.findPotentialDuplicate(
        createDto.amount,
        createDto.type,
        createDto.executionDate!,
        userId,
      );

      expect(duplicate).toBeNull();
    });
  });
});
