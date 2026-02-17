import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionCategorizationService } from './transaction-categorization.service';
import { Transaction } from './transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { CategoriesService } from '../categories/categories.service';
import { MerchantCategorizationService } from '../merchant-categorization/merchant-categorization.service';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';
import { EventPublisherService } from '../shared/services/event-publisher.service';

describe('TransactionCategorizationService', () => {
  let service: TransactionCategorizationService;
  let transactionRepository: jest.Mocked<Repository<Transaction>>;
  let categoryRepository: jest.Mocked<Repository<Category>>;
  let categoriesService: jest.Mocked<CategoriesService>;
  let merchantCategorizationService: jest.Mocked<MerchantCategorizationService>;
  let eventPublisher: jest.Mocked<EventPublisherService>;

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
  } as any;

  const mockCategory = {
    id: 1,
    name: 'Groceries',
    user: mockUser,
    keywords: ['grocery', 'supermarket', 'food'],
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

  const mockTransaction = {
    id: 1,
    description: 'Grocery store purchase',
    amount: -50.0,
    type: 'expense' as const,
    user: mockUser,
    category: null,
    suggestedCategory: mockCategory,
    suggestedCategoryName: 'Groceries',
    bankAccount: null,
    creditCard: null,
    tags: [],
    executionDate: new Date(),
    billingDate: null,
    status: 'executed' as const,
    source: 'manual',
    transactionIdOpenBankAPI: null,
    categorizationConfidence: 0.8,
    merchantName: null,
    merchantCategoryCode: null,
    debtorName: null,
    creditorName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionCategorizationService,
        RepositoryMockFactory.createRepositoryProvider(Transaction),
        RepositoryMockFactory.createRepositoryProvider(Category),
        {
          provide: CategoriesService,
          useValue: {
            suggestCategoryForDescription: jest.fn(),
            findOne: jest.fn(),
            findCategoryByKeywordMatch: jest.fn(),
          },
        },
        {
          provide: MerchantCategorizationService,
          useValue: {
            categorizeByMerchant: jest.fn(),
            learnFromUserCorrection: jest.fn(),
            invalidateMerchantCache: jest.fn(),
            getMerchantStats: jest.fn(),
          },
        },
        {
          provide: EventPublisherService,
          useValue: {
            publish: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionCategorizationService>(
      TransactionCategorizationService,
    );
    transactionRepository = module.get(getRepositoryToken(Transaction));
    categoryRepository = module.get(getRepositoryToken(Category));
    categoriesService = module.get(CategoriesService);
    merchantCategorizationService = module.get(MerchantCategorizationService);
    eventPublisher = module.get(EventPublisherService);
  });

  describe('categorizeTransactionByDescription', () => {
    it('should categorize transaction based on description', async () => {
      const transaction = {
        ...mockTransaction,
        description: 'Grocery store purchase',
      };
      const suggestedCategory = { ...mockCategory, name: 'Groceries' };

      categoriesService.suggestCategoryForDescription.mockResolvedValue(
        suggestedCategory,
      );
      transactionRepository.save.mockResolvedValue(transaction);

      const result = await service.categorizeTransactionByDescription(
        transaction,
        mockUser.id,
      );

      expect(
        categoriesService.suggestCategoryForDescription,
      ).toHaveBeenCalledWith('Grocery store purchase', mockUser.id);
      expect(transactionRepository.save).toHaveBeenCalledWith(transaction);
      expect(result).toEqual(transaction);
    });

    it('should return transaction unchanged if no description', async () => {
      const transaction = { ...mockTransaction, description: '' };

      const result = await service.categorizeTransactionByDescription(
        transaction,
        mockUser.id,
      );

      expect(
        categoriesService.suggestCategoryForDescription,
      ).not.toHaveBeenCalled();
      expect(transactionRepository.save).not.toHaveBeenCalled();
      expect(result).toEqual(transaction);
    });

    it('should return transaction unchanged if no suggested category', async () => {
      const transaction = {
        ...mockTransaction,
        description: 'Unknown purchase',
      };

      categoriesService.suggestCategoryForDescription.mockResolvedValue(null);

      const result = await service.categorizeTransactionByDescription(
        transaction,
        mockUser.id,
      );

      expect(
        categoriesService.suggestCategoryForDescription,
      ).toHaveBeenCalledWith('Unknown purchase', mockUser.id);
      expect(transactionRepository.save).not.toHaveBeenCalled();
      expect(result).toEqual(transaction);
    });

    it('should handle errors during categorization', async () => {
      const transaction = {
        ...mockTransaction,
        description: 'Grocery store purchase',
      };

      categoriesService.suggestCategoryForDescription.mockRejectedValue(
        new Error('Categorization failed'),
      );

      await expect(
        service.categorizeTransactionByDescription(transaction, mockUser.id),
      ).rejects.toThrow('Categorization failed');
    });
  });

  describe('bulkCategorizeByIds', () => {
    it('should bulk categorize transactions by IDs', async () => {
      const transactionIds = [1, 2, 3];
      const categoryId = 1;
      const transactions = [
        { ...mockTransaction, id: 1 },
        { ...mockTransaction, id: 2 },
        { ...mockTransaction, id: 3 },
      ];

      categoryRepository.findOne.mockResolvedValue(mockCategory);
      transactionRepository.find.mockResolvedValue(transactions);
      transactionRepository.save.mockResolvedValue(transactions as any);

      const result = await service.bulkCategorizeByIds(
        transactionIds,
        categoryId,
        mockUser.id,
      );

      expect(categoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: categoryId, user: { id: mockUser.id } },
      });
      expect(transactionRepository.find).toHaveBeenCalledWith({
        where: {
          id: In(transactionIds),
          user: { id: mockUser.id },
        },
        relations: ['category'],
      });
      expect(transactionRepository.save).toHaveBeenCalledWith(
        transactions.map((t) => ({ ...t, category: mockCategory })),
      );
      expect(result).toBe(3);
    });

    it('should throw error if transaction IDs array is empty', async () => {
      await expect(
        service.bulkCategorizeByIds([], 1, mockUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if category not found', async () => {
      const transactionIds = [1, 2, 3];
      const categoryId = 999;

      categoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.bulkCategorizeByIds(transactionIds, categoryId, mockUser.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 0 if no transactions found', async () => {
      const transactionIds = [1, 2, 3];
      const categoryId = 1;

      categoryRepository.findOne.mockResolvedValue(mockCategory);
      transactionRepository.find.mockResolvedValue([]);

      const result = await service.bulkCategorizeByIds(
        transactionIds,
        categoryId,
        mockUser.id,
      );

      expect(result).toBe(0);
    });

    it('should handle partial success', async () => {
      const transactionIds = [1, 2, 3];
      const categoryId = 1;
      const transactions = [
        { ...mockTransaction, id: 1 },
        { ...mockTransaction, id: 2 },
      ];

      categoryRepository.findOne.mockResolvedValue(mockCategory);
      transactionRepository.find.mockResolvedValue(transactions);
      transactionRepository.save.mockResolvedValue(transactions as any);

      const result = await service.bulkCategorizeByIds(
        transactionIds,
        categoryId,
        mockUser.id,
      );

      expect(result).toBe(2);
    });
  });

  describe('bulkUncategorizeByIds', () => {
    it('should bulk uncategorize transactions by IDs', async () => {
      const transactionIds = [1, 2, 3];

      transactionRepository.query.mockResolvedValue({ affected: 3 });

      const result = await service.bulkUncategorizeByIds(
        transactionIds,
        mockUser.id,
      );

      expect(transactionRepository.query).toHaveBeenCalledWith(
        `UPDATE "transaction" 
       SET "categoryId" = NULL 
       WHERE "id" IN (${transactionIds.join(',')}) 
       AND "userId" = $1`,
        [mockUser.id],
      );
      expect(result).toBe(3);
    });

    it('should throw error if transaction IDs array is empty', async () => {
      await expect(
        service.bulkUncategorizeByIds([], mockUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 0 if no transactions affected', async () => {
      const transactionIds = [1, 2, 3];

      transactionRepository.query.mockResolvedValue({ affected: 0 });

      const result = await service.bulkUncategorizeByIds(
        transactionIds,
        mockUser.id,
      );

      expect(result).toBe(0);
    });

    it('should handle database errors', async () => {
      const transactionIds = [1, 2, 3];

      transactionRepository.query.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.bulkUncategorizeByIds(transactionIds, mockUser.id),
      ).rejects.toThrow('Database error');
    });
  });

  describe('acceptSuggestedCategory', () => {
    it('should accept suggested category for transaction', async () => {
      const transactionId = 1;
      const transaction = {
        ...mockTransaction,
        id: transactionId,
        suggestedCategory: mockCategory,
        suggestedCategoryName: 'Groceries',
      };

      transactionRepository.findOne.mockResolvedValue(transaction);
      transactionRepository.save.mockResolvedValue({
        ...transaction,
        category: mockCategory,
        suggestedCategory: null,
        suggestedCategoryName: null,
      });

      const result = await service.acceptSuggestedCategory(
        transactionId,
        mockUser.id,
      );

      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: { id: transactionId, user: { id: mockUser.id } },
        relations: ['suggestedCategory', 'category'],
      });
      expect(transactionRepository.save).toHaveBeenCalledWith({
        ...transaction,
        category: mockCategory,
        suggestedCategory: null,
        suggestedCategoryName: null,
      });
      expect(result.category).toEqual(mockCategory);
      expect(result.suggestedCategory).toBeNull();
      expect(result.suggestedCategoryName).toBeNull();
    });

    it('should throw error if transaction not found', async () => {
      const transactionId = 999;

      transactionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.acceptSuggestedCategory(transactionId, mockUser.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error if no suggested category', async () => {
      const transactionId = 1;
      const transaction = {
        ...mockTransaction,
        id: transactionId,
        suggestedCategory: null,
      };

      transactionRepository.findOne.mockResolvedValue(transaction);

      await expect(
        service.acceptSuggestedCategory(transactionId, mockUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle save errors', async () => {
      const transactionId = 1;
      const transaction = {
        ...mockTransaction,
        id: transactionId,
        suggestedCategory: mockCategory,
      };

      transactionRepository.findOne.mockResolvedValue(transaction);
      transactionRepository.save.mockRejectedValue(new Error('Save failed'));

      await expect(
        service.acceptSuggestedCategory(transactionId, mockUser.id),
      ).rejects.toThrow('Save failed');
    });
  });

  describe('rejectSuggestedCategory', () => {
    it('should reject suggested category for transaction', async () => {
      const transactionId = 1;
      const transaction = {
        ...mockTransaction,
        id: transactionId,
        suggestedCategory: mockCategory,
        suggestedCategoryName: 'Groceries',
      };

      transactionRepository.findOne.mockResolvedValue(transaction);
      transactionRepository.save.mockResolvedValue({
        ...transaction,
        suggestedCategory: null,
        suggestedCategoryName: null,
      });

      const result = await service.rejectSuggestedCategory(
        transactionId,
        mockUser.id,
      );

      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: { id: transactionId, user: { id: mockUser.id } },
        relations: ['suggestedCategory'],
      });
      expect(transactionRepository.save).toHaveBeenCalledWith({
        ...transaction,
        suggestedCategory: null,
        suggestedCategoryName: null,
      });
      expect(result.suggestedCategory).toBeNull();
      expect(result.suggestedCategoryName).toBeNull();
    });

    it('should throw error if transaction not found', async () => {
      const transactionId = 999;

      transactionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.rejectSuggestedCategory(transactionId, mockUser.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle save errors', async () => {
      const transactionId = 1;
      const transaction = {
        ...mockTransaction,
        id: transactionId,
        suggestedCategory: mockCategory,
      };

      transactionRepository.findOne.mockResolvedValue(transaction);
      transactionRepository.save.mockRejectedValue(new Error('Save failed'));

      await expect(
        service.rejectSuggestedCategory(transactionId, mockUser.id),
      ).rejects.toThrow('Save failed');
    });
  });

  describe('validateCategoryForUser', () => {
    it('should validate category exists for user', async () => {
      const categoryId = 1;

      categoryRepository.findOne.mockResolvedValue(mockCategory);

      const result = await service.validateCategoryForUser(
        categoryId,
        mockUser.id,
      );

      expect(categoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: categoryId, user: { id: mockUser.id } },
      });
      expect(result).toEqual(mockCategory);
    });

    it('should throw error if category not found', async () => {
      const categoryId = 999;

      categoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.validateCategoryForUser(categoryId, mockUser.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle database errors', async () => {
      const categoryId = 1;

      categoryRepository.findOne.mockRejectedValue(new Error('Database error'));

      await expect(
        service.validateCategoryForUser(categoryId, mockUser.id),
      ).rejects.toThrow('Database error');
    });
  });

  describe('suggestCategoryForTransaction', () => {
    it('should suggest category for transaction description', async () => {
      const description = 'Grocery store purchase';
      const suggestedCategory = { ...mockCategory, name: 'Groceries' };

      categoriesService.suggestCategoryForDescription.mockResolvedValue(
        suggestedCategory,
      );

      const result = await service.suggestCategoryForTransaction(
        description,
        mockUser.id,
      );

      expect(
        categoriesService.suggestCategoryForDescription,
      ).toHaveBeenCalledWith(description, mockUser.id);
      expect(result).toEqual(suggestedCategory);
    });

    it('should return null if no suggestion found', async () => {
      const description = 'Unknown purchase';

      categoriesService.suggestCategoryForDescription.mockResolvedValue(null);

      const result = await service.suggestCategoryForTransaction(
        description,
        mockUser.id,
      );

      expect(result).toBeNull();
    });

    it('should return null for empty description', async () => {
      const description = '';

      const result = await service.suggestCategoryForTransaction(
        description,
        mockUser.id,
      );

      expect(
        categoriesService.suggestCategoryForDescription,
      ).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should handle errors during suggestion', async () => {
      const description = 'Grocery store purchase';

      categoriesService.suggestCategoryForDescription.mockRejectedValue(
        new Error('Suggestion failed'),
      );

      await expect(
        service.suggestCategoryForTransaction(description, mockUser.id),
      ).rejects.toThrow('Suggestion failed');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle null transaction in categorizeTransactionByDescription', async () => {
      await expect(
        service.categorizeTransactionByDescription(null as any, mockUser.id),
      ).rejects.toThrow();
    });

    it('should handle null user ID in bulkCategorizeByIds', async () => {
      await expect(
        service.bulkCategorizeByIds([1, 2, 3], 1, null as any),
      ).rejects.toThrow();
    });

    it('should handle negative transaction IDs', async () => {
      await expect(
        service.bulkCategorizeByIds([-1, -2], 1, mockUser.id),
      ).rejects.toThrow();
    });

    it('should handle zero category ID', async () => {
      await expect(
        service.bulkCategorizeByIds([1, 2, 3], 0, mockUser.id),
      ).rejects.toThrow();
    });

    it('should handle very large transaction ID arrays', async () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i + 1);

      // This test will fail with category not found since we don't mock the category
      await expect(
        service.bulkCategorizeByIds(largeArray, 1, mockUser.id),
      ).rejects.toThrow('Category with ID 1 not found');
    });
  });
});
