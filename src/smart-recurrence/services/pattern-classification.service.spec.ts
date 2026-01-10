import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PatternClassificationService } from './pattern-classification.service';
import {
  PatternClassificationRequest,
  ExpenseType,
} from '../interfaces/classification.interface';
import { FrequencyType } from '../interfaces/frequency.interface';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('PatternClassificationService', () => {
  let service: PatternClassificationService;
  let module: TestingModule;
  let configService: ConfigService;

  const createPattern = (
    overrides: Partial<PatternClassificationRequest> = {},
  ): PatternClassificationRequest => ({
    patternId: 'test-pattern-1',
    merchantName: 'Netflix',
    categoryName: 'Entertainment',
    representativeDescription: 'Netflix monthly subscription',
    averageAmount: 15.99,
    frequencyType: FrequencyType.MONTHLY,
    occurrenceCount: 6,
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        PatternClassificationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key: string, defaultValue?: any) => {
                const config: Record<string, any> = {
                  OPENAI_API_KEY: 'test-api-key',
                  OPENAI_MODEL: 'gpt-3.5-turbo',
                  OPENAI_BASE_URL: 'https://api.openai.com/v1',
                };
                return config[key] ?? defaultValue;
              }),
          },
        },
      ],
    }).compile();

    service = module.get<PatternClassificationService>(
      PatternClassificationService,
    );
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    service.clearCache();
    await module.close();
  });

  describe('classifyWithRules', () => {
    it('should classify Netflix as subscription', () => {
      // Arrange
      const pattern = createPattern({
        merchantName: 'Netflix',
        representativeDescription: 'Netflix subscription',
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert
      expect(result.expenseType).toBe(ExpenseType.SUBSCRIPTION);
      expect(result.isEssential).toBe(false);
      expect(result.suggestedPlanName).toContain('Netflix');
      expect(result.confidence).toBeGreaterThanOrEqual(80);
    });

    it('should classify Spotify as subscription', () => {
      // Arrange
      const pattern = createPattern({
        merchantName: 'Spotify AB',
        representativeDescription: 'Spotify Premium',
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert
      expect(result.expenseType).toBe(ExpenseType.SUBSCRIPTION);
      expect(result.isEssential).toBe(false);
    });

    it('should classify electricity bill as utility', () => {
      // Arrange
      const pattern = createPattern({
        merchantName: 'ENEL Energia',
        categoryName: 'Utilities',
        representativeDescription: 'Bolletta luce',
        averageAmount: 85.0,
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert
      expect(result.expenseType).toBe(ExpenseType.UTILITY);
      expect(result.isEssential).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(85);
    });

    it('should classify insurance as essential', () => {
      // Arrange
      const pattern = createPattern({
        merchantName: 'Allianz',
        representativeDescription: 'Polizza assicurazione auto',
        averageAmount: 600,
        frequencyType: FrequencyType.SEMIANNUAL,
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert
      expect(result.expenseType).toBe(ExpenseType.INSURANCE);
      expect(result.isEssential).toBe(true);
    });

    it('should classify mortgage payment correctly', () => {
      // Arrange
      const pattern = createPattern({
        merchantName: 'Banca Intesa',
        representativeDescription: 'Rata mutuo casa',
        averageAmount: 850,
        frequencyType: FrequencyType.MONTHLY,
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert
      expect(result.expenseType).toBe(ExpenseType.MORTGAGE);
      expect(result.isEssential).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(90);
    });

    it('should classify rent payment correctly', () => {
      // Arrange
      const pattern = createPattern({
        merchantName: 'Landlord',
        representativeDescription: 'Affitto mensile',
        averageAmount: 1200,
        frequencyType: FrequencyType.MONTHLY,
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert
      expect(result.expenseType).toBe(ExpenseType.RENT);
      expect(result.isEssential).toBe(true);
    });

    it('should classify salary as income', () => {
      // Arrange
      const pattern = createPattern({
        merchantName: 'Employer Inc',
        representativeDescription: 'Stipendio mensile',
        averageAmount: 2500,
        frequencyType: FrequencyType.MONTHLY,
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert
      expect(result.expenseType).toBe(ExpenseType.SALARY);
      expect(result.isEssential).toBe(false); // Income is not an expense
    });

    it('should classify tax payments correctly', () => {
      // Arrange
      const pattern = createPattern({
        merchantName: 'Agenzia Entrate',
        representativeDescription: 'IMU tasse',
        averageAmount: 400,
        frequencyType: FrequencyType.SEMIANNUAL,
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert
      expect(result.expenseType).toBe(ExpenseType.TAX);
      expect(result.isEssential).toBe(true);
    });

    it('should default to OTHER_FIXED for unrecognized patterns', () => {
      // Arrange
      const pattern = createPattern({
        merchantName: 'Unknown Merchant',
        representativeDescription: 'Unknown service',
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert
      expect(result.expenseType).toBe(ExpenseType.OTHER_FIXED);
      expect(result.confidence).toBe(50);
    });
  });

  describe('calculateMonthlyContribution', () => {
    it('should calculate weekly to monthly correctly', () => {
      // Arrange
      const pattern = createPattern({
        averageAmount: 50,
        frequencyType: FrequencyType.WEEKLY,
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert - 50 * 4.33 = 216.5
      expect(result.monthlyContribution).toBeCloseTo(216.5, 0);
    });

    it('should calculate biweekly to monthly correctly', () => {
      // Arrange
      const pattern = createPattern({
        averageAmount: 100,
        frequencyType: FrequencyType.BIWEEKLY,
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert - 100 * 2.17 = 217
      expect(result.monthlyContribution).toBeCloseTo(217, 0);
    });

    it('should keep monthly amount unchanged', () => {
      // Arrange
      const pattern = createPattern({
        averageAmount: 50,
        frequencyType: FrequencyType.MONTHLY,
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert
      expect(result.monthlyContribution).toBe(50);
    });

    it('should calculate quarterly to monthly correctly', () => {
      // Arrange
      const pattern = createPattern({
        averageAmount: 300,
        frequencyType: FrequencyType.QUARTERLY,
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert - 300 / 3 = 100
      expect(result.monthlyContribution).toBe(100);
    });

    it('should calculate semiannual to monthly correctly', () => {
      // Arrange
      const pattern = createPattern({
        averageAmount: 600,
        frequencyType: FrequencyType.SEMIANNUAL,
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert - 600 / 6 = 100
      expect(result.monthlyContribution).toBe(100);
    });

    it('should calculate annual to monthly correctly', () => {
      // Arrange
      const pattern = createPattern({
        averageAmount: 1200,
        frequencyType: FrequencyType.ANNUAL,
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert - 1200 / 12 = 100
      expect(result.monthlyContribution).toBe(100);
    });
  });

  describe('classifyPatterns (batch)', () => {
    it('should use cache for repeated patterns', async () => {
      // Arrange
      const pattern = createPattern();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    patternId: pattern.patternId,
                    expenseType: ExpenseType.SUBSCRIPTION,
                    isEssential: false,
                    suggestedPlanName: 'Netflix Subscription',
                    monthlyContribution: 15.99,
                    confidence: 95,
                    reasoning: 'Streaming service subscription',
                  },
                ]),
              },
            },
          ],
          usage: { total_tokens: 100 },
        }),
      });

      // Act - first call
      const result1 = await service.classifyPatterns({
        patterns: [pattern],
        userId: 1,
      });

      // Act - second call (should use cache)
      const result2 = await service.classifyPatterns({
        patterns: [pattern],
        userId: 1,
      });

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only one API call
      expect(result1.classifications[0].expenseType).toBe(
        ExpenseType.SUBSCRIPTION,
      );
      expect(result2.classifications[0].expenseType).toBe(
        ExpenseType.SUBSCRIPTION,
      );
    });

    it('should batch multiple patterns in single API call', async () => {
      // Arrange
      const patterns = [
        createPattern({ patternId: 'p1', merchantName: 'Netflix' }),
        createPattern({ patternId: 'p2', merchantName: 'Spotify' }),
        createPattern({ patternId: 'p3', merchantName: 'Disney+' }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(
                  patterns.map((p) => ({
                    patternId: p.patternId,
                    expenseType: ExpenseType.SUBSCRIPTION,
                    isEssential: false,
                    suggestedPlanName: `${p.merchantName} Subscription`,
                    monthlyContribution: 15.99,
                    confidence: 90,
                    reasoning: 'Streaming service',
                  })),
                ),
              },
            },
          ],
          usage: { total_tokens: 300 },
        }),
      });

      // Act
      const result = await service.classifyPatterns({
        patterns,
        userId: 1,
      });

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.classifications).toHaveLength(3);
    });

    it('should fallback to rules when API fails', async () => {
      // Arrange
      const pattern = createPattern({ merchantName: 'Netflix' });
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      // Act
      const result = await service.classifyPatterns({
        patterns: [pattern],
        userId: 1,
      });

      // Assert
      expect(result.classifications).toHaveLength(1);
      expect(result.classifications[0].expenseType).toBe(
        ExpenseType.SUBSCRIPTION,
      );
      expect(result.classifications[0].reasoning).toBe(
        'Rule-based classification',
      );
    });

    it('should return cost metrics', async () => {
      // Arrange
      const pattern = createPattern();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    patternId: pattern.patternId,
                    expenseType: ExpenseType.SUBSCRIPTION,
                    isEssential: false,
                    suggestedPlanName: 'Test',
                    monthlyContribution: 15.99,
                    confidence: 90,
                    reasoning: 'Test',
                  },
                ]),
              },
            },
          ],
          usage: { total_tokens: 150 },
        }),
      });

      // Act
      const result = await service.classifyPatterns({
        patterns: [pattern],
        userId: 1,
      });

      // Assert
      expect(result.tokensUsed).toBe(150);
      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('API usage stats', () => {
    it('should track API calls', async () => {
      // Arrange
      const pattern = createPattern();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    patternId: pattern.patternId,
                    expenseType: ExpenseType.SUBSCRIPTION,
                    isEssential: false,
                    suggestedPlanName: 'Test',
                    monthlyContribution: 15.99,
                    confidence: 90,
                    reasoning: 'Test',
                  },
                ]),
              },
            },
          ],
          usage: { total_tokens: 100 },
        }),
      });

      // Act
      const statsBefore = service.getApiUsageStats();
      await service.classifyPatterns({ patterns: [pattern], userId: 1 });
      const statsAfter = service.getApiUsageStats();

      // Assert
      expect(statsAfter.dailyApiCalls).toBe(statsBefore.dailyApiCalls + 1);
    });

    it('should track cache size', () => {
      // Arrange & Act
      const pattern = createPattern();
      service.classifyWithRules(pattern); // Populate cache via classify

      // Assert
      const stats = service.getApiUsageStats();
      expect(stats.cacheSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cache management', () => {
    it('should clear cache when requested', async () => {
      // Arrange
      const pattern = createPattern();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    patternId: pattern.patternId,
                    expenseType: ExpenseType.SUBSCRIPTION,
                    isEssential: false,
                    suggestedPlanName: 'Test',
                    monthlyContribution: 15.99,
                    confidence: 90,
                    reasoning: 'Test',
                  },
                ]),
              },
            },
          ],
          usage: { total_tokens: 100 },
        }),
      });

      await service.classifyPatterns({ patterns: [pattern], userId: 1 });

      // Act
      service.clearCache();
      const stats = service.getApiUsageStats();

      // Assert
      expect(stats.cacheSize).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle null merchant name', () => {
      // Arrange
      const pattern = createPattern({
        merchantName: null,
        representativeDescription: 'Netflix subscription',
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert
      expect(result.expenseType).toBe(ExpenseType.SUBSCRIPTION);
      expect(result.suggestedPlanName).toBeDefined();
    });

    it('should handle empty patterns array', async () => {
      // Act
      const result = await service.classifyPatterns({
        patterns: [],
        userId: 1,
      });

      // Assert
      expect(result.classifications).toEqual([]);
      expect(result.tokensUsed).toBe(0);
    });

    it('should handle negative amounts (expenses)', () => {
      // Arrange
      const pattern = createPattern({
        averageAmount: -50,
        frequencyType: FrequencyType.MONTHLY,
      });

      // Act
      const result = service.classifyWithRules(pattern);

      // Assert
      expect(result.monthlyContribution).toBe(50); // Absolute value
    });
  });
});

