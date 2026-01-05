import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { PatternDetectionService } from './pattern-detection.service';
import { SimilarityScorerService } from './similarity-scorer.service';
import { FrequencyAnalyzerService } from './frequency-analyzer.service';
import { Transaction } from '../../transactions/transaction.entity';
import { Category } from '../../categories/entities/category.entity';
import { User } from '../../users/user.entity';
import { RepositoryMockFactory } from '../../test/test-utils/repository-mocks';
import { addDays, subMonths } from 'date-fns';
import { FrequencyType } from '../interfaces/frequency.interface';

describe('PatternDetectionService', () => {
  let service: PatternDetectionService;
  let repository: Repository<Transaction>;
  let similarityScorer: SimilarityScorerService;
  let frequencyAnalyzer: FrequencyAnalyzerService;
  let module: TestingModule;

  const mockUser = {
    id: 1,
    auth0Id: 'auth0|123456',
  } as User;

  const mockCategory = {
    id: 1,
    name: 'Subscriptions',
  } as Category;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        PatternDetectionService,
        SimilarityScorerService,
        FrequencyAnalyzerService,
        RepositoryMockFactory.createRepositoryProvider(Transaction),
      ],
    }).compile();

    service = module.get<PatternDetectionService>(PatternDetectionService);
    repository = module.get(getRepositoryToken(Transaction));
    similarityScorer = module.get<SimilarityScorerService>(
      SimilarityScorerService,
    );
    frequencyAnalyzer = module.get<FrequencyAnalyzerService>(
      FrequencyAnalyzerService,
    );
  });

  afterEach(async () => {
    await module.close();
  });

  describe('detectPatterns', () => {
    it('should return empty array when no transactions exist', async () => {
      // Arrange
      (repository.find as jest.Mock).mockResolvedValue([]);

      const criteria = {
        userId: 1,
        monthsToAnalyze: 12,
        minOccurrences: 2,
        minConfidence: 60,
        similarityThreshold: 60,
      };

      // Act
      const result = await service.detectPatterns(criteria);

      // Assert
      expect(result).toEqual([]);
      expect(repository.find).toHaveBeenCalledWith({
        where: {
          user: { id: 1 },
          executionDate: expect.any(Object), // MoreThanOrEqual is an object, not a Date
        },
        relations: ['category'],
        order: { executionDate: 'ASC' },
      });
    });

    it('should return empty array when transactions less than minOccurrences', async () => {
      // Arrange
      const transaction = {
        id: 1,
        description: 'Netflix',
        merchantName: 'Netflix',
        amount: -15.99,
        category: mockCategory,
        executionDate: new Date(),
      } as Transaction;

      (repository.find as jest.Mock).mockResolvedValue([transaction]);

      const criteria = {
        userId: 1,
        monthsToAnalyze: 12,
        minOccurrences: 2,
        minConfidence: 60,
        similarityThreshold: 60,
      };

      // Act
      const result = await service.detectPatterns(criteria);

      // Assert
      expect(result).toEqual([]);
    });

    it('should detect monthly subscription pattern', async () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        {
          id: 1,
          description: 'Netflix Subscription',
          merchantName: 'Netflix',
          amount: -15.99,
          category: mockCategory,
          executionDate: baseDate,
          createdAt: baseDate,
        } as Transaction,
        {
          id: 2,
          description: 'Netflix Subscription',
          merchantName: 'Netflix',
          amount: -15.99,
          category: mockCategory,
          executionDate: addDays(baseDate, 30),
          createdAt: addDays(baseDate, 30),
        } as Transaction,
        {
          id: 3,
          description: 'Netflix Subscription',
          merchantName: 'Netflix',
          amount: -15.99,
          category: mockCategory,
          executionDate: addDays(baseDate, 60),
          createdAt: addDays(baseDate, 60),
        } as Transaction,
      ];

      (repository.find as jest.Mock).mockResolvedValue(transactions);

      const criteria = {
        userId: 1,
        monthsToAnalyze: 12,
        minOccurrences: 2,
        minConfidence: 60,
        similarityThreshold: 60,
      };

      // Act
      const result = await service.detectPatterns(criteria);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].group.transactions).toHaveLength(3);
      expect(result[0].group.merchantName).toBe('Netflix');
      expect(result[0].frequency.type).toBe(FrequencyType.MONTHLY);
      expect(result[0].confidence.overall).toBeGreaterThanOrEqual(60);
    });

    it('should group similar transactions together', async () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        {
          id: 1,
          description: 'Spotify Premium',
          merchantName: 'Spotify',
          amount: -9.99,
          category: mockCategory,
          executionDate: baseDate,
          createdAt: baseDate,
        } as Transaction,
        {
          id: 2,
          description: 'Spotify Premium',
          merchantName: 'Spotify',
          amount: -9.99,
          category: mockCategory,
          executionDate: addDays(baseDate, 30),
          createdAt: addDays(baseDate, 30),
        } as Transaction,
        {
          id: 3,
          description: 'Netflix Subscription',
          merchantName: 'Netflix',
          amount: -15.99,
          category: mockCategory,
          executionDate: addDays(baseDate, 15),
          createdAt: addDays(baseDate, 15),
        } as Transaction,
        {
          id: 4,
          description: 'Netflix Subscription',
          merchantName: 'Netflix',
          amount: -15.99,
          category: mockCategory,
          executionDate: addDays(baseDate, 45),
          createdAt: addDays(baseDate, 45),
        } as Transaction,
      ];

      (repository.find as jest.Mock).mockResolvedValue(transactions);

      const criteria = {
        userId: 1,
        monthsToAnalyze: 12,
        minOccurrences: 2,
        minConfidence: 60,
        similarityThreshold: 60,
      };

      // Act
      const result = await service.detectPatterns(criteria);

      // Assert
      expect(result).toHaveLength(2); // Two distinct patterns
      const spotifyPattern = result.find(
        (p) => p.group.merchantName === 'Spotify',
      );
      const netflixPattern = result.find(
        (p) => p.group.merchantName === 'Netflix',
      );
      expect(spotifyPattern).toBeDefined();
      expect(netflixPattern).toBeDefined();
      expect(spotifyPattern!.group.transactions).toHaveLength(2);
      expect(netflixPattern!.group.transactions).toHaveLength(2);
    });

    it('should handle amount variations with low weight (salary bonus case)', async () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        {
          id: 1,
          description: 'Monthly Salary',
          merchantName: 'Employer Inc',
          amount: 3000,
          category: mockCategory,
          executionDate: baseDate,
          createdAt: baseDate,
        } as Transaction,
        {
          id: 2,
          description: 'Monthly Salary',
          merchantName: 'Employer Inc',
          amount: 3500, // +16% bonus
          category: mockCategory,
          executionDate: addDays(baseDate, 30),
          createdAt: addDays(baseDate, 30),
        } as Transaction,
        {
          id: 3,
          description: 'Monthly Salary',
          merchantName: 'Employer Inc',
          amount: 3000,
          category: mockCategory,
          executionDate: addDays(baseDate, 60),
          createdAt: addDays(baseDate, 60),
        } as Transaction,
      ];

      (repository.find as jest.Mock).mockResolvedValue(transactions);

      const criteria = {
        userId: 1,
        monthsToAnalyze: 12,
        minOccurrences: 2,
        minConfidence: 60,
        similarityThreshold: 60,
      };

      // Act
      const result = await service.detectPatterns(criteria);

      // Assert
      expect(result).toHaveLength(1); // Should group together despite amount variation
      expect(result[0].group.transactions).toHaveLength(3);
      expect(result[0].group.merchantName).toBe('Employer Inc');
    });

    it('should filter patterns by minConfidence threshold', async () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      // Create irregular pattern with low confidence
      const transactions = [
        {
          id: 1,
          description: 'Random Purchase',
          merchantName: 'Store',
          amount: -50,
          category: mockCategory,
          executionDate: baseDate,
          createdAt: baseDate,
        } as Transaction,
        {
          id: 2,
          description: 'Random Purchase',
          merchantName: 'Store',
          amount: -50,
          category: mockCategory,
          executionDate: addDays(baseDate, 5), // Irregular interval
          createdAt: addDays(baseDate, 5),
        } as Transaction,
        {
          id: 3,
          description: 'Random Purchase',
          merchantName: 'Store',
          amount: -50,
          category: mockCategory,
          executionDate: addDays(baseDate, 25), // Very irregular
          createdAt: addDays(baseDate, 25),
        } as Transaction,
      ];

      (repository.find as jest.Mock).mockResolvedValue(transactions);

      const criteria = {
        userId: 1,
        monthsToAnalyze: 12,
        minOccurrences: 2,
        minConfidence: 80, // High confidence requirement
        similarityThreshold: 60,
      };

      // Act
      const result = await service.detectPatterns(criteria);

      // Assert
      expect(result).toHaveLength(0); // Should filter out low confidence pattern
    });

    it('should sort results by confidence (highest first)', async () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        // High confidence pattern - consistent weekly
        {
          id: 1,
          description: 'Weekly Grocery',
          merchantName: 'Supermarket',
          amount: -50,
          category: mockCategory,
          executionDate: baseDate,
          createdAt: baseDate,
        } as Transaction,
        {
          id: 2,
          description: 'Weekly Grocery',
          merchantName: 'Supermarket',
          amount: -50,
          category: mockCategory,
          executionDate: addDays(baseDate, 7),
          createdAt: addDays(baseDate, 7),
        } as Transaction,
        {
          id: 3,
          description: 'Weekly Grocery',
          merchantName: 'Supermarket',
          amount: -50,
          category: mockCategory,
          executionDate: addDays(baseDate, 14),
          createdAt: addDays(baseDate, 14),
        } as Transaction,
        // Lower confidence pattern - less consistent
        {
          id: 4,
          description: 'Irregular Purchase',
          merchantName: 'Store',
          amount: -30,
          category: mockCategory,
          executionDate: baseDate,
          createdAt: baseDate,
        } as Transaction,
        {
          id: 5,
          description: 'Irregular Purchase',
          merchantName: 'Store',
          amount: -30,
          category: mockCategory,
          executionDate: addDays(baseDate, 20),
          createdAt: addDays(baseDate, 20),
        } as Transaction,
      ];

      (repository.find as jest.Mock).mockResolvedValue(transactions);

      const criteria = {
        userId: 1,
        monthsToAnalyze: 12,
        minOccurrences: 2,
        minConfidence: 50,
        similarityThreshold: 60,
      };

      // Act
      const result = await service.detectPatterns(criteria);

      // Assert
      expect(result.length).toBeGreaterThan(1);
      // First pattern should have higher confidence than second
      expect(result[0].confidence.overall).toBeGreaterThanOrEqual(
        result[1].confidence.overall,
      );
    });

    it('should include first and last occurrence dates', async () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        {
          id: 1,
          description: 'Pattern',
          merchantName: 'Merchant',
          amount: -50,
          category: mockCategory,
          executionDate: baseDate,
          createdAt: baseDate,
        } as Transaction,
        {
          id: 2,
          description: 'Pattern',
          merchantName: 'Merchant',
          amount: -50,
          category: mockCategory,
          executionDate: addDays(baseDate, 30),
          createdAt: addDays(baseDate, 30),
        } as Transaction,
        {
          id: 3,
          description: 'Pattern',
          merchantName: 'Merchant',
          amount: -50,
          category: mockCategory,
          executionDate: addDays(baseDate, 60),
          createdAt: addDays(baseDate, 60),
        } as Transaction,
      ];

      (repository.find as jest.Mock).mockResolvedValue(transactions);

      const criteria = {
        userId: 1,
        monthsToAnalyze: 12,
        minOccurrences: 2,
        minConfidence: 60,
        similarityThreshold: 60,
      };

      // Act
      const result = await service.detectPatterns(criteria);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].firstOccurrence).toEqual(baseDate);
      expect(result[0].lastOccurrence).toEqual(addDays(baseDate, 60));
    });

    it('should handle error in group analysis gracefully', async () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        {
          id: 1,
          description: 'Test',
          merchantName: 'Test',
          amount: -50,
          category: mockCategory,
          executionDate: baseDate,
          createdAt: baseDate,
        } as Transaction,
        {
          id: 2,
          description: 'Test',
          merchantName: 'Test',
          amount: -50,
          category: mockCategory,
          executionDate: addDays(baseDate, 30),
          createdAt: addDays(baseDate, 30),
        } as Transaction,
      ];

      (repository.find as jest.Mock).mockResolvedValue(transactions);

      // Mock frequency analyzer to throw error
      jest
        .spyOn(frequencyAnalyzer, 'analyzeFrequency')
        .mockImplementation(() => {
          throw new Error('Test error');
        });

      const criteria = {
        userId: 1,
        monthsToAnalyze: 12,
        minOccurrences: 2,
        minConfidence: 60,
        similarityThreshold: 60,
      };

      // Act
      const result = await service.detectPatterns(criteria);

      // Assert
      expect(result).toEqual([]); // Should continue with empty results, not crash
    });

    it('should update group statistics when adding transactions', async () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        {
          id: 1,
          description: 'Purchase',
          merchantName: 'Store A',
          amount: -40,
          category: mockCategory,
          executionDate: baseDate,
          createdAt: baseDate,
        } as Transaction,
        {
          id: 2,
          description: 'Purchase',
          merchantName: 'Store B', // Different merchant
          amount: -50,
          category: mockCategory,
          executionDate: addDays(baseDate, 30),
          createdAt: addDays(baseDate, 30),
        } as Transaction,
        {
          id: 3,
          description: 'Purchase',
          merchantName: 'Store B', // Most common merchant
          amount: -60,
          category: mockCategory,
          executionDate: addDays(baseDate, 60),
          createdAt: addDays(baseDate, 60),
        } as Transaction,
      ];

      (repository.find as jest.Mock).mockResolvedValue(transactions);

      const criteria = {
        userId: 1,
        monthsToAnalyze: 12,
        minOccurrences: 2,
        minConfidence: 60,
        similarityThreshold: 60,
      };

      // Act
      const result = await service.detectPatterns(criteria);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].group.merchantName).toBe('Store B'); // Most common merchant
      expect(result[0].group.averageAmount).toBeCloseTo(50, 0); // Average of 40, 50, 60
    });
  });

  describe('confidence calculation', () => {
    it('should include occurrence boost in confidence', async () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      // Create 6 occurrences for max boost (+20)
      const transactions = Array.from({ length: 6 }, (_, i) => ({
        id: i + 1,
        description: 'Weekly Pattern',
        merchantName: 'Merchant',
        amount: -50,
        category: mockCategory,
        executionDate: addDays(baseDate, i * 7),
        createdAt: addDays(baseDate, i * 7),
      })) as Transaction[];

      (repository.find as jest.Mock).mockResolvedValue(transactions);

      const criteria = {
        userId: 1,
        monthsToAnalyze: 12,
        minOccurrences: 2,
        minConfidence: 60,
        similarityThreshold: 60,
      };

      // Act
      const result = await service.detectPatterns(criteria);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].confidence.breakdown.occurrenceCount).toBe(6);
      // High frequency confidence + similarity + 20 boost should be close to 100
      expect(result[0].confidence.overall).toBeGreaterThan(90);
    });
  });
});
