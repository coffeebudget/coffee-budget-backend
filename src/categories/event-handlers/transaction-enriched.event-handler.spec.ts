import { Test, TestingModule } from '@nestjs/testing';
import { TransactionEnrichedEventHandler } from './transaction-enriched.event-handler';
import { CategoriesService } from '../categories.service';
import { Transaction } from '../../transactions/transaction.entity';
import { Category } from '../entities/category.entity';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransactionEnrichedEvent } from '../../shared/events/transaction.events';
import { RepositoryMockFactory } from '../../test/test-utils/repository-mocks';

describe('TransactionEnrichedEventHandler', () => {
  let handler: TransactionEnrichedEventHandler;
  let categoriesService: CategoriesService;
  let transactionRepository: Repository<Transaction>;
  let module: TestingModule;

  const mockCategory = {
    id: 1,
    name: 'Coffee Shops',
    keywords: ['starbucks', 'coffee'],
  } as Category;

  const mockTransaction = {
    id: 1,
    description: 'PayPal Transfer',
    amount: 50.0,
    originalMerchantName: 'PayPal',
    enhancedMerchantName: 'Starbucks Seattle',
    enrichedFromPaymentActivityId: 123,
    category: null,
    categorizationConfidence: null,
    enhancedCategoryConfidence: 90.0,
    suggestedCategory: null,
    suggestedCategoryName: null,
  } as unknown as Transaction;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        TransactionEnrichedEventHandler,
        RepositoryMockFactory.createRepositoryProvider(Transaction),
        {
          provide: CategoriesService,
          useValue: {
            suggestCategoryForDescription: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<TransactionEnrichedEventHandler>(
      TransactionEnrichedEventHandler,
    );
    categoriesService = module.get<CategoriesService>(CategoriesService);
    transactionRepository = module.get(getRepositoryToken(Transaction));
  });

  afterEach(async () => {
    await module.close();
  });

  describe('handleTransactionEnriched', () => {
    it('should re-categorize transaction with enhanced merchant name', async () => {
      // Arrange
      const event = new TransactionEnrichedEvent(
        mockTransaction,
        123,
        'Starbucks Seattle',
        'PayPal',
        1,
      );

      (categoriesService.suggestCategoryForDescription as jest.Mock).mockResolvedValue(mockCategory);
      (transactionRepository.findOne as jest.Mock).mockResolvedValue(mockTransaction);
      (transactionRepository.save as jest.Mock).mockResolvedValue({
        ...mockTransaction,
        category: mockCategory,
      });

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert
      expect(categoriesService.suggestCategoryForDescription).toHaveBeenCalledWith(
        'Starbucks Seattle',
        1,
      );
      expect(transactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          category: mockCategory,
          categorizationConfidence: 90.0,
        }),
      );
    });

    it('should skip re-categorization when enhanced merchant name is empty', async () => {
      // Arrange
      const event = new TransactionEnrichedEvent(mockTransaction, 123, '', 'PayPal', 1);

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert
      expect(categoriesService.suggestCategoryForDescription).not.toHaveBeenCalled();
      expect(transactionRepository.save).not.toHaveBeenCalled();
    });

    it('should skip re-categorization when enhanced merchant name is null', async () => {
      // Arrange
      const event = new TransactionEnrichedEvent(mockTransaction, 123, null, 'PayPal', 1);

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert
      expect(categoriesService.suggestCategoryForDescription).not.toHaveBeenCalled();
      expect(transactionRepository.save).not.toHaveBeenCalled();
    });

    it('should skip re-categorization when transaction has manual category (confidence ≥95)', async () => {
      // Arrange
      const manualTransaction = {
        ...mockTransaction,
        category: mockCategory,
        categorizationConfidence: 100, // Manual assignment
      } as unknown as Transaction;

      const event = new TransactionEnrichedEvent(
        manualTransaction,
        123,
        'Starbucks Seattle',
        'PayPal',
        1,
      );

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert
      expect(categoriesService.suggestCategoryForDescription).not.toHaveBeenCalled();
      expect(transactionRepository.save).not.toHaveBeenCalled();
    });

    it('should allow re-categorization when transaction has category but NULL confidence (auto-categorized without tracking)', async () => {
      // Arrange - NULL confidence means auto-categorized without confidence tracking
      // This should allow re-categorization when enriched merchant name is available
      const autoCategorizedTransaction = {
        ...mockTransaction,
        category: mockCategory,
        categorizationConfidence: null, // Auto-categorized without confidence tracking
      } as unknown as Transaction;

      const event = new TransactionEnrichedEvent(
        autoCategorizedTransaction,
        123,
        'Starbucks Seattle',
        'PayPal',
        1,
      );

      const newCategory = { id: 2, name: 'Coffee Shops' };
      (categoriesService.suggestCategoryForDescription as jest.Mock).mockResolvedValue(newCategory);
      (transactionRepository.findOne as jest.Mock).mockResolvedValue(autoCategorizedTransaction);

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert - should attempt re-categorization since NULL confidence doesn't indicate manual
      expect(categoriesService.suggestCategoryForDescription).toHaveBeenCalledWith('Starbucks Seattle', 1);
      expect(transactionRepository.save).toHaveBeenCalled();
    });

    it('should skip re-categorization when merchant names are similar - exact match', async () => {
      // Arrange
      const event = new TransactionEnrichedEvent(
        mockTransaction,
        123,
        'PayPal',
        'PayPal',
        1,
      );

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert
      expect(categoriesService.suggestCategoryForDescription).not.toHaveBeenCalled();
      expect(transactionRepository.save).not.toHaveBeenCalled();
    });

    it('should skip re-categorization when merchant names are similar - >80% overlap', async () => {
      // Arrange - "Starbucks" vs "Starbucks Inc" has >80% overlap (9/13 = 69%)
      // Use a case where shorter is >80% of longer
      const event = new TransactionEnrichedEvent(
        mockTransaction,
        123,
        'Starbucks',
        'Starbucks!',  // 9/10 = 90% overlap
        1,
      );

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert
      expect(categoriesService.suggestCategoryForDescription).not.toHaveBeenCalled();
      expect(transactionRepository.save).not.toHaveBeenCalled();
    });

    it('should allow re-categorization for provider company names like "PayPal Inc"', async () => {
      // Arrange - "PayPal Inc" is a company name, not just a generic provider
      const event = new TransactionEnrichedEvent(
        mockTransaction,
        123,
        'PayPal Inc',
        'PayPal Transfer',
        1,
      );

      (categoriesService.suggestCategoryForDescription as jest.Mock).mockResolvedValue(null);
      (transactionRepository.findOne as jest.Mock).mockResolvedValue(mockTransaction);

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert - should attempt re-categorization because "Inc" indicates a real company
      expect(categoriesService.suggestCategoryForDescription).toHaveBeenCalledWith('PayPal Inc', 1);
    });

    it('should skip re-categorization when both names reference same generic provider', async () => {
      // Arrange
      const event = new TransactionEnrichedEvent(
        mockTransaction,
        123,
        'PayPal Payment',
        'PayPal Transfer',
        1,
      );

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert
      expect(categoriesService.suggestCategoryForDescription).not.toHaveBeenCalled();
      expect(transactionRepository.save).not.toHaveBeenCalled();
    });

    it('should NOT skip when merchant names are different', async () => {
      // Arrange
      const event = new TransactionEnrichedEvent(
        mockTransaction,
        123,
        'Starbucks',
        'PayPal',
        1,
      );

      (categoriesService.suggestCategoryForDescription as jest.Mock).mockResolvedValue(null);
      (transactionRepository.findOne as jest.Mock).mockResolvedValue(mockTransaction);

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert
      expect(categoriesService.suggestCategoryForDescription).toHaveBeenCalledWith('Starbucks', 1);
    });

    it('should skip update when suggested category is same as current', async () => {
      // Arrange
      const transactionWithCategory = {
        ...mockTransaction,
        category: mockCategory,
        categorizationConfidence: 75, // Auto-assigned, can be changed
      } as unknown as Transaction;

      const event = new TransactionEnrichedEvent(
        transactionWithCategory,
        123,
        'Starbucks Seattle',
        'PayPal',
        1,
      );

      (categoriesService.suggestCategoryForDescription as jest.Mock).mockResolvedValue(mockCategory);
      (transactionRepository.findOne as jest.Mock).mockResolvedValue(transactionWithCategory);

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert
      expect(categoriesService.suggestCategoryForDescription).toHaveBeenCalled();
      expect(transactionRepository.save).not.toHaveBeenCalled(); // Same category, skip save
    });

    it('should handle no category suggestion gracefully', async () => {
      // Arrange
      const event = new TransactionEnrichedEvent(
        mockTransaction,
        123,
        'Unknown Merchant XYZ',
        'PayPal',
        1,
      );

      (categoriesService.suggestCategoryForDescription as jest.Mock).mockResolvedValue(null);

      // Act & Assert - should not throw
      await expect(handler.handleTransactionEnriched(event)).resolves.not.toThrow();
      expect(transactionRepository.save).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully without throwing', async () => {
      // Arrange
      const event = new TransactionEnrichedEvent(
        mockTransaction,
        123,
        'Starbucks Seattle',
        'PayPal',
        1,
      );

      (categoriesService.suggestCategoryForDescription as jest.Mock).mockRejectedValue(
        new Error('Database error'),
      );

      // Act & Assert - should not throw, just log
      await expect(handler.handleTransactionEnriched(event)).resolves.not.toThrow();
      expect(transactionRepository.save).not.toHaveBeenCalled();
    });

    it('should use enhancedCategoryConfidence when available', async () => {
      // Arrange
      const transactionWithConfidence = {
        id: 1,
        category: null,
        enhancedCategoryConfidence: 92.5,
        categorizationConfidence: null,
        suggestedCategory: null,
        suggestedCategoryName: null,
      } as unknown as Transaction;

      const event = new TransactionEnrichedEvent(
        transactionWithConfidence,
        123,
        'Starbucks Seattle',
        'PayPal',
        1,
      );

      (categoriesService.suggestCategoryForDescription as jest.Mock).mockResolvedValue(mockCategory);
      (transactionRepository.findOne as jest.Mock).mockResolvedValue(transactionWithConfidence);
      (transactionRepository.save as jest.Mock).mockImplementation((t) => Promise.resolve(t));

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert
      expect(transactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          categorizationConfidence: 92.5,
        }),
      );
    });

    it('should default to 85.0 confidence when enhanced confidence not available', async () => {
      // Arrange
      const transactionWithoutConfidence = {
        id: 1,
        category: null,
        enhancedCategoryConfidence: null,
        categorizationConfidence: null,
        suggestedCategory: null,
        suggestedCategoryName: null,
      } as unknown as Transaction;

      const event = new TransactionEnrichedEvent(
        transactionWithoutConfidence,
        123,
        'Starbucks Seattle',
        'PayPal',
        1,
      );

      (categoriesService.suggestCategoryForDescription as jest.Mock).mockResolvedValue(mockCategory);
      (transactionRepository.findOne as jest.Mock).mockResolvedValue(transactionWithoutConfidence);
      (transactionRepository.save as jest.Mock).mockImplementation((t) => Promise.resolve(t));

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert
      expect(transactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          categorizationConfidence: 85.0,
        }),
      );
    });

    it('should reload transaction before saving to prevent race conditions', async () => {
      // Arrange
      const testTransaction = {
        id: 1,
        category: null,
        categorizationConfidence: null,
        enhancedCategoryConfidence: 90.0,
        suggestedCategory: null,
        suggestedCategoryName: null,
      } as unknown as Transaction;

      const event = new TransactionEnrichedEvent(
        testTransaction,
        123,
        'Starbucks Seattle',
        'PayPal',
        1,
      );

      (categoriesService.suggestCategoryForDescription as jest.Mock).mockResolvedValue(mockCategory);
      (transactionRepository.findOne as jest.Mock).mockResolvedValue(testTransaction);
      (transactionRepository.save as jest.Mock).mockResolvedValue({
        ...testTransaction,
        category: mockCategory,
      });

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert
      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['category'],
      });
    });

    it('should handle transaction not found (deleted before re-categorization)', async () => {
      // Arrange
      const event = new TransactionEnrichedEvent(
        mockTransaction,
        123,
        'Starbucks Seattle',
        'PayPal',
        1,
      );

      (categoriesService.suggestCategoryForDescription as jest.Mock).mockResolvedValue(mockCategory);
      (transactionRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert - should not throw
      await expect(handler.handleTransactionEnriched(event)).resolves.not.toThrow();
      expect(transactionRepository.save).not.toHaveBeenCalled();
    });

    it('should clear suggested category fields when applying category', async () => {
      // Arrange
      const transactionWithSuggestion = {
        id: 1,
        category: null,
        suggestedCategory: { id: 2, name: 'Old Suggestion' } as Category,
        suggestedCategoryName: 'Old Suggestion',
        categorizationConfidence: null,
        enhancedCategoryConfidence: null,
      } as unknown as Transaction;

      const event = new TransactionEnrichedEvent(
        transactionWithSuggestion,
        123,
        'Starbucks Seattle',
        'PayPal',
        1,
      );

      (categoriesService.suggestCategoryForDescription as jest.Mock).mockResolvedValue(mockCategory);
      (transactionRepository.findOne as jest.Mock).mockResolvedValue(transactionWithSuggestion);
      (transactionRepository.save as jest.Mock).mockImplementation((t) => Promise.resolve(t));

      // Act
      await handler.handleTransactionEnriched(event);

      // Assert
      expect(transactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          category: mockCategory,
          suggestedCategory: null,
          suggestedCategoryName: null,
        }),
      );
    });
  });
});