describe('PatternClassificationService (no API key)', () => {
  let service: PatternClassificationService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        PatternClassificationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key: string, defaultValue?: any) => {
                const config: Record<string, any> = {
                  OPENAI_API_KEY: '', // No API key
                  OPENAI_MODEL: 'gpt-3.5-turbo',
                };
                return config[key] ?? defaultValue;
              }),
          },
        },
      ],
    }).compile();

    service = module.get<PatternClassificationService>(
      PatternClassificationService,
    );
  });

  afterEach(async () => {
    await module.close();
  });

  it('should use rule-based classification when no API key', async () => {
    // Arrange
    const pattern: PatternClassificationRequest = {
      patternId: 'test-1',
      merchantName: 'Netflix',
      categoryName: 'Entertainment',
      representativeDescription: 'Netflix subscription',
      averageAmount: 15.99,
      frequencyType: FrequencyType.MONTHLY,
      occurrenceCount: 6,
    };

    // Act
    const result = await service.classifyPatterns({
      patterns: [pattern],
      userId: 1,
    });

    // Assert
    expect(result.classifications).toHaveLength(1);
    expect(result.classifications[0].expenseType).toBe(
      ExpenseType.SUBSCRIPTION,
    );
    expect(result.classifications[0].reasoning).toBe(
      'Rule-based classification',
    );
    expect(result.tokensUsed).toBe(0);
  });
});
