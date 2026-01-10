import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ExpensePlanSuggestionsController } from './expense-plan-suggestions.controller';
import { SuggestionGeneratorService } from '../services/suggestion-generator.service';
import { PatternClassificationService } from '../services/pattern-classification.service';
import { ExpenseType } from '../interfaces/classification.interface';
import { FrequencyType } from '../interfaces/frequency.interface';

describe('ExpensePlanSuggestionsController', () => {
  let controller: ExpensePlanSuggestionsController;
  let module: TestingModule;
  let suggestionGeneratorService: jest.Mocked<SuggestionGeneratorService>;
  let patternClassificationService: jest.Mocked<PatternClassificationService>;

  const mockUser = { id: 1, auth0Id: 'auth0|123456' };

  const mockSuggestionResponse = {
    id: 1,
    suggestedName: 'Netflix Subscription',
    description: 'Monthly Netflix streaming service',
    merchantName: 'Netflix',
    representativeDescription: 'NETFLIX.COM',
    categoryId: 1,
    categoryName: 'Entertainment',
    averageAmount: 15.99,
    monthlyContribution: 15.99,
    yearlyTotal: 191.88,
    expenseType: ExpenseType.SUBSCRIPTION,
    isEssential: false,
    frequencyType: FrequencyType.MONTHLY,
    intervalDays: 30,
    patternConfidence: 90,
    classificationConfidence: 85,
    overallConfidence: 88,
    classificationReasoning: 'Streaming subscription service',
    occurrenceCount: 6,
    firstOccurrence: new Date('2024-01-15'),
    lastOccurrence: new Date('2024-06-15'),
    nextExpectedDate: new Date('2024-07-15'),
    status: 'pending' as const,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      controllers: [ExpensePlanSuggestionsController],
      providers: [
        {
          provide: SuggestionGeneratorService,
          useValue: {
            generateSuggestions: jest.fn(),
            getSuggestions: jest.fn(),
            getSuggestionById: jest.fn(),
            approveSuggestion: jest.fn(),
            rejectSuggestion: jest.fn(),
            bulkApprove: jest.fn(),
            bulkReject: jest.fn(),
          },
        },
        {
          provide: PatternClassificationService,
          useValue: {
            getApiUsageStats: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ExpensePlanSuggestionsController>(
      ExpensePlanSuggestionsController,
    );
    suggestionGeneratorService = module.get(SuggestionGeneratorService);
    patternClassificationService = module.get(PatternClassificationService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('generateSuggestions', () => {
    it('should generate suggestions and return response', async () => {
      // Arrange
      const mockResponse = {
        suggestions: [mockSuggestionResponse],
        totalFound: 1,
        newSuggestions: 1,
        existingSuggestions: 0,
        processingTimeMs: 500,
        summary: {
          byExpenseType: { subscription: 1 },
          totalMonthlyContribution: 15.99,
          essentialCount: 0,
          discretionaryCount: 1,
        },
      };
      suggestionGeneratorService.generateSuggestions.mockResolvedValue(
        mockResponse,
      );

      // Act
      const result = await controller.generateSuggestions({}, mockUser);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(
        suggestionGeneratorService.generateSuggestions,
      ).toHaveBeenCalledWith(mockUser.id, {});
    });

    it('should pass generation options to service', async () => {
      // Arrange
      const dto = {
        monthsToAnalyze: 24,
        minOccurrences: 3,
        minConfidence: 70,
        forceRegenerate: true,
      };
      suggestionGeneratorService.generateSuggestions.mockResolvedValue({
        suggestions: [],
        totalFound: 0,
        newSuggestions: 0,
        existingSuggestions: 0,
        processingTimeMs: 100,
        summary: {
          byExpenseType: {},
          totalMonthlyContribution: 0,
          essentialCount: 0,
          discretionaryCount: 0,
        },
      });

      // Act
      await controller.generateSuggestions(dto, mockUser);

      // Assert
      expect(
        suggestionGeneratorService.generateSuggestions,
      ).toHaveBeenCalledWith(mockUser.id, dto);
    });
  });

  describe('getSuggestions', () => {
    it('should return all suggestions for user', async () => {
      // Arrange
      const mockResponse = {
        suggestions: [mockSuggestionResponse],
        total: 1,
        pending: 1,
        approved: 0,
        rejected: 0,
      };
      suggestionGeneratorService.getSuggestions.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.getSuggestions(mockUser);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(suggestionGeneratorService.getSuggestions).toHaveBeenCalledWith(
        mockUser.id,
        undefined,
      );
    });

    it('should filter by status when provided', async () => {
      // Arrange
      suggestionGeneratorService.getSuggestions.mockResolvedValue({
        suggestions: [],
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      });

      // Act
      await controller.getSuggestions(mockUser, 'pending');

      // Assert
      expect(suggestionGeneratorService.getSuggestions).toHaveBeenCalledWith(
        mockUser.id,
        'pending',
      );
    });
  });

  describe('getPendingSuggestions', () => {
    it('should return only pending suggestions', async () => {
      // Arrange
      const mockResponse = {
        suggestions: [mockSuggestionResponse],
        total: 1,
        pending: 1,
        approved: 0,
        rejected: 0,
      };
      suggestionGeneratorService.getSuggestions.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.getPendingSuggestions(mockUser);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(suggestionGeneratorService.getSuggestions).toHaveBeenCalledWith(
        mockUser.id,
        'pending',
      );
    });
  });

  describe('getApiUsage', () => {
    it('should return API usage statistics', async () => {
      // Arrange
      const mockStats = {
        dailyApiCalls: 10,
        maxDailyApiCalls: 100,
        remainingCalls: 90,
        cacheSize: 5,
      };
      patternClassificationService.getApiUsageStats.mockReturnValue(mockStats);

      // Act
      const result = await controller.getApiUsage();

      // Assert
      expect(result).toEqual(mockStats);
      expect(patternClassificationService.getApiUsageStats).toHaveBeenCalled();
    });
  });

  describe('getSuggestion', () => {
    it('should return a specific suggestion', async () => {
      // Arrange
      suggestionGeneratorService.getSuggestionById.mockResolvedValue(
        mockSuggestionResponse,
      );

      // Act
      const result = await controller.getSuggestion(1, mockUser);

      // Assert
      expect(result).toEqual(mockSuggestionResponse);
      expect(suggestionGeneratorService.getSuggestionById).toHaveBeenCalledWith(
        mockUser.id,
        1,
      );
    });

    it('should throw NotFoundException when suggestion not found', async () => {
      // Arrange
      suggestionGeneratorService.getSuggestionById.mockResolvedValue(null);

      // Act & Assert
      await expect(controller.getSuggestion(999, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('approveSuggestion', () => {
    it('should approve a suggestion', async () => {
      // Arrange
      const mockResult = {
        success: true,
        suggestionId: 1,
        expensePlanId: 10,
        message: 'Expense plan created successfully',
      };
      suggestionGeneratorService.approveSuggestion.mockResolvedValue(
        mockResult,
      );

      // Act
      const result = await controller.approveSuggestion(1, {}, mockUser);

      // Assert
      expect(result).toEqual(mockResult);
      expect(suggestionGeneratorService.approveSuggestion).toHaveBeenCalledWith(
        mockUser.id,
        1,
        {},
      );
    });

    it('should pass custom options to service', async () => {
      // Arrange
      const dto = {
        customName: 'My Netflix',
        customMonthlyContribution: 20,
        categoryId: 2,
      };
      suggestionGeneratorService.approveSuggestion.mockResolvedValue({
        success: true,
        suggestionId: 1,
        expensePlanId: 10,
      });

      // Act
      await controller.approveSuggestion(1, dto, mockUser);

      // Assert
      expect(suggestionGeneratorService.approveSuggestion).toHaveBeenCalledWith(
        mockUser.id,
        1,
        dto,
      );
    });
  });

  describe('rejectSuggestion', () => {
    it('should reject a suggestion', async () => {
      // Arrange
      const mockResult = {
        success: true,
        suggestionId: 1,
        message: 'Suggestion rejected',
      };
      suggestionGeneratorService.rejectSuggestion.mockResolvedValue(mockResult);

      // Act
      const result = await controller.rejectSuggestion(1, {}, mockUser);

      // Assert
      expect(result).toEqual(mockResult);
      expect(suggestionGeneratorService.rejectSuggestion).toHaveBeenCalledWith(
        mockUser.id,
        1,
        {},
      );
    });

    it('should pass rejection reason to service', async () => {
      // Arrange
      const dto = { reason: 'Not relevant to me' };
      suggestionGeneratorService.rejectSuggestion.mockResolvedValue({
        success: true,
        suggestionId: 1,
      });

      // Act
      await controller.rejectSuggestion(1, dto, mockUser);

      // Assert
      expect(suggestionGeneratorService.rejectSuggestion).toHaveBeenCalledWith(
        mockUser.id,
        1,
        dto,
      );
    });
  });

  describe('bulkApprove', () => {
    it('should approve multiple suggestions', async () => {
      // Arrange
      const mockResult = {
        processed: 3,
        successful: 2,
        failed: 1,
        results: [
          { success: true, suggestionId: 1, expensePlanId: 10 },
          { success: true, suggestionId: 2, expensePlanId: 11 },
          { success: false, suggestionId: 3, message: 'Not found' },
        ],
      };
      suggestionGeneratorService.bulkApprove.mockResolvedValue(mockResult);

      // Act
      const result = await controller.bulkApprove(
        { suggestionIds: [1, 2, 3] },
        mockUser,
      );

      // Assert
      expect(result).toEqual(mockResult);
      expect(suggestionGeneratorService.bulkApprove).toHaveBeenCalledWith(
        mockUser.id,
        [1, 2, 3],
      );
    });
  });

  describe('bulkReject', () => {
    it('should reject multiple suggestions', async () => {
      // Arrange
      const mockResult = {
        processed: 2,
        successful: 2,
        failed: 0,
        results: [
          { success: true, suggestionId: 1 },
          { success: true, suggestionId: 2 },
        ],
      };
      suggestionGeneratorService.bulkReject.mockResolvedValue(mockResult);

      // Act
      const result = await controller.bulkReject(
        { suggestionIds: [1, 2] },
        mockUser,
      );

      // Assert
      expect(result).toEqual(mockResult);
      expect(suggestionGeneratorService.bulkReject).toHaveBeenCalledWith(
        mockUser.id,
        [1, 2],
      );
    });
  });
});
