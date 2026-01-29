import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SuggestionGeneratorService } from './suggestion-generator.service';
import { PatternDetectionService } from './pattern-detection.service';
import { PatternClassificationService } from './pattern-classification.service';
import { CategoryFallbackSuggestionService } from './category-fallback-suggestion.service';
import { TemplateDetectorService } from './template-detector.service';
import { ExpensePlanSuggestion } from '../entities/expense-plan-suggestion.entity';
import { ExpensePlan } from '../../expense-plans/entities/expense-plan.entity';
import { Category } from '../../categories/entities/category.entity';
import { ExpensePlanAdjustmentService } from '../../expense-plans/expense-plan-adjustment.service';
import { RepositoryMockFactory } from '../../test/test-utils/repository-mocks';
import { ExpenseType } from '../interfaces/classification.interface';
import { FrequencyType } from '../interfaces/frequency.interface';
import { DetectedPatternData } from '../interfaces/pattern.interface';

describe('SuggestionGeneratorService', () => {
  let service: SuggestionGeneratorService;
  let module: TestingModule;
  let suggestionRepository: any;
  let expensePlanRepository: any;
  let categoryRepository: any;
  let patternDetectionService: jest.Mocked<PatternDetectionService>;
  let patternClassificationService: jest.Mocked<PatternClassificationService>;
  let categoryFallbackService: jest.Mocked<CategoryFallbackSuggestionService>;

  const mockUserId = 1;

  const createMockPattern = (
    overrides: Partial<DetectedPatternData> = {},
  ): DetectedPatternData => ({
    group: {
      id: 'pattern-1',
      categoryId: 1,
      categoryName: 'Entertainment',
      merchantName: 'Netflix',
      representativeDescription: 'Netflix subscription',
      averageAmount: 15.99,
      transactions: [
        {
          id: 1,
          amount: -15.99,
          description: 'Netflix',
          transactionDate: new Date(),
        } as any,
        {
          id: 2,
          amount: -15.99,
          description: 'Netflix',
          transactionDate: new Date(),
        } as any,
      ],
    },
    frequency: {
      type: FrequencyType.MONTHLY,
      intervalDays: 30,
      occurrenceCount: 6,
      confidence: 90,
      nextExpectedDate: new Date(),
    },
    confidence: {
      overall: 92,
      breakdown: {
        similarity: 95,
        frequency: 90,
        occurrenceCount: 6,
      },
    },
    firstOccurrence: new Date('2024-01-15'),
    lastOccurrence: new Date('2024-06-15'),
    nextExpectedDate: new Date('2024-07-15'),
    ...overrides,
  });

  const createMockClassification = (patternId: string) => ({
    patternId,
    expenseType: ExpenseType.SUBSCRIPTION,
    isEssential: false,
    suggestedPlanName: 'Netflix Subscription',
    monthlyContribution: 15.99,
    confidence: 85,
    reasoning: 'Detected as streaming subscription',
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        SuggestionGeneratorService,
        RepositoryMockFactory.createRepositoryProvider(ExpensePlanSuggestion),
        RepositoryMockFactory.createRepositoryProvider(ExpensePlan),
        RepositoryMockFactory.createRepositoryProvider(Category),
        {
          provide: PatternDetectionService,
          useValue: {
            detectPatterns: jest.fn(),
          },
        },
        {
          provide: PatternClassificationService,
          useValue: {
            classifyPatterns: jest.fn(),
            getApiUsageStats: jest.fn(),
          },
        },
        {
          provide: ExpensePlanAdjustmentService,
          useValue: {
            reviewAllPlansForUser: jest.fn().mockResolvedValue({
              plansReviewed: 0,
              newSuggestions: 0,
              clearedSuggestions: 0,
            }),
          },
        },
        {
          provide: CategoryFallbackSuggestionService,
          useValue: {
            generateFallbackSuggestions: jest.fn().mockResolvedValue([]),
            getCategoryMonthlyAverage: jest.fn().mockResolvedValue(0),
            checkPatternDiscrepancy: jest.fn().mockResolvedValue({
              hasDiscrepancy: false,
              discrepancyPercentage: 0,
            }),
          },
        },
        {
          provide: TemplateDetectorService,
          useValue: {
            detectTemplate: jest.fn().mockReturnValue({
              templateId: 'monthly-bill',
              confidence: 85,
              reasons: ['Monthly payments detected'],
              suggestedConfig: { dueDay: 15 },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SuggestionGeneratorService>(
      SuggestionGeneratorService,
    );
    suggestionRepository = module.get(
      getRepositoryToken(ExpensePlanSuggestion),
    );
    expensePlanRepository = module.get(getRepositoryToken(ExpensePlan));
    categoryRepository = module.get(getRepositoryToken(Category));
    patternDetectionService = module.get(PatternDetectionService);
    patternClassificationService = module.get(PatternClassificationService);
    categoryFallbackService = module.get(CategoryFallbackSuggestionService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('generateSuggestions', () => {
    it('should generate suggestions from detected patterns', async () => {
      // Arrange
      const mockPatterns = [createMockPattern()];
      const mockClassifications = [createMockClassification('pattern-1')];
      const savedSuggestion = {
        id: 1,
        userId: mockUserId,
        suggestedName: 'Netflix Subscription',
        expenseType: ExpenseType.SUBSCRIPTION,
        isEssential: false,
        monthlyContribution: 15.99,
        status: 'pending',
      };

      patternDetectionService.detectPatterns.mockResolvedValue(mockPatterns);
      patternClassificationService.classifyPatterns.mockResolvedValue({
        classifications: mockClassifications,
        tokensUsed: 100,
        estimatedCost: 0.002,
        processingTimeMs: 500,
      });
      // First call: getRecentPendingSuggestions returns empty (no recent)
      // Second call: filterExistingSuggestions - check existing pending
      // Third call: getPendingSuggestions returns the saved suggestion
      suggestionRepository.find
        .mockResolvedValueOnce([]) // getRecentPendingSuggestions
        .mockResolvedValueOnce([]) // filterExistingSuggestions
        .mockResolvedValueOnce([savedSuggestion]); // getPendingSuggestions after save
      expensePlanRepository.find.mockResolvedValue([]);
      suggestionRepository.save.mockImplementation((entities) =>
        Promise.resolve(
          entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
        ),
      );

      // Act
      const result = await service.generateSuggestions(mockUserId);

      // Assert
      expect(result.totalFound).toBeGreaterThan(0);
      expect(result.newSuggestions).toBe(1);
      expect(patternDetectionService.detectPatterns).toHaveBeenCalledWith(
        expect.objectContaining({ userId: mockUserId }),
      );
      expect(patternClassificationService.classifyPatterns).toHaveBeenCalled();
      expect(suggestionRepository.save).toHaveBeenCalled();
    });

    it('should return existing pending suggestions if not forcing regeneration', async () => {
      // Arrange
      const existingSuggestion = {
        id: 1,
        userId: mockUserId,
        suggestedName: 'Netflix',
        status: 'pending',
        expenseType: ExpenseType.SUBSCRIPTION,
        overallConfidence: 85,
        createdAt: new Date(),
      };
      suggestionRepository.find.mockResolvedValue([existingSuggestion]);

      // Act
      const result = await service.generateSuggestions(mockUserId, {
        forceRegenerate: false,
      });

      // Assert
      expect(result.totalFound).toBe(1);
      expect(result.newSuggestions).toBe(0);
      expect(patternDetectionService.detectPatterns).not.toHaveBeenCalled();
    });

    it('should regenerate suggestions when forceRegenerate is true', async () => {
      // Arrange
      const mockPatterns = [createMockPattern()];
      const mockClassifications = [createMockClassification('pattern-1')];

      suggestionRepository.find
        .mockResolvedValueOnce([{ id: 1, status: 'pending' }]) // getRecentPendingSuggestions
        .mockResolvedValueOnce([]) // filterExistingSuggestions - existing suggestions
        .mockResolvedValueOnce([]); // getPendingSuggestions

      patternDetectionService.detectPatterns.mockResolvedValue(mockPatterns);
      patternClassificationService.classifyPatterns.mockResolvedValue({
        classifications: mockClassifications,
        tokensUsed: 100,
        estimatedCost: 0.002,
        processingTimeMs: 500,
      });
      expensePlanRepository.find.mockResolvedValue([]);
      suggestionRepository.save.mockImplementation((entities) =>
        Promise.resolve(
          entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
        ),
      );

      // Act
      const result = await service.generateSuggestions(mockUserId, {
        forceRegenerate: true,
      });

      // Assert
      expect(patternDetectionService.detectPatterns).toHaveBeenCalled();
    });

    it('should return empty response when no patterns and no fallback suggestions', async () => {
      // Arrange
      suggestionRepository.delete.mockResolvedValue({ affected: 0 });
      suggestionRepository.find.mockResolvedValue([]);
      suggestionRepository.save.mockResolvedValue([]);
      patternDetectionService.detectPatterns.mockResolvedValue([]);
      // CategoryFallbackSuggestionService.generateFallbackSuggestions already mocks to []

      // Act
      const result = await service.generateSuggestions(mockUserId);

      // Assert
      expect(result.totalFound).toBe(0);
      expect(result.newSuggestions).toBe(0);
      expect(
        patternClassificationService.classifyPatterns,
      ).not.toHaveBeenCalled();
    });

    it('should filter out suggestions that match existing expense plans', async () => {
      // Arrange
      const mockPatterns = [createMockPattern()];
      const mockClassifications = [createMockClassification('pattern-1')];

      suggestionRepository.find.mockResolvedValue([]);
      patternDetectionService.detectPatterns.mockResolvedValue(mockPatterns);
      patternClassificationService.classifyPatterns.mockResolvedValue({
        classifications: mockClassifications,
        tokensUsed: 100,
        estimatedCost: 0.002,
        processingTimeMs: 500,
      });
      expensePlanRepository.find.mockResolvedValue([
        { name: 'Netflix Subscription', categoryId: 1 },
      ]);
      suggestionRepository.save.mockResolvedValue([]);

      // Act
      const result = await service.generateSuggestions(mockUserId);

      // Assert
      expect(result.newSuggestions).toBe(0);
    });

    it('should calculate overall confidence from pattern confidence (v2 aggregation)', async () => {
      // Arrange
      const mockPatterns = [createMockPattern()];
      const mockClassifications = [
        {
          ...createMockClassification('pattern-1'),
          confidence: 80, // Classification confidence
        },
      ];

      suggestionRepository.find.mockResolvedValue([]);
      patternDetectionService.detectPatterns.mockResolvedValue(mockPatterns);
      patternClassificationService.classifyPatterns.mockResolvedValue({
        classifications: mockClassifications,
        tokensUsed: 100,
        estimatedCost: 0.002,
        processingTimeMs: 500,
      });
      expensePlanRepository.find.mockResolvedValue([]);
      suggestionRepository.save.mockImplementation((entities) => {
        // v2: Overall confidence is now the average of pattern confidences
        // Since we have one pattern with 92 confidence, average is 92
        const entity = entities[0];
        expect(entity.overallConfidence).toBe(92);
        return Promise.resolve(
          entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
        );
      });

      // Act
      await service.generateSuggestions(mockUserId);
    });
  });

  describe('getSuggestions', () => {
    it('should return all suggestions for user', async () => {
      // Arrange
      const mockSuggestions = [
        {
          id: 1,
          suggestedName: 'Netflix',
          status: 'pending',
          overallConfidence: 85,
        },
        {
          id: 2,
          suggestedName: 'Spotify',
          status: 'approved',
          overallConfidence: 80,
        },
      ];

      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockSuggestions),
      };
      suggestionRepository.createQueryBuilder.mockReturnValue(queryBuilder);
      suggestionRepository.createQueryBuilder.mockReturnValue({
        ...queryBuilder,
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { status: 'pending', count: '1' },
          { status: 'approved', count: '1' },
        ]),
      });

      // Act
      const result = await service.getSuggestions(mockUserId);

      // Assert
      expect(result.total).toBe(2);
      expect(result.pending).toBe(1);
      expect(result.approved).toBe(1);
    });

    it('should filter by status when provided', async () => {
      // Arrange
      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      suggestionRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      // Act
      await service.getSuggestions(mockUserId, 'pending');

      // Assert
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'suggestion.status = :status',
        { status: 'pending' },
      );
    });
  });

  describe('getSuggestionById', () => {
    it('should return suggestion when found', async () => {
      // Arrange
      const mockSuggestion = {
        id: 1,
        userId: mockUserId,
        suggestedName: 'Netflix',
        status: 'pending',
      };
      suggestionRepository.findOne.mockResolvedValue(mockSuggestion);

      // Act
      const result = await service.getSuggestionById(mockUserId, 1);

      // Assert
      expect(result).toBeDefined();
      expect(suggestionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1, userId: mockUserId },
        relations: ['category'],
      });
    });

    it('should return null when suggestion not found', async () => {
      // Arrange
      suggestionRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getSuggestionById(mockUserId, 999);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('approveSuggestion', () => {
    it('should create expense plan and update suggestion status', async () => {
      // Arrange
      const mockSuggestion = {
        id: 1,
        userId: mockUserId,
        suggestedName: 'Netflix',
        description: 'Netflix subscription',
        expenseType: ExpenseType.SUBSCRIPTION,
        isEssential: false,
        categoryId: 1,
        yearlyTotal: 191.88,
        monthlyContribution: 15.99,
        frequencyType: FrequencyType.MONTHLY,
        nextExpectedDate: new Date('2024-07-15'),
        status: 'pending',
      };

      suggestionRepository.findOne.mockResolvedValue(mockSuggestion);
      expensePlanRepository.create.mockImplementation((data) => data);
      expensePlanRepository.save.mockResolvedValue({
        ...mockSuggestion,
        id: 10,
      });
      suggestionRepository.save.mockResolvedValue({
        ...mockSuggestion,
        status: 'approved',
      });

      // Act
      const result = await service.approveSuggestion(mockUserId, 1);

      // Assert
      expect(result.success).toBe(true);
      expect(result.expensePlanId).toBe(10);
      expect(expensePlanRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          name: 'Netflix',
          planType: 'fixed_monthly',
          priority: 'discretionary',
        }),
      );
    });

    it('should use custom name when provided', async () => {
      // Arrange
      const mockSuggestion = {
        id: 1,
        userId: mockUserId,
        suggestedName: 'Netflix',
        expenseType: ExpenseType.SUBSCRIPTION,
        isEssential: false,
        status: 'pending',
      };

      suggestionRepository.findOne.mockResolvedValue(mockSuggestion);
      expensePlanRepository.create.mockImplementation((data) => data);
      expensePlanRepository.save.mockResolvedValue({ id: 10 });
      suggestionRepository.save.mockResolvedValue({
        ...mockSuggestion,
        status: 'approved',
      });

      // Act
      await service.approveSuggestion(mockUserId, 1, {
        customName: 'My Netflix',
      });

      // Assert
      expect(expensePlanRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Netflix' }),
      );
    });

    it('should return failure when suggestion not found', async () => {
      // Arrange
      suggestionRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.approveSuggestion(mockUserId, 999);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should map expense types correctly to plan types', async () => {
      // Arrange
      const testCases = [
        {
          expenseType: ExpenseType.SUBSCRIPTION,
          expectedPlanType: 'fixed_monthly',
        },
        { expenseType: ExpenseType.UTILITY, expectedPlanType: 'fixed_monthly' },
        {
          expenseType: ExpenseType.INSURANCE,
          expectedPlanType: 'yearly_fixed',
        },
        { expenseType: ExpenseType.TAX, expectedPlanType: 'yearly_fixed' },
        {
          expenseType: ExpenseType.VARIABLE,
          expectedPlanType: 'yearly_variable',
        },
      ];

      for (const { expenseType, expectedPlanType } of testCases) {
        const mockSuggestion = {
          id: 1,
          userId: mockUserId,
          suggestedName: 'Test',
          expenseType,
          isEssential: false,
          status: 'pending',
        };

        suggestionRepository.findOne.mockResolvedValue(mockSuggestion);
        expensePlanRepository.create.mockImplementation((data) => data);
        expensePlanRepository.save.mockResolvedValue({ id: 10 });
        suggestionRepository.save.mockResolvedValue({
          ...mockSuggestion,
          status: 'approved',
        });

        // Act
        await service.approveSuggestion(mockUserId, 1);

        // Assert
        expect(expensePlanRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({ planType: expectedPlanType }),
        );
      }
    });

    it('should set priority to essential for essential suggestions', async () => {
      // Arrange
      const mockSuggestion = {
        id: 1,
        userId: mockUserId,
        suggestedName: 'Electric Bill',
        expenseType: ExpenseType.UTILITY,
        isEssential: true,
        status: 'pending',
      };

      suggestionRepository.findOne.mockResolvedValue(mockSuggestion);
      expensePlanRepository.create.mockImplementation((data) => data);
      expensePlanRepository.save.mockResolvedValue({ id: 10 });
      suggestionRepository.save.mockResolvedValue({
        ...mockSuggestion,
        status: 'approved',
      });

      // Act
      await service.approveSuggestion(mockUserId, 1);

      // Assert
      expect(expensePlanRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'essential' }),
      );
    });
  });

  describe('rejectSuggestion', () => {
    it('should update suggestion status to rejected', async () => {
      // Arrange
      const mockSuggestion = {
        id: 1,
        userId: mockUserId,
        status: 'pending',
      };
      suggestionRepository.findOne.mockResolvedValue(mockSuggestion);
      suggestionRepository.save.mockResolvedValue({
        ...mockSuggestion,
        status: 'rejected',
      });

      // Act
      const result = await service.rejectSuggestion(mockUserId, 1);

      // Assert
      expect(result.success).toBe(true);
      expect(suggestionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected' }),
      );
    });

    it('should save rejection reason when provided', async () => {
      // Arrange
      const mockSuggestion = {
        id: 1,
        userId: mockUserId,
        status: 'pending',
      };
      suggestionRepository.findOne.mockResolvedValue(mockSuggestion);
      suggestionRepository.save.mockResolvedValue({
        ...mockSuggestion,
        status: 'rejected',
      });

      // Act
      await service.rejectSuggestion(mockUserId, 1, { reason: 'Not relevant' });

      // Assert
      expect(suggestionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ rejectionReason: 'Not relevant' }),
      );
    });

    it('should return failure when suggestion not found', async () => {
      // Arrange
      suggestionRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.rejectSuggestion(mockUserId, 999);

      // Assert
      expect(result.success).toBe(false);
    });
  });

  describe('bulkApprove', () => {
    it('should approve multiple suggestions', async () => {
      // Arrange
      const mockSuggestion1 = {
        id: 1,
        userId: mockUserId,
        status: 'pending',
        expenseType: ExpenseType.SUBSCRIPTION,
      };
      const mockSuggestion2 = {
        id: 2,
        userId: mockUserId,
        status: 'pending',
        expenseType: ExpenseType.UTILITY,
      };

      suggestionRepository.findOne
        .mockResolvedValueOnce(mockSuggestion1)
        .mockResolvedValueOnce(mockSuggestion2);
      expensePlanRepository.create.mockImplementation((data) => data);
      expensePlanRepository.save
        .mockResolvedValueOnce({ id: 10 })
        .mockResolvedValueOnce({ id: 11 });
      suggestionRepository.save.mockImplementation((s) => Promise.resolve(s));

      // Act
      const result = await service.bulkApprove(mockUserId, [1, 2]);

      // Assert
      expect(result.processed).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should continue processing after individual failures', async () => {
      // Arrange
      const mockSuggestion2 = {
        id: 2,
        userId: mockUserId,
        status: 'pending',
        expenseType: ExpenseType.SUBSCRIPTION,
      };

      suggestionRepository.findOne
        .mockResolvedValueOnce(null) // First one not found
        .mockResolvedValueOnce(mockSuggestion2);
      expensePlanRepository.create.mockImplementation((data) => data);
      expensePlanRepository.save.mockResolvedValue({ id: 11 });
      suggestionRepository.save.mockImplementation((s) => Promise.resolve(s));

      // Act
      const result = await service.bulkApprove(mockUserId, [1, 2]);

      // Assert
      expect(result.processed).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('bulkReject', () => {
    it('should reject multiple suggestions', async () => {
      // Arrange
      const mockSuggestion1 = { id: 1, userId: mockUserId, status: 'pending' };
      const mockSuggestion2 = { id: 2, userId: mockUserId, status: 'pending' };

      suggestionRepository.findOne
        .mockResolvedValueOnce(mockSuggestion1)
        .mockResolvedValueOnce(mockSuggestion2);
      suggestionRepository.save.mockImplementation((s) => Promise.resolve(s));

      // Act
      const result = await service.bulkReject(mockUserId, [1, 2]);

      // Assert
      expect(result.processed).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
    });
  });

  describe('cleanupExpiredSuggestions', () => {
    it('should mark expired suggestions', async () => {
      // Arrange
      const queryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 5 }),
      };
      suggestionRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      // Act
      const result = await service.cleanupExpiredSuggestions();

      // Assert
      expect(result).toBe(5);
      expect(queryBuilder.set).toHaveBeenCalledWith({ status: 'expired' });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // CATEGORY AGGREGATION TESTS (v2 Feature)
  // ─────────────────────────────────────────────────────────────

  describe('Category Aggregation (v2)', () => {
    describe('calculateWeightedMonthlyAverage', () => {
      it('should calculate weighted average for 13-month span', async () => {
        // Scenario: Stipendio over 13 months
        // INPS €1,000/month × 9 months = €9,000
        // Main €1,600/month × 4 months = €6,400
        // Total: €15,400 over 13 months ≈ €1,185/month
        const mockPattern1 = createMockPattern({
          group: {
            id: 'pattern-inps',
            categoryId: 1,
            categoryName: 'Stipendio',
            merchantName: 'Roby Salary - INPS',
            representativeDescription: 'INPS salary',
            averageAmount: 1000,
            transactions: Array(9)
              .fill(null)
              .map((_, i) => ({
                id: i + 1,
                amount: 1000,
                description: 'INPS',
                transactionDate: new Date(`2025-0${i + 1}-01`),
              })) as any,
          },
          firstOccurrence: new Date('2025-01-01'),
          lastOccurrence: new Date('2025-09-01'),
          confidence: {
            overall: 85,
            breakdown: { similarity: 90, frequency: 80, occurrenceCount: 9 },
          },
        });

        const mockPattern2 = createMockPattern({
          group: {
            id: 'pattern-main',
            categoryId: 1, // Same category
            categoryName: 'Stipendio',
            merchantName: 'Roby Salary',
            representativeDescription: 'Main salary',
            averageAmount: 1600,
            transactions: Array(4)
              .fill(null)
              .map((_, i) => ({
                id: i + 10,
                amount: 1600,
                description: 'Main salary',
                transactionDate: new Date(`2025-${10 + i}-01`),
              })) as any,
          },
          firstOccurrence: new Date('2025-10-01'),
          lastOccurrence: new Date('2026-01-01'),
          confidence: {
            overall: 90,
            breakdown: { similarity: 95, frequency: 85, occurrenceCount: 4 },
          },
        });

        const mockClassifications = [
          {
            ...createMockClassification('pattern-inps'),
            expenseType: ExpenseType.SALARY,
            isEssential: true,
          },
          {
            ...createMockClassification('pattern-main'),
            expenseType: ExpenseType.SALARY,
            isEssential: true,
          },
        ];

        // Mock setup with proper chained calls
        suggestionRepository.find
          .mockResolvedValueOnce([]) // getRecentPendingSuggestions
          .mockResolvedValueOnce([]) // filterExistingSuggestions
          .mockResolvedValueOnce([{ id: 1, suggestedName: 'Stipendio' }]); // getPendingSuggestions after save
        patternDetectionService.detectPatterns.mockResolvedValue([
          mockPattern1,
          mockPattern2,
        ]);
        patternClassificationService.classifyPatterns.mockResolvedValue({
          classifications: mockClassifications,
          tokensUsed: 100,
          estimatedCost: 0.002,
          processingTimeMs: 500,
        });
        expensePlanRepository.find.mockResolvedValue([]);
        suggestionRepository.save.mockImplementation((entities) =>
          Promise.resolve(
            entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
          ),
        );

        // Act
        const result = await service.generateSuggestions(mockUserId);

        // Assert - should have 1 aggregated suggestion for Stipendio
        expect(result.newSuggestions).toBe(1);
        expect(suggestionRepository.save).toHaveBeenCalled();

        const savedEntities = suggestionRepository.save.mock.calls[0][0];
        expect(savedEntities).toHaveLength(1);
        expect(savedEntities[0].suggestedName).toBe('Stipendio');
        // Weighted average: (9000 + 6400) / 12 months ≈ €1283/month
        // (The exact value depends on the span calculation)
        expect(savedEntities[0].monthlyContribution).toBeGreaterThan(1000);
        expect(savedEntities[0].monthlyContribution).toBeLessThan(1600);
      });

      it('should calculate weighted average for multiple grocery merchants', async () => {
        // Scenario: Groceries over 12 months
        // Esselunga: €200/month × 12 = €2,400
        // Coop: €150/month × 6 = €900
        // Lidl: €100/month × 3 = €300
        // Total: €3,600 over 12 months = €300/month
        const mockPatternEsselunga = createMockPattern({
          group: {
            id: 'pattern-esselunga',
            categoryId: 2,
            categoryName: 'Groceries',
            merchantName: 'Esselunga',
            representativeDescription: 'Grocery shopping',
            averageAmount: 200,
            transactions: Array(12)
              .fill(null)
              .map((_, i) => ({
                id: i + 1,
                amount: -200,
                description: 'Esselunga',
                transactionDate: new Date(
                  `2025-${String(i + 1).padStart(2, '0')}-15`,
                ),
              })) as any,
          },
          firstOccurrence: new Date('2025-01-15'),
          lastOccurrence: new Date('2025-12-15'),
          confidence: {
            overall: 85,
            breakdown: { similarity: 90, frequency: 80, occurrenceCount: 12 },
          },
        });

        const mockPatternCoop = createMockPattern({
          group: {
            id: 'pattern-coop',
            categoryId: 2, // Same category
            categoryName: 'Groceries',
            merchantName: 'Coop',
            representativeDescription: 'Grocery shopping',
            averageAmount: 150,
            transactions: Array(6)
              .fill(null)
              .map((_, i) => ({
                id: i + 20,
                amount: -150,
                description: 'Coop',
                transactionDate: new Date(
                  `2025-${String(i + 1).padStart(2, '0')}-20`,
                ),
              })) as any,
          },
          firstOccurrence: new Date('2025-01-20'),
          lastOccurrence: new Date('2025-06-20'),
          confidence: {
            overall: 80,
            breakdown: { similarity: 85, frequency: 75, occurrenceCount: 6 },
          },
        });

        const mockPatternLidl = createMockPattern({
          group: {
            id: 'pattern-lidl',
            categoryId: 2, // Same category
            categoryName: 'Groceries',
            merchantName: 'Lidl',
            representativeDescription: 'Grocery shopping',
            averageAmount: 100,
            transactions: Array(3)
              .fill(null)
              .map((_, i) => ({
                id: i + 30,
                amount: -100,
                description: 'Lidl',
                transactionDate: new Date(
                  `2025-${String(i + 10).padStart(2, '0')}-10`,
                ),
              })) as any,
          },
          firstOccurrence: new Date('2025-10-10'),
          lastOccurrence: new Date('2025-12-10'),
          confidence: {
            overall: 75,
            breakdown: { similarity: 80, frequency: 70, occurrenceCount: 3 },
          },
        });

        const mockClassifications = [
          {
            ...createMockClassification('pattern-esselunga'),
            suggestedPlanName: 'Esselunga',
          },
          {
            ...createMockClassification('pattern-coop'),
            suggestedPlanName: 'Coop',
          },
          {
            ...createMockClassification('pattern-lidl'),
            suggestedPlanName: 'Lidl',
          },
        ];

        // Mock setup with proper chained calls
        suggestionRepository.find
          .mockResolvedValueOnce([]) // getRecentPendingSuggestions
          .mockResolvedValueOnce([]) // filterExistingSuggestions
          .mockResolvedValueOnce([{ id: 1, suggestedName: 'Groceries' }]); // getPendingSuggestions
        patternDetectionService.detectPatterns.mockResolvedValue([
          mockPatternEsselunga,
          mockPatternCoop,
          mockPatternLidl,
        ]);
        patternClassificationService.classifyPatterns.mockResolvedValue({
          classifications: mockClassifications,
          tokensUsed: 150,
          estimatedCost: 0.003,
          processingTimeMs: 600,
        });
        expensePlanRepository.find.mockResolvedValue([]);
        suggestionRepository.save.mockImplementation((entities) =>
          Promise.resolve(
            entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
          ),
        );

        // Act
        const result = await service.generateSuggestions(mockUserId);

        // Assert - should have 1 aggregated suggestion for Groceries
        expect(result.newSuggestions).toBe(1);

        const savedEntities = suggestionRepository.save.mock.calls[0][0];
        expect(savedEntities).toHaveLength(1);
        expect(savedEntities[0].suggestedName).toBe('Groceries');
        // Total €3,600 / ~11 months (Jan 15 - Dec 15) ≈ €328/month
        // The span is about 10.97 months, so we expect ~330
        expect(savedEntities[0].monthlyContribution).toBeGreaterThan(280);
        expect(savedEntities[0].monthlyContribution).toBeLessThan(380);
        expect(savedEntities[0].metadata.merchants).toContain('Esselunga');
        expect(savedEntities[0].metadata.merchants).toContain('Coop');
        expect(savedEntities[0].metadata.merchants).toContain('Lidl');
      });

      it('should handle single annual expense', async () => {
        // Scenario: Insurance €480 once per year → €40/month
        const mockPattern = createMockPattern({
          group: {
            id: 'pattern-insurance',
            categoryId: 3,
            categoryName: 'Assicurazione',
            merchantName: 'Assicurazione Auto',
            representativeDescription: 'Car insurance annual',
            averageAmount: 480,
            transactions: [
              {
                id: 1,
                amount: -480,
                description: 'Insurance',
                transactionDate: new Date('2025-03-15'),
              } as any,
            ],
          },
          frequency: {
            type: FrequencyType.ANNUAL,
            intervalDays: 365,
            occurrenceCount: 1,
            confidence: 70,
            nextExpectedDate: new Date('2026-03-15'),
          },
          firstOccurrence: new Date('2025-03-15'),
          lastOccurrence: new Date('2025-03-15'),
          confidence: {
            overall: 70,
            breakdown: { similarity: 80, frequency: 60, occurrenceCount: 1 },
          },
        });

        const mockClassifications = [
          {
            ...createMockClassification('pattern-insurance'),
            expenseType: ExpenseType.INSURANCE,
            isEssential: true,
            suggestedPlanName: 'Car Insurance',
            monthlyContribution: 40, // Already calculated by classification
          },
        ];

        // Mock setup with proper chained calls
        suggestionRepository.find
          .mockResolvedValueOnce([]) // getRecentPendingSuggestions
          .mockResolvedValueOnce([]) // filterExistingSuggestions
          .mockResolvedValueOnce([{ id: 1, suggestedName: 'Assicurazione' }]); // getPendingSuggestions
        patternDetectionService.detectPatterns.mockResolvedValue([mockPattern]);
        patternClassificationService.classifyPatterns.mockResolvedValue({
          classifications: mockClassifications,
          tokensUsed: 50,
          estimatedCost: 0.001,
          processingTimeMs: 300,
        });
        expensePlanRepository.find.mockResolvedValue([]);
        suggestionRepository.save.mockImplementation((entities) =>
          Promise.resolve(
            entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
          ),
        );

        // Act
        const result = await service.generateSuggestions(mockUserId);

        // Assert
        expect(result.newSuggestions).toBe(1);

        const savedEntities = suggestionRepository.save.mock.calls[0][0];
        expect(savedEntities).toHaveLength(1);
        expect(savedEntities[0].suggestedName).toBe('Assicurazione');
        // Single transaction, span is 1 month minimum, so €480/1 = €480
        // But the weighted average should still work
        expect(savedEntities[0].metadata.aggregatedPatternCount).toBe(1);
      });
    });

    describe('aggregateByCategory', () => {
      it('should aggregate patterns from same category into one suggestion', async () => {
        // Two patterns with same categoryId should result in one suggestion
        const mockPattern1 = createMockPattern({
          group: {
            ...createMockPattern().group,
            id: 'p1',
            categoryId: 5,
            categoryName: 'Entertainment',
          },
        });
        const mockPattern2 = createMockPattern({
          group: {
            ...createMockPattern().group,
            id: 'p2',
            categoryId: 5,
            categoryName: 'Entertainment',
            merchantName: 'Spotify',
          },
        });

        const mockClassifications = [
          createMockClassification('p1'),
          { ...createMockClassification('p2'), suggestedPlanName: 'Spotify' },
        ];

        suggestionRepository.find.mockResolvedValue([]);
        patternDetectionService.detectPatterns.mockResolvedValue([
          mockPattern1,
          mockPattern2,
        ]);
        patternClassificationService.classifyPatterns.mockResolvedValue({
          classifications: mockClassifications,
          tokensUsed: 100,
          estimatedCost: 0.002,
          processingTimeMs: 500,
        });
        expensePlanRepository.find.mockResolvedValue([]);
        suggestionRepository.save.mockImplementation((entities) =>
          Promise.resolve(
            entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
          ),
        );

        // Act
        const result = await service.generateSuggestions(mockUserId);

        // Assert - should have 1 suggestion, not 2
        const savedEntities = suggestionRepository.save.mock.calls[0][0];
        expect(savedEntities).toHaveLength(1);
        expect(savedEntities[0].categoryId).toBe(5);
      });

      it('should create separate suggestions for different categories', async () => {
        const mockPattern1 = createMockPattern({
          group: {
            ...createMockPattern().group,
            id: 'p1',
            categoryId: 1,
            categoryName: 'Entertainment',
          },
        });
        const mockPattern2 = createMockPattern({
          group: {
            ...createMockPattern().group,
            id: 'p2',
            categoryId: 2,
            categoryName: 'Groceries',
          },
        });

        const mockClassifications = [
          createMockClassification('p1'),
          createMockClassification('p2'),
        ];

        suggestionRepository.find.mockResolvedValue([]);
        patternDetectionService.detectPatterns.mockResolvedValue([
          mockPattern1,
          mockPattern2,
        ]);
        patternClassificationService.classifyPatterns.mockResolvedValue({
          classifications: mockClassifications,
          tokensUsed: 100,
          estimatedCost: 0.002,
          processingTimeMs: 500,
        });
        expensePlanRepository.find.mockResolvedValue([]);
        suggestionRepository.save.mockImplementation((entities) =>
          Promise.resolve(
            entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
          ),
        );

        // Act
        const result = await service.generateSuggestions(mockUserId);

        // Assert - should have 2 suggestions for 2 different categories
        const savedEntities = suggestionRepository.save.mock.calls[0][0];
        expect(savedEntities).toHaveLength(2);
      });

      it('should exclude patterns with null categoryId', async () => {
        const mockPattern1 = createMockPattern({
          group: {
            ...createMockPattern().group,
            id: 'p1',
            categoryId: null,
            categoryName: null,
          },
        });
        const mockPattern2 = createMockPattern({
          group: {
            ...createMockPattern().group,
            id: 'p2',
            categoryId: 1,
            categoryName: 'Entertainment',
          },
        });

        const mockClassifications = [
          createMockClassification('p1'),
          createMockClassification('p2'),
        ];

        suggestionRepository.find.mockResolvedValue([]);
        patternDetectionService.detectPatterns.mockResolvedValue([
          mockPattern1,
          mockPattern2,
        ]);
        patternClassificationService.classifyPatterns.mockResolvedValue({
          classifications: mockClassifications,
          tokensUsed: 100,
          estimatedCost: 0.002,
          processingTimeMs: 500,
        });
        expensePlanRepository.find.mockResolvedValue([]);
        suggestionRepository.save.mockImplementation((entities) =>
          Promise.resolve(
            entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
          ),
        );

        // Act
        const result = await service.generateSuggestions(mockUserId);

        // Assert - should have 1 suggestion (pattern with null category excluded)
        const savedEntities = suggestionRepository.save.mock.calls[0][0];
        expect(savedEntities).toHaveLength(1);
        expect(savedEntities[0].categoryId).toBe(1);
      });

      it('should preserve merchant list in metadata', async () => {
        const mockPattern1 = createMockPattern({
          group: {
            ...createMockPattern().group,
            id: 'p1',
            categoryId: 1,
            merchantName: 'Netflix',
          },
        });
        const mockPattern2 = createMockPattern({
          group: {
            ...createMockPattern().group,
            id: 'p2',
            categoryId: 1,
            merchantName: 'Disney+',
          },
        });

        const mockClassifications = [
          createMockClassification('p1'),
          createMockClassification('p2'),
        ];

        suggestionRepository.find.mockResolvedValue([]);
        patternDetectionService.detectPatterns.mockResolvedValue([
          mockPattern1,
          mockPattern2,
        ]);
        patternClassificationService.classifyPatterns.mockResolvedValue({
          classifications: mockClassifications,
          tokensUsed: 100,
          estimatedCost: 0.002,
          processingTimeMs: 500,
        });
        expensePlanRepository.find.mockResolvedValue([]);
        suggestionRepository.save.mockImplementation((entities) =>
          Promise.resolve(
            entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
          ),
        );

        // Act
        await service.generateSuggestions(mockUserId);

        // Assert
        const savedEntities = suggestionRepository.save.mock.calls[0][0];
        expect(savedEntities[0].metadata.merchants).toContain('Netflix');
        expect(savedEntities[0].metadata.merchants).toContain('Disney+');
      });

      it('should set isEssential to true if ANY pattern is essential', async () => {
        const mockPattern1 = createMockPattern({
          group: { ...createMockPattern().group, id: 'p1', categoryId: 1 },
        });
        const mockPattern2 = createMockPattern({
          group: { ...createMockPattern().group, id: 'p2', categoryId: 1 },
        });

        const mockClassifications = [
          { ...createMockClassification('p1'), isEssential: false },
          { ...createMockClassification('p2'), isEssential: true }, // One is essential
        ];

        suggestionRepository.find.mockResolvedValue([]);
        patternDetectionService.detectPatterns.mockResolvedValue([
          mockPattern1,
          mockPattern2,
        ]);
        patternClassificationService.classifyPatterns.mockResolvedValue({
          classifications: mockClassifications,
          tokensUsed: 100,
          estimatedCost: 0.002,
          processingTimeMs: 500,
        });
        expensePlanRepository.find.mockResolvedValue([]);
        suggestionRepository.save.mockImplementation((entities) =>
          Promise.resolve(
            entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
          ),
        );

        // Act
        await service.generateSuggestions(mockUserId);

        // Assert
        const savedEntities = suggestionRepository.save.mock.calls[0][0];
        expect(savedEntities[0].isEssential).toBe(true);
      });
    });

    describe('filterExistingSuggestions with category dedup', () => {
      it('should filter out suggestions for categories with existing plans', async () => {
        const mockPattern = createMockPattern({
          group: {
            ...createMockPattern().group,
            id: 'p1',
            categoryId: 5,
            categoryName: 'Entertainment',
          },
        });

        suggestionRepository.find.mockResolvedValue([]);
        suggestionRepository.delete.mockResolvedValue({ affected: 0 });
        patternDetectionService.detectPatterns.mockResolvedValue([mockPattern]);
        patternClassificationService.classifyPatterns.mockResolvedValue({
          classifications: [createMockClassification('p1')],
          tokensUsed: 50,
          estimatedCost: 0.001,
          processingTimeMs: 200,
        });
        // Existing plan for same category
        expensePlanRepository.find.mockResolvedValue([
          { name: 'My Entertainment', categoryId: 5 },
        ]);
        suggestionRepository.save.mockResolvedValue([]);

        // Act
        const result = await service.generateSuggestions(mockUserId);

        // Assert - should have 0 new suggestions (filtered out)
        expect(result.newSuggestions).toBe(0);
      });

      it('should filter out suggestions for categories with pending suggestions', async () => {
        const mockPattern = createMockPattern({
          group: {
            ...createMockPattern().group,
            id: 'p1',
            categoryId: 5,
            categoryName: 'Entertainment',
          },
        });

        // First call returns empty (no recent), second call returns existing pending
        suggestionRepository.find
          .mockResolvedValueOnce([]) // getRecentPendingSuggestions
          .mockResolvedValueOnce([{ id: 99, categoryId: 5, status: 'pending' }]) // filterExistingSuggestions
          .mockResolvedValueOnce([]); // getPendingSuggestions
        suggestionRepository.delete.mockResolvedValue({ affected: 0 });

        patternDetectionService.detectPatterns.mockResolvedValue([mockPattern]);
        patternClassificationService.classifyPatterns.mockResolvedValue({
          classifications: [createMockClassification('p1')],
          tokensUsed: 50,
          estimatedCost: 0.001,
          processingTimeMs: 200,
        });
        expensePlanRepository.find.mockResolvedValue([]);
        suggestionRepository.save.mockResolvedValue([]);

        // Act
        const result = await service.generateSuggestions(mockUserId);

        // Assert - should have 0 new suggestions (filtered out)
        expect(result.newSuggestions).toBe(0);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // CLEAR PENDING SUGGESTIONS TESTS (Refresh Feature)
  // ─────────────────────────────────────────────────────────────

  describe('clearPendingSuggestions', () => {
    it('should delete all pending suggestions for a user', async () => {
      // Arrange
      suggestionRepository.delete.mockResolvedValue({ affected: 5 });

      // Act
      const result = await service.clearPendingSuggestions(mockUserId);

      // Assert
      expect(suggestionRepository.delete).toHaveBeenCalledWith({
        userId: mockUserId,
        status: 'pending',
      });
      expect(result).toBe(5);
    });

    it('should return 0 when no pending suggestions exist', async () => {
      // Arrange
      suggestionRepository.delete.mockResolvedValue({ affected: 0 });

      // Act
      const result = await service.clearPendingSuggestions(mockUserId);

      // Assert
      expect(result).toBe(0);
    });

    it('should NOT delete approved suggestions', async () => {
      // Arrange
      suggestionRepository.delete.mockResolvedValue({ affected: 3 });

      // Act
      await service.clearPendingSuggestions(mockUserId);

      // Assert - verify only 'pending' status is targeted
      expect(suggestionRepository.delete).toHaveBeenCalledWith({
        userId: mockUserId,
        status: 'pending',
      });
      expect(suggestionRepository.delete).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approved' }),
      );
    });

    it('should NOT delete rejected suggestions', async () => {
      // Arrange
      suggestionRepository.delete.mockResolvedValue({ affected: 3 });

      // Act
      await service.clearPendingSuggestions(mockUserId);

      // Assert - verify only 'pending' status is targeted
      expect(suggestionRepository.delete).toHaveBeenCalledWith({
        userId: mockUserId,
        status: 'pending',
      });
      expect(suggestionRepository.delete).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected' }),
      );
    });
  });

  describe('generateSuggestions with clear pending', () => {
    it('should clear pending suggestions before generating new ones', async () => {
      // Arrange
      suggestionRepository.delete.mockResolvedValue({ affected: 5 });
      suggestionRepository.find.mockResolvedValue([]);
      patternDetectionService.detectPatterns.mockResolvedValue([]);

      // Act
      await service.generateSuggestions(mockUserId, { forceRegenerate: true });

      // Assert - delete should be called with pending status
      expect(suggestionRepository.delete).toHaveBeenCalledWith({
        userId: mockUserId,
        status: 'pending',
      });
    });

    it('should include clearedCount in response', async () => {
      // Arrange
      suggestionRepository.delete.mockResolvedValue({ affected: 7 });
      suggestionRepository.find.mockResolvedValue([]);
      patternDetectionService.detectPatterns.mockResolvedValue([]);

      // Act
      const result = await service.generateSuggestions(mockUserId, {
        forceRegenerate: true,
      });

      // Assert
      expect(result.clearedCount).toBe(7);
    });

    it('should return clearedCount of 0 when no pending suggestions existed', async () => {
      // Arrange
      suggestionRepository.delete.mockResolvedValue({ affected: 0 });
      suggestionRepository.find.mockResolvedValue([]);
      patternDetectionService.detectPatterns.mockResolvedValue([]);

      // Act
      const result = await service.generateSuggestions(mockUserId, {
        forceRegenerate: true,
      });

      // Assert
      expect(result.clearedCount).toBe(0);
    });

    it('should clear pending even when returning cached suggestions', async () => {
      // Arrange - existing suggestions within 24h window
      const existingSuggestion = {
        id: 1,
        userId: mockUserId,
        suggestedName: 'Netflix',
        status: 'pending',
        expenseType: ExpenseType.SUBSCRIPTION,
        overallConfidence: 85,
        createdAt: new Date(),
      };
      suggestionRepository.delete.mockResolvedValue({ affected: 0 });
      suggestionRepository.find.mockResolvedValue([existingSuggestion]);

      // Act - NOT forcing regeneration, should return cached
      const result = await service.generateSuggestions(mockUserId, {
        forceRegenerate: false,
      });

      // Assert - clearedCount should still be in response
      expect(result.clearedCount).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // DELETE SUGGESTION TESTS
  // ─────────────────────────────────────────────────────────────

  describe('deleteSuggestion', () => {
    it('should delete a suggestion and return true', async () => {
      // Arrange
      suggestionRepository.delete.mockResolvedValue({ affected: 1 });

      // Act
      const result = await service.deleteSuggestion(mockUserId, 123);

      // Assert
      expect(result).toBe(true);
      expect(suggestionRepository.delete).toHaveBeenCalledWith({
        id: 123,
        userId: mockUserId,
      });
    });

    it('should return false when suggestion not found', async () => {
      // Arrange
      suggestionRepository.delete.mockResolvedValue({ affected: 0 });

      // Act
      const result = await service.deleteSuggestion(mockUserId, 999);

      // Assert
      expect(result).toBe(false);
    });

    it('should not delete suggestions from other users', async () => {
      // Arrange
      suggestionRepository.delete.mockResolvedValue({ affected: 0 });

      // Act
      const result = await service.deleteSuggestion(999, 123); // Different user

      // Assert
      expect(result).toBe(false);
      expect(suggestionRepository.delete).toHaveBeenCalledWith({
        id: 123,
        userId: 999,
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // RESET SUGGESTION FOR DELETED EXPENSE PLAN TESTS
  // ─────────────────────────────────────────────────────────────

  describe('resetSuggestionForDeletedExpensePlan', () => {
    it('should reset suggestion to pending when linked expense plan is deleted', async () => {
      // Arrange
      suggestionRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      const result = await service.resetSuggestionForDeletedExpensePlan(
        mockUserId,
        456,
      );

      // Assert
      expect(result).toBe(true);
      expect(suggestionRepository.update).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          approvedExpensePlanId: 456,
        },
        {
          status: 'pending',
          approvedExpensePlanId: null,
          reviewedAt: null,
        },
      );
    });

    it('should return false when no suggestion found for expense plan', async () => {
      // Arrange
      suggestionRepository.update.mockResolvedValue({ affected: 0 });

      // Act
      const result = await service.resetSuggestionForDeletedExpensePlan(
        mockUserId,
        999,
      );

      // Assert
      expect(result).toBe(false);
    });

    it('should not reset suggestions from other users', async () => {
      // Arrange
      suggestionRepository.update.mockResolvedValue({ affected: 0 });

      // Act
      const result = await service.resetSuggestionForDeletedExpensePlan(
        999,
        456,
      );

      // Assert
      expect(result).toBe(false);
      expect(suggestionRepository.update).toHaveBeenCalledWith(
        {
          userId: 999,
          approvedExpensePlanId: 456,
        },
        expect.any(Object),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // USE MONTHLY AVERAGE ONLY FLAG TESTS (Category Skip Pattern Detection)
  // ─────────────────────────────────────────────────────────────

  describe('useMonthlyAverageOnly flag', () => {
    it('should skip pattern detection for categories with useMonthlyAverageOnly flag', async () => {
      // Arrange - Groceries category with flag, 3 merchant patterns
      const groceriesCategoryId = 10;

      const mockPatternConad = createMockPattern({
        group: {
          ...createMockPattern().group,
          id: 'pattern-conad',
          categoryId: groceriesCategoryId,
          categoryName: 'Groceries',
          merchantName: 'Conad',
        },
      });
      const mockPatternEsselunga = createMockPattern({
        group: {
          ...createMockPattern().group,
          id: 'pattern-esselunga',
          categoryId: groceriesCategoryId,
          categoryName: 'Groceries',
          merchantName: 'Esselunga',
        },
      });
      const mockPatternNetflix = createMockPattern({
        group: {
          ...createMockPattern().group,
          id: 'pattern-netflix',
          categoryId: 5,
          categoryName: 'Entertainment',
          merchantName: 'Netflix',
        },
      });

      // Category with flag set
      categoryRepository.find.mockResolvedValue([{ id: groceriesCategoryId }]);

      // Fallback for groceries
      const groceriesFallback = {
        categoryId: groceriesCategoryId,
        categoryName: 'Groceries',
        monthlyAverage: 350,
        totalSpent: 4200,
        transactionCount: 48,
        firstOccurrence: new Date('2025-01-01'),
        lastOccurrence: new Date('2025-12-31'),
        suggestedPurpose: 'spending_budget' as const,
        reason: 'no_pattern_detected' as const,
      };
      categoryFallbackService.generateFallbackSuggestions.mockResolvedValue([
        groceriesFallback,
      ]);

      suggestionRepository.find.mockResolvedValue([]);
      suggestionRepository.delete.mockResolvedValue({ affected: 0 });
      patternDetectionService.detectPatterns.mockResolvedValue([
        mockPatternConad,
        mockPatternEsselunga,
        mockPatternNetflix,
      ]);
      patternClassificationService.classifyPatterns.mockResolvedValue({
        classifications: [createMockClassification('pattern-netflix')],
        tokensUsed: 50,
        estimatedCost: 0.001,
        processingTimeMs: 200,
      });
      expensePlanRepository.find.mockResolvedValue([]);
      suggestionRepository.save.mockImplementation((entities) =>
        Promise.resolve(
          entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
        ),
      );

      // Act
      const result = await service.generateSuggestions(mockUserId);

      // Assert
      // classifyPatterns should only be called with Netflix pattern (not Groceries patterns)
      expect(
        patternClassificationService.classifyPatterns,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          patterns: expect.arrayContaining([
            expect.objectContaining({ patternId: 'pattern-netflix' }),
          ]),
        }),
      );
      // Groceries patterns should NOT be in the classification request
      const classificationCall =
        patternClassificationService.classifyPatterns.mock.calls[0][0];
      expect(classificationCall.patterns).toHaveLength(1);
      expect(classificationCall.patterns[0].patternId).toBe('pattern-netflix');
    });

    it('should include skipped categories in fallback suggestions', async () => {
      // Arrange - Groceries category with flag
      const groceriesCategoryId = 10;

      const mockPatternConad = createMockPattern({
        group: {
          ...createMockPattern().group,
          id: 'pattern-conad',
          categoryId: groceriesCategoryId,
          categoryName: 'Groceries',
          merchantName: 'Conad',
        },
      });

      // Category with flag set
      categoryRepository.find.mockResolvedValue([{ id: groceriesCategoryId }]);

      // Fallback for groceries
      const groceriesFallback = {
        categoryId: groceriesCategoryId,
        categoryName: 'Groceries',
        monthlyAverage: 350,
        totalSpent: 4200,
        transactionCount: 48,
        firstOccurrence: new Date('2025-01-01'),
        lastOccurrence: new Date('2025-12-31'),
        suggestedPurpose: 'spending_budget' as const,
        reason: 'no_pattern_detected' as const,
      };
      categoryFallbackService.generateFallbackSuggestions.mockResolvedValue([
        groceriesFallback,
      ]);

      suggestionRepository.find.mockResolvedValue([]);
      suggestionRepository.delete.mockResolvedValue({ affected: 0 });
      patternDetectionService.detectPatterns.mockResolvedValue([
        mockPatternConad,
      ]);
      // No patterns to classify since all are skipped
      patternClassificationService.classifyPatterns.mockResolvedValue({
        classifications: [],
        tokensUsed: 0,
        estimatedCost: 0,
        processingTimeMs: 0,
      });
      expensePlanRepository.find.mockResolvedValue([]);
      suggestionRepository.save.mockImplementation((entities) =>
        Promise.resolve(
          entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
        ),
      );

      // Act
      await service.generateSuggestions(mockUserId);

      // Assert - Groceries fallback should be included even though pattern was detected
      const savedEntities = suggestionRepository.save.mock.calls[0][0];
      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0].categoryId).toBe(groceriesCategoryId);
      expect(savedEntities[0].suggestionSource).toBe('category_average');
      expect(savedEntities[0].monthlyContribution).toBe(350);
    });

    it('should not call classifyPatterns when all patterns are skipped', async () => {
      // Arrange - All patterns belong to skip categories
      const groceriesCategoryId = 10;

      const mockPatternConad = createMockPattern({
        group: {
          ...createMockPattern().group,
          id: 'pattern-conad',
          categoryId: groceriesCategoryId,
          categoryName: 'Groceries',
          merchantName: 'Conad',
        },
      });

      // Category with flag set
      categoryRepository.find.mockResolvedValue([{ id: groceriesCategoryId }]);

      categoryFallbackService.generateFallbackSuggestions.mockResolvedValue([]);

      suggestionRepository.find.mockResolvedValue([]);
      suggestionRepository.delete.mockResolvedValue({ affected: 0 });
      patternDetectionService.detectPatterns.mockResolvedValue([
        mockPatternConad,
      ]);
      expensePlanRepository.find.mockResolvedValue([]);
      suggestionRepository.save.mockResolvedValue([]);

      // Act
      await service.generateSuggestions(mockUserId);

      // Assert - classifyPatterns should not be called when no patterns remain
      expect(
        patternClassificationService.classifyPatterns,
      ).not.toHaveBeenCalled();
    });

    it('should save AI tokens by not classifying skipped patterns', async () => {
      // Arrange - 5 Grocery patterns (skipped) + 1 Netflix pattern (processed)
      const groceriesCategoryId = 10;

      const groceryPatterns = [
        'Conad',
        'Esselunga',
        'Lidl',
        'Coop',
        'Carrefour',
      ].map((merchant) =>
        createMockPattern({
          group: {
            ...createMockPattern().group,
            id: `pattern-${merchant.toLowerCase()}`,
            categoryId: groceriesCategoryId,
            categoryName: 'Groceries',
            merchantName: merchant,
          },
        }),
      );

      const netflixPattern = createMockPattern({
        group: {
          ...createMockPattern().group,
          id: 'pattern-netflix',
          categoryId: 5,
          categoryName: 'Entertainment',
          merchantName: 'Netflix',
        },
      });

      // Category with flag set for Groceries
      categoryRepository.find.mockResolvedValue([{ id: groceriesCategoryId }]);

      categoryFallbackService.generateFallbackSuggestions.mockResolvedValue([]);

      suggestionRepository.find.mockResolvedValue([]);
      suggestionRepository.delete.mockResolvedValue({ affected: 0 });
      patternDetectionService.detectPatterns.mockResolvedValue([
        ...groceryPatterns,
        netflixPattern,
      ]);
      patternClassificationService.classifyPatterns.mockResolvedValue({
        classifications: [createMockClassification('pattern-netflix')],
        tokensUsed: 50, // Only 1 pattern classified instead of 6
        estimatedCost: 0.001,
        processingTimeMs: 100,
      });
      expensePlanRepository.find.mockResolvedValue([]);
      suggestionRepository.save.mockImplementation((entities) =>
        Promise.resolve(
          entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
        ),
      );

      // Act
      await service.generateSuggestions(mockUserId);

      // Assert - Only 1 pattern should be classified (saving tokens)
      expect(
        patternClassificationService.classifyPatterns,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          patterns: expect.any(Array),
        }),
      );
      const classificationCall =
        patternClassificationService.classifyPatterns.mock.calls[0][0];
      expect(classificationCall.patterns).toHaveLength(1);
      expect(classificationCall.patterns[0].patternId).toBe('pattern-netflix');
    });

    it('should handle categories without the flag normally', async () => {
      // Arrange - No categories with flag
      categoryRepository.find.mockResolvedValue([]);

      const mockPattern = createMockPattern();
      const mockClassification = createMockClassification('pattern-1');

      categoryFallbackService.generateFallbackSuggestions.mockResolvedValue([]);

      suggestionRepository.find.mockResolvedValue([]);
      suggestionRepository.delete.mockResolvedValue({ affected: 0 });
      patternDetectionService.detectPatterns.mockResolvedValue([mockPattern]);
      patternClassificationService.classifyPatterns.mockResolvedValue({
        classifications: [mockClassification],
        tokensUsed: 100,
        estimatedCost: 0.002,
        processingTimeMs: 500,
      });
      expensePlanRepository.find.mockResolvedValue([]);
      suggestionRepository.save.mockImplementation((entities) =>
        Promise.resolve(
          entities.map((e: any, i: number) => ({ ...e, id: i + 1 })),
        ),
      );

      // Act
      await service.generateSuggestions(mockUserId);

      // Assert - Pattern should be processed normally
      expect(patternClassificationService.classifyPatterns).toHaveBeenCalled();
      const classificationCall =
        patternClassificationService.classifyPatterns.mock.calls[0][0];
      expect(classificationCall.patterns).toHaveLength(1);
    });
  });
});
