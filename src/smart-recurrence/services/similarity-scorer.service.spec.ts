import { Test, TestingModule } from '@nestjs/testing';
import { SimilarityScorerService } from './similarity-scorer.service';
import { Transaction } from '../../transactions/transaction.entity';
import { Category } from '../../categories/entities/category.entity';
import { DEFAULT_SIMILARITY_WEIGHTS } from '../interfaces/similarity.interface';

describe('SimilarityScorerService', () => {
  let service: SimilarityScorerService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [SimilarityScorerService],
    }).compile();

    service = module.get<SimilarityScorerService>(SimilarityScorerService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('calculateSimilarity', () => {
    it('should return 100% total for identical transactions', () => {
      // Arrange
      const category = { id: 1, name: 'Groceries' } as Category;
      const t1 = {
        id: 1,
        description: 'Carrefour Shopping',
        merchantName: 'Carrefour',
        amount: -50.0,
        category,
      } as Transaction;
      const t2 = {
        id: 2,
        description: 'Carrefour Shopping',
        merchantName: 'Carrefour',
        amount: -50.0,
        category,
      } as Transaction;

      // Act
      const result = service.calculateSimilarity(t1, t2);

      // Assert
      expect(result.categoryMatch).toBe(100);
      expect(result.merchantMatch).toBe(100);
      expect(result.descriptionMatch).toBe(100);
      expect(result.amountSimilarity).toBe(100);
      expect(result.total).toBe(100);
    });

    it('should apply correct weights to similarity scores', () => {
      // Arrange
      const category = { id: 1, name: 'Groceries' } as Category;
      const t1 = {
        description: 'Test',
        merchantName: 'Test Merchant',
        amount: -100.0,
        category,
      } as Transaction;
      const t2 = {
        description: 'Different',
        merchantName: 'Different Merchant',
        amount: -50.0,
        category,
      } as Transaction;

      // Act
      const result = service.calculateSimilarity(t1, t2);

      // Assert
      // Category matches (100 * 0.35 = 35)
      // Other fields don't match perfectly
      expect(result.categoryMatch).toBe(100);
      expect(result.total).toBeGreaterThanOrEqual(35);
      expect(result.total).toBeLessThan(100);
    });

    it('should handle transactions with null merchants gracefully', () => {
      // Arrange
      const category = { id: 1, name: 'Groceries' } as Category;
      const t1 = {
        description: 'Cash withdrawal',
        merchantName: null,
        amount: -50.0,
        category,
      } as Transaction;
      const t2 = {
        description: 'Cash withdrawal',
        merchantName: null,
        amount: -50.0,
        category,
      } as Transaction;

      // Act
      const result = service.calculateSimilarity(t1, t2);

      // Assert
      expect(result.merchantMatch).toBe(0); // No merchant data
      expect(result.categoryMatch).toBe(100);
      expect(result.descriptionMatch).toBe(100);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should handle transactions with different categories', () => {
      // Arrange
      const category1 = { id: 1, name: 'Groceries' } as Category;
      const category2 = { id: 2, name: 'Restaurants' } as Category;
      const t1 = {
        description: 'Shopping',
        merchantName: 'Store',
        amount: -50.0,
        category: category1,
      } as Transaction;
      const t2 = {
        description: 'Shopping',
        merchantName: 'Store',
        amount: -50.0,
        category: category2,
      } as Transaction;

      // Act
      const result = service.calculateSimilarity(t1, t2);

      // Assert
      expect(result.categoryMatch).toBe(0);
      expect(result.merchantMatch).toBe(100);
      expect(result.descriptionMatch).toBe(100);
      expect(result.total).toBeLessThan(100);
    });

    it('should calculate merchant similarity with Levenshtein distance', () => {
      // Arrange
      const category = { id: 1, name: 'Groceries' } as Category;
      const t1 = {
        description: 'Purchase',
        merchantName: 'Carrefour Express',
        amount: -50.0,
        category,
      } as Transaction;
      const t2 = {
        description: 'Purchase',
        merchantName: 'Carrefour Market',
        amount: -50.0,
        category,
      } as Transaction;

      // Act
      const result = service.calculateSimilarity(t1, t2);

      // Assert
      expect(result.merchantMatch).toBeGreaterThan(50); // Similar but not identical
      expect(result.merchantMatch).toBeLessThan(100);
    });

    it('should handle amount variations with 10% weight tolerance', () => {
      // Arrange
      const category = { id: 1, name: 'Salary' } as Category;
      const t1 = {
        description: 'Monthly Salary',
        merchantName: 'Employer',
        amount: 3000.0,
        category,
      } as Transaction;
      const t2 = {
        description: 'Monthly Salary',
        merchantName: 'Employer',
        amount: 3500.0, // +16.67% variation (bonus)
        category,
      } as Transaction;

      // Act
      const result = service.calculateSimilarity(t1, t2);

      // Assert
      expect(result.categoryMatch).toBe(100);
      expect(result.merchantMatch).toBe(100);
      expect(result.descriptionMatch).toBe(100);
      expect(result.amountSimilarity).toBeGreaterThan(80); // Close amounts
      // Total should still be high despite amount difference
      expect(result.total).toBeGreaterThan(90);
    });

    it('should normalize merchant names before comparison', () => {
      // Arrange
      const category = { id: 1, name: 'Groceries' } as Category;
      const t1 = {
        description: 'Purchase',
        merchantName: 'CARREFOUR!!!',
        amount: -50.0,
        category,
      } as Transaction;
      const t2 = {
        description: 'Purchase',
        merchantName: 'carrefour',
        amount: -50.0,
        category,
      } as Transaction;

      // Act
      const result = service.calculateSimilarity(t1, t2);

      // Assert
      expect(result.merchantMatch).toBe(100); // Normalization removes case and special chars
    });

    it('should use custom weights when provided', () => {
      // Arrange
      const category = { id: 1, name: 'Groceries' } as Category;
      const t1 = {
        description: 'Test',
        merchantName: 'Merchant',
        amount: -50.0,
        category,
      } as Transaction;
      const t2 = {
        description: 'Test',
        merchantName: 'Merchant',
        amount: -50.0,
        category,
      } as Transaction;

      const customWeights = {
        category: 0.5,
        merchant: 0.3,
        description: 0.15,
        amount: 0.05,
      };

      // Act
      const result = service.calculateSimilarity(t1, t2, customWeights);

      // Assert
      expect(result.total).toBe(100); // All match, so still 100
    });
  });

  describe('calculateGroupSimilarity', () => {
    it('should return 0 for empty group', () => {
      // Arrange
      const transaction = {
        description: 'Test',
        merchantName: 'Merchant',
        amount: -50.0,
      } as Transaction;

      // Act
      const result = service.calculateGroupSimilarity(transaction, []);

      // Assert
      expect(result).toBe(0);
    });

    it('should calculate average similarity across group', () => {
      // Arrange
      const category = { id: 1, name: 'Groceries' } as Category;
      const transaction = {
        description: 'Carrefour Shopping',
        merchantName: 'Carrefour',
        amount: -50.0,
        category,
      } as Transaction;

      const group = [
        {
          description: 'Carrefour Shopping',
          merchantName: 'Carrefour',
          amount: -50.0,
          category,
        } as Transaction,
        {
          description: 'Carrefour Purchase',
          merchantName: 'Carrefour',
          amount: -55.0,
          category,
        } as Transaction,
        {
          description: 'Shopping',
          merchantName: 'Carrefour Express',
          amount: -48.0,
          category,
        } as Transaction,
      ];

      // Act
      const result = service.calculateGroupSimilarity(transaction, group);

      // Assert
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(100);
      // First transaction should be 100% similar, others less so
      // Average should be high but not 100
      expect(result).toBeGreaterThan(80);
    });

    it('should use provided weights for group similarity', () => {
      // Arrange
      const category = { id: 1, name: 'Groceries' } as Category;
      const transaction = {
        description: 'Test',
        merchantName: 'Merchant',
        amount: -50.0,
        category,
      } as Transaction;

      const group = [
        {
          description: 'Test',
          merchantName: 'Merchant',
          amount: -50.0,
          category,
        } as Transaction,
      ];

      const weights = {
        category: 0.25,
        merchant: 0.25,
        description: 0.25,
        amount: 0.25,
      };

      // Act
      const result = service.calculateGroupSimilarity(transaction, group, weights);

      // Assert
      expect(result).toBe(100);
    });

    it('should round result to 2 decimal places', () => {
      // Arrange
      const category = { id: 1, name: 'Groceries' } as Category;
      const transaction = {
        description: 'Test A',
        merchantName: 'Merchant A',
        amount: -50.33,
        category,
      } as Transaction;

      const group = [
        {
          description: 'Test B',
          merchantName: 'Merchant B',
          amount: -51.67,
          category,
        } as Transaction,
      ];

      // Act
      const result = service.calculateGroupSimilarity(transaction, group);

      // Assert
      expect(result).toEqual(expect.any(Number));
      // Check it's rounded to max 2 decimal places
      expect(result.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
    });
  });

  describe('edge cases', () => {
    it('should handle transactions with zero amounts', () => {
      // Arrange
      const category = { id: 1, name: 'Transfer' } as Category;
      const t1 = {
        description: 'Transfer',
        merchantName: 'Bank',
        amount: 0,
        category,
      } as Transaction;
      const t2 = {
        description: 'Transfer',
        merchantName: 'Bank',
        amount: 0,
        category,
      } as Transaction;

      // Act
      const result = service.calculateSimilarity(t1, t2);

      // Assert
      expect(result.amountSimilarity).toBe(0); // Zero amounts return 0
      expect(result.total).toBeGreaterThan(0); // Other fields still match
    });

    it('should handle transactions with no category', () => {
      // Arrange
      const t1 = {
        id: 1,
        description: 'Unknown',
        merchantName: 'Unknown',
        amount: -50.0,
        category: undefined,
        executionDate: new Date(),
      } as Partial<Transaction> as Transaction;
      const t2 = {
        id: 2,
        description: 'Unknown',
        merchantName: 'Unknown',
        amount: -50.0,
        category: undefined,
        executionDate: new Date(),
      } as Partial<Transaction> as Transaction;

      // Act
      const result = service.calculateSimilarity(t1, t2);

      // Assert
      expect(result.categoryMatch).toBe(0);
      expect(result.total).toBeGreaterThan(0); // Other fields match
    });

    it('should handle very long descriptions', () => {
      // Arrange
      const longDesc = 'A'.repeat(500);
      const category = { id: 1, name: 'Test' } as Category;
      const t1 = {
        description: longDesc,
        merchantName: 'Merchant',
        amount: -50.0,
        category,
      } as Transaction;
      const t2 = {
        description: longDesc + 'B',
        merchantName: 'Merchant',
        amount: -50.0,
        category,
      } as Transaction;

      // Act
      const result = service.calculateSimilarity(t1, t2);

      // Assert
      expect(result.descriptionMatch).toBeGreaterThan(99); // Very similar
      expect(result.total).toBeGreaterThan(95);
    });
  });
});
