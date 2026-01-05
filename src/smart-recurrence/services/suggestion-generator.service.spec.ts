import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SuggestionGeneratorService } from './suggestion-generator.service';
import { PatternDetectionService } from './pattern-detection.service';
import { PatternClassificationService } from './pattern-classification.service';
import { ExpensePlanSuggestion } from '../entities/expense-plan-suggestion.entity';
import { ExpensePlan } from '../../expense-plans/entities/expense-plan.entity';
import { RepositoryMockFactory } from '../../test/test-utils/repository-mocks';
import { ExpenseType } from '../interfaces/classification.interface';
import { FrequencyType } from '../interfaces/frequency.interface';
import { DetectedPatternData } from '../interfaces/pattern.interface';

describe('SuggestionGeneratorService', () => {
  let service: SuggestionGeneratorService;
  let module: TestingModule;
  let suggestionRepository: any;
  let expensePlanRepository: any;
  let patternDetectionService: jest.Mocked<PatternDetectionService>;
  let patternClassificationService: jest.Mocked<PatternClassificationService>;

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
        { id: 1, amount: -15.99, description: 'Netflix', transactionDate: new Date() } as any,
        { id: 2, amount: -15.99, description: 'Netflix', transactionDate: new Date() } as any,
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
      ],
    }).compile();

    service = module.get<SuggestionGeneratorService>(SuggestionGeneratorService);
    suggestionRepository = module.get(getRepositoryToken(ExpensePlanSuggestion));
    expensePlanRepository = module.get(getRepositoryToken(ExpensePlan));
    patternDetectionService = module.get(PatternDetectionService);
    patternClassificationService = module.get(PatternClassificationService);
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
        Promise.resolve(entities.map((e: any, i: number) => ({ ...e, id: i + 1 }))),
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
        Promise.resolve(entities.map((e: any, i: number) => ({ ...e, id: i + 1 }))),
      );

      // Act
      const result = await service.generateSuggestions(mockUserId, {
        forceRegenerate: true,
      });

      // Assert
      expect(patternDetectionService.detectPatterns).toHaveBeenCalled();
    });

    it('should return empty response when no patterns detected', async () => {
      // Arrange
      suggestionRepository.find.mockResolvedValue([]);
      patternDetectionService.detectPatterns.mockResolvedValue([]);

      // Act
      const result = await service.generateSuggestions(mockUserId);

      // Assert
      expect(result.totalFound).toBe(0);
      expect(result.newSuggestions).toBe(0);
      expect(patternClassificationService.classifyPatterns).not.toHaveBeenCalled();
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

    it('should calculate overall confidence as weighted average', async () => {
      // Arrange
      const mockPatterns = [createMockPattern()];
      const mockClassifications = [{
        ...createMockClassification('pattern-1'),
        confidence: 80, // Classification confidence
      }];

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
        // Verify overall confidence calculation: pattern * 0.6 + classification * 0.4
        // 92 * 0.6 + 80 * 0.4 = 55.2 + 32 = 87.2 ≈ 87
        const entity = entities[0];
        expect(entity.overallConfidence).toBe(87);
        return Promise.resolve(entities.map((e: any, i: number) => ({ ...e, id: i + 1 })));
      });

      // Act
      await service.generateSuggestions(mockUserId);
    });
  });

  describe('getSuggestions', () => {
    it('should return all suggestions for user', async () => {
      // Arrange
      const mockSuggestions = [
        { id: 1, suggestedName: 'Netflix', status: 'pending', overallConfidence: 85 },
        { id: 2, suggestedName: 'Spotify', status: 'approved', overallConfidence: 80 },
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
      expensePlanRepository.save.mockResolvedValue({ ...mockSuggestion, id: 10 });
      suggestionRepository.save.mockResolvedValue({ ...mockSuggestion, status: 'approved' });

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
      suggestionRepository.save.mockResolvedValue({ ...mockSuggestion, status: 'approved' });

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
        { expenseType: ExpenseType.SUBSCRIPTION, expectedPlanType: 'fixed_monthly' },
        { expenseType: ExpenseType.UTILITY, expectedPlanType: 'fixed_monthly' },
        { expenseType: ExpenseType.INSURANCE, expectedPlanType: 'yearly_fixed' },
        { expenseType: ExpenseType.TAX, expectedPlanType: 'yearly_fixed' },
        { expenseType: ExpenseType.VARIABLE, expectedPlanType: 'yearly_variable' },
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
        suggestionRepository.save.mockResolvedValue({ ...mockSuggestion, status: 'approved' });

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
      suggestionRepository.save.mockResolvedValue({ ...mockSuggestion, status: 'approved' });

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
      suggestionRepository.save.mockResolvedValue({ ...mockSuggestion, status: 'rejected' });

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
      suggestionRepository.save.mockResolvedValue({ ...mockSuggestion, status: 'rejected' });

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
      const mockSuggestion1 = { id: 1, userId: mockUserId, status: 'pending', expenseType: ExpenseType.SUBSCRIPTION };
      const mockSuggestion2 = { id: 2, userId: mockUserId, status: 'pending', expenseType: ExpenseType.UTILITY };

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
      const mockSuggestion2 = { id: 2, userId: mockUserId, status: 'pending', expenseType: ExpenseType.SUBSCRIPTION };

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
});
