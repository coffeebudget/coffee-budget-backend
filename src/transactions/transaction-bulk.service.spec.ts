import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TransactionBulkService } from './transaction-bulk.service';
import { Transaction } from './transaction.entity';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';
import { Tag } from '../tags/entities/tag.entity';
import { Category } from '../categories/entities/category.entity';
import { PendingDuplicatesService } from '../pending-duplicates/pending-duplicates.service';
import { TagsService } from '../tags/tags.service';
import { CategoriesService } from '../categories/categories.service';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';

describe('TransactionBulkService', () => {
  let service: TransactionBulkService;
  let transactionRepository: jest.Mocked<Repository<Transaction>>;
  let pendingDuplicateRepository: jest.Mocked<Repository<PendingDuplicate>>;
  let tagRepository: jest.Mocked<Repository<Tag>>;
  let categoryRepository: jest.Mocked<Repository<Category>>;
  let pendingDuplicatesService: jest.Mocked<PendingDuplicatesService>;
  let tagsService: jest.Mocked<TagsService>;
  let categoriesService: jest.Mocked<CategoriesService>;

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

  const mockCategory = {
    id: 1,
    name: 'Groceries',
    user: mockUser,
  } as Category;

  const mockTransaction = {
    id: 1,
    description: 'Test Transaction',
    amount: -100,
    type: 'expense' as const,
    executionDate: new Date('2024-01-15'),
    billingDate: new Date('2024-01-15'),
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    user: mockUser,
    category: mockCategory,
    suggestedCategory: null,
    suggestedCategoryName: null,
    bankAccount: null,
    creditCard: null,
    tags: [],
    status: 'executed' as const,
    source: 'manual' as const,
    categorizationConfidence: null,
    transactionIdOpenBankAPI: null,
    merchantName: null,
    merchantCategoryCode: null,
    debtorName: null,
    creditorName: null,
    enrichedFromPaymentActivityId: null,
    originalMerchantName: null,
    enhancedMerchantName: null,
    enhancedCategoryConfidence: null,
  } as Transaction;

  const mockTag = {
    id: 1,
    name: 'food',
    user: mockUser,
  } as Tag;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionBulkService,
        RepositoryMockFactory.createRepositoryProvider(Transaction),
        RepositoryMockFactory.createRepositoryProvider(PendingDuplicate),
        RepositoryMockFactory.createRepositoryProvider(Tag),
        RepositoryMockFactory.createRepositoryProvider(Category),
        {
          provide: PendingDuplicatesService,
          useValue: {
            findAllByExistingTransactionId: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: TagsService,
          useValue: {
            findByIds: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: CategoriesService,
          useValue: {
            findById: jest.fn(),
            suggestCategoryForDescription: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionBulkService>(TransactionBulkService);
    transactionRepository = module.get(getRepositoryToken(Transaction));
    pendingDuplicateRepository = module.get(
      getRepositoryToken(PendingDuplicate),
    );
    tagRepository = module.get(getRepositoryToken(Tag));
    categoryRepository = module.get(getRepositoryToken(Category));
    pendingDuplicatesService = module.get(PendingDuplicatesService);
    tagsService = module.get(TagsService);
    categoriesService = module.get(CategoriesService);
  });

  describe('bulkDeleteByIds', () => {
    it('should delete multiple transactions successfully', async () => {
      const transactionIds = [1, 2, 3];
      const mockTransactions = [
        { ...mockTransaction, id: 1 },
        { ...mockTransaction, id: 2 },
        { ...mockTransaction, id: 3 },
      ];

      transactionRepository.find.mockResolvedValue(mockTransactions);
      pendingDuplicatesService.findAllByExistingTransactionId.mockResolvedValue(
        [],
      );
      transactionRepository.delete.mockResolvedValue({ affected: 3 } as any);

      const result = await service.bulkDeleteByIds(transactionIds, mockUser.id);

      expect(result).toBe(3);
      expect(transactionRepository.find).toHaveBeenCalledWith({
        where: {
          id: In(transactionIds),
          user: { id: mockUser.id },
        },
      });
      expect(transactionRepository.delete).toHaveBeenCalledWith({
        id: In(transactionIds),
        user: { id: mockUser.id },
      });
    });

    it('should throw BadRequestException for empty transaction IDs', async () => {
      await expect(service.bulkDeleteByIds([], mockUser.id)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for null transaction IDs', async () => {
      await expect(
        service.bulkDeleteByIds(null as any, mockUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 0 when no transactions found', async () => {
      const transactionIds = [1, 2, 3];
      transactionRepository.find.mockResolvedValue([]);

      const result = await service.bulkDeleteByIds(transactionIds, mockUser.id);

      expect(result).toBe(0);
      expect(transactionRepository.delete).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when transaction has unresolved pending duplicates', async () => {
      const transactionIds = [1];
      const mockTransactions = [{ ...mockTransaction, id: 1 }];
      const mockPendingDuplicates = [
        { id: 1, resolved: false, existingTransaction: { id: 1 } },
      ];

      transactionRepository.find.mockResolvedValue(mockTransactions);
      pendingDuplicatesService.findAllByExistingTransactionId.mockResolvedValue(
        mockPendingDuplicates as any,
      );

      await expect(
        service.bulkDeleteByIds(transactionIds, mockUser.id),
      ).rejects.toThrow(ConflictException);
    });

    it('should clean up resolved pending duplicates before deletion', async () => {
      const transactionIds = [1];
      const mockTransactions = [{ ...mockTransaction, id: 1 }];
      const mockPendingDuplicates = [
        { id: 1, resolved: true, existingTransaction: { id: 1 } },
        { id: 2, resolved: true, existingTransaction: { id: 1 } },
      ];

      transactionRepository.find.mockResolvedValue(mockTransactions);
      pendingDuplicatesService.findAllByExistingTransactionId.mockResolvedValue(
        mockPendingDuplicates as any,
      );
      transactionRepository.delete.mockResolvedValue({ affected: 1 } as any);

      await service.bulkDeleteByIds(transactionIds, mockUser.id);

      expect(pendingDuplicatesService.update).toHaveBeenCalledWith(
        1,
        { existingTransaction: null },
        mockUser.id,
      );
      expect(pendingDuplicatesService.update).toHaveBeenCalledWith(
        2,
        { existingTransaction: null },
        mockUser.id,
      );
    });
  });

  describe('bulkCategorizeUncategorized', () => {
    it('should categorize uncategorized transactions successfully', async () => {
      const uncategorizedTransactions = [
        { ...mockTransaction, id: 1, category: null as any },
        { ...mockTransaction, id: 2, category: null as any },
      ] as Transaction[];

      transactionRepository.find.mockResolvedValue(uncategorizedTransactions);
      categoriesService.suggestCategoryForDescription.mockResolvedValue(
        mockCategory,
      );
      transactionRepository.save.mockResolvedValue(
        uncategorizedTransactions as any,
      );

      const result = await service.bulkCategorizeUncategorized(mockUser.id, 50);

      expect(result.totalProcessed).toBe(2);
      expect(result.keywordMatched).toBe(2);
      expect(result.errors).toBe(0);
      expect(
        categoriesService.suggestCategoryForDescription,
      ).toHaveBeenCalledTimes(2);
    });

    it('should handle batch processing correctly', async () => {
      const uncategorizedTransactions = Array.from({ length: 100 }, (_, i) => ({
        ...mockTransaction,
        id: i + 1,
        category: null as any,
      })) as Transaction[];

      transactionRepository.find.mockResolvedValue(uncategorizedTransactions);
      categoriesService.suggestCategoryForDescription.mockResolvedValue(
        mockCategory,
      );
      transactionRepository.save.mockResolvedValue(
        uncategorizedTransactions as any,
      );

      const result = await service.bulkCategorizeUncategorized(mockUser.id, 25);

      expect(result.totalProcessed).toBe(100);
      expect(transactionRepository.save).toHaveBeenCalledTimes(4); // 100 / 25 = 4 batches
    });

    it('should handle transactions without category suggestions', async () => {
      const uncategorizedTransactions = [
        { ...mockTransaction, id: 1, category: null as any },
      ] as Transaction[];

      transactionRepository.find.mockResolvedValue(uncategorizedTransactions);
      categoriesService.suggestCategoryForDescription.mockResolvedValue(null);

      const result = await service.bulkCategorizeUncategorized(mockUser.id, 50);

      expect(result.totalProcessed).toBe(1);
      expect(result.keywordMatched).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should handle categorization errors gracefully', async () => {
      const uncategorizedTransactions = [
        { ...mockTransaction, id: 1, category: null as any },
      ] as Transaction[];

      transactionRepository.find.mockResolvedValue(uncategorizedTransactions);
      categoriesService.suggestCategoryForDescription.mockRejectedValue(
        new Error('Categorization failed'),
      );

      const result = await service.bulkCategorizeUncategorized(mockUser.id, 50);

      expect(result.totalProcessed).toBe(1);
      expect(result.errors).toBe(1);
    });

    it('should use default batch size when not provided', async () => {
      const uncategorizedTransactions = [
        { ...mockTransaction, id: 1, category: null as any },
      ] as Transaction[];

      transactionRepository.find.mockResolvedValue(uncategorizedTransactions);
      categoriesService.suggestCategoryForDescription.mockResolvedValue(
        mockCategory,
      );
      transactionRepository.save.mockResolvedValue(
        uncategorizedTransactions as any,
      );

      await service.bulkCategorizeUncategorized(mockUser.id);

      expect(transactionRepository.find).toHaveBeenCalledWith({
        where: {
          user: { id: mockUser.id },
          category: IsNull(),
          suggestedCategory: IsNull(),
        },
        relations: ['user'],
        order: { executionDate: 'DESC' },
      });
    });
  });

  describe('bulkUpdateStatus', () => {
    it('should update status of multiple transactions successfully', async () => {
      const transactionIds = [1, 2, 3];
      const newStatus = 'pending';
      const mockTransactions = [
        { ...mockTransaction, id: 1 },
        { ...mockTransaction, id: 2 },
        { ...mockTransaction, id: 3 },
      ];

      transactionRepository.find.mockResolvedValue(mockTransactions);
      transactionRepository.save.mockResolvedValue(
        mockTransactions.map((t) => ({ ...t, status: newStatus })) as any,
      );

      const result = await service.bulkUpdateStatus(
        transactionIds,
        newStatus,
        mockUser.id,
      );

      expect(result).toBe(3);
      expect(transactionRepository.find).toHaveBeenCalledWith({
        where: {
          id: In(transactionIds),
          user: { id: mockUser.id },
        },
      });
      expect(transactionRepository.save).toHaveBeenCalledWith(
        mockTransactions.map((t) => ({ ...t, status: newStatus })),
      );
    });

    it('should throw BadRequestException for empty transaction IDs', async () => {
      await expect(
        service.bulkUpdateStatus([], 'pending', mockUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid status', async () => {
      await expect(
        service.bulkUpdateStatus([1], '', mockUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 0 when no transactions found', async () => {
      const transactionIds = [1, 2, 3];
      transactionRepository.find.mockResolvedValue([]);

      const result = await service.bulkUpdateStatus(
        transactionIds,
        'pending',
        mockUser.id,
      );

      expect(result).toBe(0);
      expect(transactionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdateTags', () => {
    it('should add tags to multiple transactions successfully', async () => {
      const transactionIds = [1, 2, 3];
      const tagIds = [1, 2];
      const mockTransactions = [
        { ...mockTransaction, id: 1, tags: [] },
        { ...mockTransaction, id: 2, tags: [] },
        { ...mockTransaction, id: 3, tags: [] },
      ];
      const mockTags = [mockTag, { ...mockTag, id: 2 }];

      transactionRepository.find.mockResolvedValue(mockTransactions);
      tagRepository.find.mockResolvedValue(mockTags);
      transactionRepository.save.mockResolvedValue(mockTransactions as any);

      const result = await service.bulkUpdateTags(
        transactionIds,
        tagIds,
        mockUser.id,
      );

      expect(result).toBe(3);
      expect(transactionRepository.find).toHaveBeenCalledWith({
        where: {
          id: In(transactionIds),
          user: { id: mockUser.id },
        },
        relations: ['tags'],
      });
      expect(tagRepository.find).toHaveBeenCalledWith({
        where: { id: In(tagIds) },
      });
    });

    it('should throw BadRequestException for empty transaction IDs', async () => {
      await expect(
        service.bulkUpdateTags([], [1], mockUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for empty tag IDs', async () => {
      await expect(
        service.bulkUpdateTags([1], [], mockUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 0 when no transactions found', async () => {
      const transactionIds = [1, 2, 3];
      transactionRepository.find.mockResolvedValue([]);

      const result = await service.bulkUpdateTags(
        transactionIds,
        [1],
        mockUser.id,
      );

      expect(result).toBe(0);
      expect(transactionRepository.save).not.toHaveBeenCalled();
    });

    it('should handle transactions with existing tags', async () => {
      const transactionIds = [1];
      const tagIds = [1, 2];
      const mockTransactions = [{ ...mockTransaction, id: 1, tags: [mockTag] }];
      const mockTags = [mockTag, { ...mockTag, id: 2 }];

      transactionRepository.find.mockResolvedValue(mockTransactions);
      tagRepository.find.mockResolvedValue(mockTags);
      transactionRepository.save.mockResolvedValue(mockTransactions as any);

      const result = await service.bulkUpdateTags(
        transactionIds,
        tagIds,
        mockUser.id,
      );

      expect(result).toBe(1);
      expect(transactionRepository.save).toHaveBeenCalledWith([
        { ...mockTransactions[0], tags: mockTags },
      ]);
    });
  });

  describe('validateBulkOperation', () => {
    it('should validate bulk operation successfully', async () => {
      const transactionIds = [1, 2, 3];
      const mockTransactions = [
        { ...mockTransaction, id: 1 },
        { ...mockTransaction, id: 2 },
        { ...mockTransaction, id: 3 },
      ];

      transactionRepository.find.mockResolvedValue(mockTransactions);
      pendingDuplicatesService.findAllByExistingTransactionId.mockResolvedValue(
        [],
      );

      const result = await service.validateBulkOperation(
        transactionIds,
        mockUser.id,
      );

      expect(result.isValid).toBe(true);
      expect(result.foundTransactions).toBe(3);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should detect conflicts with pending duplicates', async () => {
      const transactionIds = [1];
      const mockTransactions = [{ ...mockTransaction, id: 1 }];
      const mockPendingDuplicates = [
        { id: 1, resolved: false, existingTransaction: { id: 1 } },
      ];

      transactionRepository.find.mockResolvedValue(mockTransactions);
      pendingDuplicatesService.findAllByExistingTransactionId.mockResolvedValue(
        mockPendingDuplicates as any,
      );

      const result = await service.validateBulkOperation(
        transactionIds,
        mockUser.id,
      );

      expect(result.isValid).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe('pending_duplicate');
    });

    it('should handle missing transactions', async () => {
      const transactionIds = [1, 2, 3];
      const mockTransactions = [{ ...mockTransaction, id: 1 }];

      transactionRepository.find.mockResolvedValue(mockTransactions);
      pendingDuplicatesService.findAllByExistingTransactionId.mockResolvedValue(
        [],
      );

      const result = await service.validateBulkOperation(
        transactionIds,
        mockUser.id,
      );

      expect(result.isValid).toBe(false);
      expect(result.foundTransactions).toBe(1);
      expect(result.missingTransactions).toEqual([2, 3]);
    });
  });

  describe('getBulkOperationStats', () => {
    it('should return statistics for bulk operations', async () => {
      const transactionIds = [1, 2, 3];
      const mockTransactions = [
        {
          ...mockTransaction,
          id: 1,
          category: mockCategory,
          status: 'executed' as const,
        },
        {
          ...mockTransaction,
          id: 2,
          category: null,
          status: 'pending' as const,
        },
        {
          ...mockTransaction,
          id: 3,
          category: mockCategory,
          status: 'executed' as const,
        },
      ] as Transaction[];

      transactionRepository.find.mockResolvedValue(mockTransactions);

      const result = await service.getBulkOperationStats(
        transactionIds,
        mockUser.id,
      );

      expect(result.totalTransactions).toBe(3);
      expect(result.categorizedCount).toBe(2);
      expect(result.uncategorizedCount).toBe(1);
      expect(result.statusCounts.executed).toBe(2);
      expect(result.statusCounts.pending).toBe(1);
    });

    it('should handle empty transaction list', async () => {
      const transactionIds: number[] = [];
      transactionRepository.find.mockResolvedValue([]);

      const result = await service.getBulkOperationStats(
        transactionIds,
        mockUser.id,
      );

      expect(result.totalTransactions).toBe(0);
      expect(result.categorizedCount).toBe(0);
      expect(result.uncategorizedCount).toBe(0);
    });

    it('should calculate category distribution', async () => {
      const transactionIds = [1, 2, 3];
      const mockTransactions = [
        {
          ...mockTransaction,
          id: 1,
          category: { ...mockCategory, id: 1, name: 'Food' },
        },
        {
          ...mockTransaction,
          id: 2,
          category: { ...mockCategory, id: 1, name: 'Food' },
        },
        {
          ...mockTransaction,
          id: 3,
          category: { ...mockCategory, id: 2, name: 'Transport' },
        },
      ] as Transaction[];

      transactionRepository.find.mockResolvedValue(mockTransactions);

      const result = await service.getBulkOperationStats(
        transactionIds,
        mockUser.id,
      );

      expect(result.categoryDistribution.Food).toBe(2);
      expect(result.categoryDistribution.Transport).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      const transactionIds = [1, 2, 3];
      transactionRepository.find.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(
        service.bulkDeleteByIds(transactionIds, mockUser.id),
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle service dependency errors', async () => {
      const transactionIds = [1];
      const mockTransactions = [{ ...mockTransaction, id: 1 }];

      transactionRepository.find.mockResolvedValue(mockTransactions);
      pendingDuplicatesService.findAllByExistingTransactionId.mockRejectedValue(
        new Error('Service unavailable'),
      );

      await expect(
        service.bulkDeleteByIds(transactionIds, mockUser.id),
      ).rejects.toThrow('Service unavailable');
    });
  });
});
