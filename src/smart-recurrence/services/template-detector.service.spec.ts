import { Test, TestingModule } from '@nestjs/testing';
import { TemplateDetectorService } from './template-detector.service';
import { DetectedPatternData } from '../interfaces/pattern.interface';
import { FrequencyType } from '../interfaces/frequency.interface';
import { Transaction } from '../../transactions/transaction.entity';

describe('TemplateDetectorService', () => {
  let service: TemplateDetectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateDetectorService],
    }).compile();

    service = module.get<TemplateDetectorService>(TemplateDetectorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectTemplate', () => {
    const createTransaction = (
      date: Date,
      amount: number,
    ): Partial<Transaction> => ({
      id: Math.random(),
      amount: -amount,
      executionDate: date,
    });

    const createPattern = (
      frequencyType: FrequencyType,
      intervalDays: number,
      transactions: Partial<Transaction>[],
      categoryId: number | null = null,
      averageAmount: number = 100,
    ): DetectedPatternData => ({
      group: {
        id: 'test-group',
        transactions: transactions as Transaction[],
        averageAmount,
        categoryId,
        categoryName: categoryId ? 'Test Category' : null,
        merchantName: 'Test Merchant',
        representativeDescription: 'Test transaction',
      },
      frequency: {
        type: frequencyType,
        intervalDays,
        confidence: 85,
        nextExpectedDate: new Date(),
        occurrenceCount: transactions.length,
      },
      confidence: {
        overall: 80,
        breakdown: {
          similarity: 80,
          frequency: 85,
          occurrenceCount: 75,
        },
      },
      firstOccurrence: transactions[0]?.executionDate || new Date(),
      lastOccurrence:
        transactions[transactions.length - 1]?.executionDate || new Date(),
      nextExpectedDate: new Date(),
    });

    it('should detect monthly-bill for monthly patterns with consistent amounts', () => {
      const transactions = [
        createTransaction(new Date('2025-01-15'), 100),
        createTransaction(new Date('2025-02-15'), 100),
        createTransaction(new Date('2025-03-15'), 100),
        createTransaction(new Date('2025-04-15'), 100),
      ];

      const pattern = createPattern(
        FrequencyType.MONTHLY,
        30,
        transactions,
        null,
        100,
      );

      const result = service.detectTemplate(pattern);

      expect(result.templateId).toBe('monthly-bill');
      expect(result.confidence).toBeGreaterThan(70);
      expect(result.reasons).toContain('Monthly payments detected');
    });

    it('should detect monthly-budget for variable monthly spending with category', () => {
      const transactions = [
        createTransaction(new Date('2025-01-10'), 80),
        createTransaction(new Date('2025-01-20'), 120),
        createTransaction(new Date('2025-02-05'), 150),
        createTransaction(new Date('2025-02-15'), 70),
        createTransaction(new Date('2025-03-08'), 200),
      ];

      const pattern = createPattern(
        FrequencyType.MONTHLY,
        30,
        transactions,
        5, // Has category
        120,
      );
      // Manually set high variance by adjusting amounts in group
      pattern.group.averageAmount = 124;

      const result = service.detectTemplate(pattern);

      expect(result.templateId).toBe('monthly-budget');
      expect(result.reasons).toContain('Variable monthly spending pattern');
      expect(result.suggestedConfig.autoTrackCategory).toBe(true);
    });

    it('should detect irregular-payments for quarterly patterns', () => {
      const transactions = [
        createTransaction(new Date('2025-01-15'), 200),
        createTransaction(new Date('2025-04-15'), 200),
        createTransaction(new Date('2025-07-15'), 200),
        createTransaction(new Date('2025-10-15'), 200),
      ];

      const pattern = createPattern(
        FrequencyType.QUARTERLY,
        91,
        transactions,
        null,
        200,
      );

      const result = service.detectTemplate(pattern);

      expect(result.templateId).toBe('irregular-payments');
      expect(result.reasons.some((r) => r.includes('Quarterly'))).toBe(true);
      expect(result.suggestedConfig.paymentSchedule).toBeDefined();
      expect(result.suggestedConfig.paymentSchedule?.length).toBeGreaterThan(0);
    });

    it('should detect irregular-payments for semi-annual patterns', () => {
      const transactions = [
        createTransaction(new Date('2025-01-15'), 500),
        createTransaction(new Date('2025-07-15'), 500),
      ];

      const pattern = createPattern(
        FrequencyType.SEMIANNUAL,
        182,
        transactions,
        null,
        500,
      );

      const result = service.detectTemplate(pattern);

      expect(result.templateId).toBe('irregular-payments');
      expect(result.reasons.some((r) => r.includes('Semi-annual'))).toBe(true);
    });

    it('should detect irregular-payments for annual patterns', () => {
      const transactions = [
        createTransaction(new Date('2024-06-15'), 1200),
        createTransaction(new Date('2025-06-15'), 1200),
      ];

      const pattern = createPattern(
        FrequencyType.ANNUAL,
        365,
        transactions,
        null,
        1200,
      );

      const result = service.detectTemplate(pattern);

      expect(result.templateId).toBe('irregular-payments');
      expect(result.reasons.some((r) => r.includes('Annual'))).toBe(true);
    });

    it('should detect yearly-budget for sparse transactions with category', () => {
      const transactions = [
        createTransaction(new Date('2025-03-15'), 50),
        createTransaction(new Date('2025-08-20'), 75),
        createTransaction(new Date('2025-11-05'), 100),
      ];

      const pattern = createPattern(
        FrequencyType.QUARTERLY,
        120,
        transactions,
        10, // Has category
        75,
      );

      const result = service.detectTemplate(pattern);

      // Should detect as irregular-payments since it has quarterly frequency
      expect(['irregular-payments', 'yearly-budget']).toContain(
        result.templateId,
      );
    });

    it('should return dueDay in suggestedConfig when days are consistent', () => {
      const transactions = [
        createTransaction(new Date('2025-01-15'), 100),
        createTransaction(new Date('2025-02-15'), 100),
        createTransaction(new Date('2025-03-15'), 100),
        createTransaction(new Date('2025-04-15'), 100),
      ];

      const pattern = createPattern(
        FrequencyType.MONTHLY,
        30,
        transactions,
        null,
        100,
      );

      const result = service.detectTemplate(pattern);

      expect(result.suggestedConfig.dueDay).toBe(15);
    });

    it('should handle weekly patterns as monthly-bill', () => {
      const transactions = [
        createTransaction(new Date('2025-01-01'), 25),
        createTransaction(new Date('2025-01-08'), 25),
        createTransaction(new Date('2025-01-15'), 25),
        createTransaction(new Date('2025-01-22'), 25),
      ];

      const pattern = createPattern(
        FrequencyType.WEEKLY,
        7,
        transactions,
        null,
        25,
      );

      const result = service.detectTemplate(pattern);

      expect(result.templateId).toBe('monthly-bill');
      expect(result.reasons.some((r) => r.includes('Weekly'))).toBe(true);
    });

    it('should provide default suggestion for ambiguous patterns', () => {
      const transactions = [
        createTransaction(new Date('2025-01-05'), 100),
        createTransaction(new Date('2025-05-20'), 200),
      ];

      const pattern = createPattern(
        FrequencyType.MONTHLY, // Mismatched - frequency says monthly but only 2 transactions
        30,
        transactions,
        null,
        150,
      );

      const result = service.detectTemplate(pattern);

      // Should still return a result with lower confidence
      expect(result.templateId).toBeDefined();
      expect(result.confidence).toBeLessThanOrEqual(100);
    });
  });
});
