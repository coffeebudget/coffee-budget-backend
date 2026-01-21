import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  CategoryFallbackSuggestionService,
  SUGGESTION_CONFIG,
} from './category-fallback-suggestion.service';
import { Transaction } from '../../transactions/transaction.entity';
import { RepositoryMockFactory } from '../../test/test-utils/repository-mocks';

describe('CategoryFallbackSuggestionService', () => {
  let service: CategoryFallbackSuggestionService;
  let module: TestingModule;

  // Mock query builder for aggregate queries
  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getRawOne: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        CategoryFallbackSuggestionService,
        RepositoryMockFactory.createRepositoryProvider(Transaction),
      ],
    }).compile();

    service = module.get<CategoryFallbackSuggestionService>(
      CategoryFallbackSuggestionService,
    );

    // Setup createQueryBuilder mock
    const repository = module.get(getRepositoryToken(Transaction));
    (repository.createQueryBuilder as jest.Mock).mockReturnValue(
      mockQueryBuilder,
    );

    // Reset all mock implementations
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await module.close();
  });

  describe('generateFallbackSuggestions', () => {
    it('should return empty array when no categories have expenses', async () => {
      // Arrange
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      // Act
      const result = await service.generateFallbackSuggestions(1);

      // Assert
      expect(result).toEqual([]);
    });

    it('should generate fallback suggestions for categories with sufficient spending', async () => {
      // Arrange
      const mockCategoryStats = [
        {
          categoryId: '1',
          categoryName: 'Groceries',
          totalSpent: '600.00', // €50/month average
          transactionCount: '15',
          firstOccurrence: '2024-01-01',
          lastOccurrence: '2024-12-01',
        },
        {
          categoryId: '2',
          categoryName: 'Entertainment',
          totalSpent: '480.00', // €40/month average
          transactionCount: '8',
          firstOccurrence: '2024-03-01',
          lastOccurrence: '2024-11-01',
        },
      ];

      mockQueryBuilder.getRawMany.mockResolvedValue(mockCategoryStats);

      // Act
      const result = await service.generateFallbackSuggestions(1);

      // Assert
      expect(result).toHaveLength(2);

      // Check first suggestion (Groceries)
      expect(result[0].categoryId).toBe(1);
      expect(result[0].categoryName).toBe('Groceries');
      expect(result[0].monthlyAverage).toBe(50);
      expect(result[0].suggestedPurpose).toBe('spending_budget');
      expect(result[0].reason).toBe('no_pattern_detected');

      // Check second suggestion (Entertainment)
      expect(result[1].categoryId).toBe(2);
      expect(result[1].categoryName).toBe('Entertainment');
      expect(result[1].monthlyAverage).toBe(40);
    });

    it('should filter out categories below minimum monthly average threshold', async () => {
      // Arrange
      const mockCategoryStats = [
        {
          categoryId: '1',
          categoryName: 'Groceries',
          totalSpent: '600.00', // €50/month - above threshold
          transactionCount: '15',
          firstOccurrence: '2024-01-01',
          lastOccurrence: '2024-12-01',
        },
        {
          categoryId: '2',
          categoryName: 'Small Expense',
          totalSpent: '240.00', // €20/month - below €30 threshold
          transactionCount: '12',
          firstOccurrence: '2024-01-01',
          lastOccurrence: '2024-12-01',
        },
      ];

      mockQueryBuilder.getRawMany.mockResolvedValue(mockCategoryStats);

      // Act
      const result = await service.generateFallbackSuggestions(1);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].categoryName).toBe('Groceries');
    });

    it('should filter out categories with insufficient transactions', async () => {
      // Arrange
      const mockCategoryStats = [
        {
          categoryId: '1',
          categoryName: 'Groceries',
          totalSpent: '600.00',
          transactionCount: '15', // Above minimum
          firstOccurrence: '2024-01-01',
          lastOccurrence: '2024-12-01',
        },
        {
          categoryId: '2',
          categoryName: 'One-time Purchase',
          totalSpent: '500.00',
          transactionCount: '1', // Below minimum of 2
          firstOccurrence: '2024-06-01',
          lastOccurrence: '2024-06-01',
        },
      ];

      mockQueryBuilder.getRawMany.mockResolvedValue(mockCategoryStats);

      // Act
      const result = await service.generateFallbackSuggestions(1);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].categoryName).toBe('Groceries');
    });

    it('should sort suggestions by monthly average (highest first)', async () => {
      // Arrange
      const mockCategoryStats = [
        {
          categoryId: '1',
          categoryName: 'Entertainment',
          totalSpent: '480.00', // €40/month
          transactionCount: '8',
          firstOccurrence: '2024-01-01',
          lastOccurrence: '2024-12-01',
        },
        {
          categoryId: '2',
          categoryName: 'Groceries',
          totalSpent: '1200.00', // €100/month
          transactionCount: '24',
          firstOccurrence: '2024-01-01',
          lastOccurrence: '2024-12-01',
        },
      ];

      mockQueryBuilder.getRawMany.mockResolvedValue(mockCategoryStats);

      // Act
      const result = await service.generateFallbackSuggestions(1);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].categoryName).toBe('Groceries'); // Higher average first
      expect(result[1].categoryName).toBe('Entertainment');
    });
  });

  describe('getCategoryMonthlyAverage', () => {
    it('should return monthly average for a category', async () => {
      // Arrange
      mockQueryBuilder.getRawOne.mockResolvedValue({ totalSpent: '600.00' });

      // Act
      const result = await service.getCategoryMonthlyAverage(1, 1);

      // Assert
      expect(result).toBe(50); // 600 / 12 months
    });

    it('should return 0 when no spending in category', async () => {
      // Arrange
      mockQueryBuilder.getRawOne.mockResolvedValue({ totalSpent: null });

      // Act
      const result = await service.getCategoryMonthlyAverage(1, 1);

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('checkPatternDiscrepancy', () => {
    it('should return no discrepancy when pattern matches category average', async () => {
      // Arrange
      mockQueryBuilder.getRawOne.mockResolvedValue({ totalSpent: '600.00' }); // €50/month

      // Act
      const result = await service.checkPatternDiscrepancy(50, 1, 1);

      // Assert
      expect(result.hasDiscrepancy).toBe(false);
      expect(result.patternAmount).toBe(50);
      expect(result.categoryAverage).toBe(50);
      expect(result.discrepancyPercentage).toBe(0);
    });

    it('should detect discrepancy when pattern is significantly lower than average', async () => {
      // Arrange
      // Category average €100/month, pattern suggests €25/month (75% discrepancy)
      mockQueryBuilder.getRawOne.mockResolvedValue({ totalSpent: '1200.00' }); // €100/month

      // Act
      const result = await service.checkPatternDiscrepancy(25, 1, 1);

      // Assert
      expect(result.hasDiscrepancy).toBe(true);
      expect(result.patternAmount).toBe(25);
      expect(result.categoryAverage).toBe(100);
      expect(result.discrepancyPercentage).toBe(75);
      expect(result.message).toContain('additional variable expenses');
    });

    it('should detect discrepancy when pattern is significantly higher than average', async () => {
      // Arrange
      // Category average €50/month, pattern suggests €100/month (100% discrepancy)
      mockQueryBuilder.getRawOne.mockResolvedValue({ totalSpent: '600.00' }); // €50/month

      // Act
      const result = await service.checkPatternDiscrepancy(100, 1, 1);

      // Assert
      expect(result.hasDiscrepancy).toBe(true);
      expect(result.discrepancyPercentage).toBe(100);
      expect(result.message).toContain('one-time expenses');
    });

    it('should not flag discrepancy when difference is below threshold', async () => {
      // Arrange
      // Category average €100/month, pattern suggests €95/month (5% discrepancy - below 10% threshold)
      mockQueryBuilder.getRawOne.mockResolvedValue({ totalSpent: '1200.00' }); // €100/month

      // Act
      const result = await service.checkPatternDiscrepancy(95, 1, 1);

      // Assert
      expect(result.hasDiscrepancy).toBe(false);
      expect(result.discrepancyPercentage).toBe(5);
    });

    it('should return no discrepancy when category average is 0', async () => {
      // Arrange
      mockQueryBuilder.getRawOne.mockResolvedValue({ totalSpent: '0' });

      // Act
      const result = await service.checkPatternDiscrepancy(50, 1, 1);

      // Assert
      expect(result.hasDiscrepancy).toBe(false);
    });

    it('should cap discrepancy percentage at 999.99 to fit database column constraint', async () => {
      // Arrange
      // Category average €10/month, pattern suggests €2500/month (24900% discrepancy)
      // This would overflow decimal(5,2) column if not capped
      mockQueryBuilder.getRawOne.mockResolvedValue({ totalSpent: '120.00' }); // €10/month

      // Act
      const result = await service.checkPatternDiscrepancy(2500, 1, 1);

      // Assert
      expect(result.hasDiscrepancy).toBe(true);
      expect(result.discrepancyPercentage).toBe(999.99); // Capped
      expect(result.discrepancyPercentage).toBeLessThanOrEqual(999.99);
    });
  });

  describe('configuration', () => {
    it('should use correct default configuration values', () => {
      expect(SUGGESTION_CONFIG.MIN_MONTHLY_AVERAGE).toBe(30);
      expect(SUGGESTION_CONFIG.DISCREPANCY_THRESHOLD).toBe(10);
      expect(SUGGESTION_CONFIG.MIN_TRANSACTIONS).toBe(2);
      expect(SUGGESTION_CONFIG.MONTHS_TO_ANALYZE).toBe(12);
    });
  });
});
