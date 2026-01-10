import { Test, TestingModule } from '@nestjs/testing';
import { FrequencyAnalyzerService } from './frequency-analyzer.service';
import { Transaction } from '../../transactions/transaction.entity';
import { FrequencyType } from '../interfaces/frequency.interface';
import { addDays, subDays } from 'date-fns';

describe('FrequencyAnalyzerService', () => {
  let service: FrequencyAnalyzerService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [FrequencyAnalyzerService],
    }).compile();

    service = module.get<FrequencyAnalyzerService>(FrequencyAnalyzerService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('analyzeFrequency', () => {
    it('should throw error with less than 2 transactions', () => {
      // Arrange
      const transactions = [{ executionDate: new Date() } as Transaction];

      // Act & Assert
      expect(() => service.analyzeFrequency(transactions)).toThrow(
        'At least 2 transactions required for frequency analysis',
      );
    });

    it('should detect weekly frequency (7 days)', () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        { executionDate: baseDate } as Transaction,
        { executionDate: addDays(baseDate, 7) } as Transaction,
        { executionDate: addDays(baseDate, 14) } as Transaction,
        { executionDate: addDays(baseDate, 21) } as Transaction,
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.type).toBe(FrequencyType.WEEKLY);
      expect(result.intervalDays).toBe(7);
      expect(result.confidence).toBeGreaterThan(90); // Very consistent
      expect(result.occurrenceCount).toBe(4);
      expect(result.nextExpectedDate).toEqual(addDays(baseDate, 28));
    });

    it('should detect biweekly frequency (14 days)', () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        { executionDate: baseDate } as Transaction,
        { executionDate: addDays(baseDate, 14) } as Transaction,
        { executionDate: addDays(baseDate, 28) } as Transaction,
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.type).toBe(FrequencyType.BIWEEKLY);
      expect(result.intervalDays).toBe(14);
      expect(result.confidence).toBeGreaterThan(90);
    });

    it('should detect monthly frequency (~30 days)', () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        { executionDate: new Date('2024-01-01') } as Transaction,
        { executionDate: new Date('2024-02-01') } as Transaction,
        { executionDate: new Date('2024-03-01') } as Transaction,
        { executionDate: new Date('2024-04-01') } as Transaction,
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.type).toBe(FrequencyType.MONTHLY);
      expect(result.intervalDays).toBeGreaterThan(28);
      expect(result.intervalDays).toBeLessThan(32);
    });

    it('should detect quarterly frequency (~90 days)', () => {
      // Arrange
      const transactions = [
        { executionDate: new Date('2024-01-01') } as Transaction,
        { executionDate: new Date('2024-04-01') } as Transaction,
        { executionDate: new Date('2024-07-01') } as Transaction,
        { executionDate: new Date('2024-10-01') } as Transaction,
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.type).toBe(FrequencyType.QUARTERLY);
      expect(result.intervalDays).toBeGreaterThan(85);
      expect(result.intervalDays).toBeLessThan(95);
    });

    it('should detect semiannual frequency (~180 days)', () => {
      // Arrange
      const transactions = [
        { executionDate: new Date('2024-01-01') } as Transaction,
        { executionDate: new Date('2024-07-01') } as Transaction,
        { executionDate: new Date('2025-01-01') } as Transaction,
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.type).toBe(FrequencyType.SEMIANNUAL);
      expect(result.intervalDays).toBeGreaterThan(175);
      expect(result.intervalDays).toBeLessThan(185);
    });

    it('should detect annual frequency (~365 days)', () => {
      // Arrange
      const transactions = [
        { executionDate: new Date('2022-01-01') } as Transaction,
        { executionDate: new Date('2023-01-01') } as Transaction,
        { executionDate: new Date('2024-01-01') } as Transaction,
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.type).toBe(FrequencyType.ANNUAL);
      expect(result.intervalDays).toBeGreaterThan(360);
      expect(result.intervalDays).toBeLessThan(370);
    });

    it('should calculate low confidence for irregular intervals', () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        { executionDate: baseDate } as Transaction,
        { executionDate: addDays(baseDate, 7) } as Transaction,
        { executionDate: addDays(baseDate, 20) } as Transaction,
        { executionDate: addDays(baseDate, 25) } as Transaction,
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.confidence).toBeLessThan(70); // Inconsistent intervals (lower than consistent patterns)
    });

    it('should calculate high confidence for consistent intervals', () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        { executionDate: baseDate } as Transaction,
        { executionDate: addDays(baseDate, 30) } as Transaction,
        { executionDate: addDays(baseDate, 60) } as Transaction,
        { executionDate: addDays(baseDate, 90) } as Transaction,
        { executionDate: addDays(baseDate, 120) } as Transaction,
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.confidence).toBeGreaterThan(90); // Very consistent 30-day intervals
    });

    it('should sort transactions by date before analysis', () => {
      // Arrange - transactions in random order
      const baseDate = new Date('2024-01-01');
      const transactions = [
        { executionDate: addDays(baseDate, 21) } as Transaction,
        { executionDate: baseDate } as Transaction,
        { executionDate: addDays(baseDate, 14) } as Transaction,
        { executionDate: addDays(baseDate, 7) } as Transaction,
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.type).toBe(FrequencyType.WEEKLY);
      expect(result.intervalDays).toBe(7);
    });

    it('should handle transactions with createdAt when executionDate is null', () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        {
          id: 1,
          executionDate: undefined,
          createdAt: baseDate,
        } as Partial<Transaction> as Transaction,
        {
          id: 2,
          executionDate: undefined,
          createdAt: addDays(baseDate, 7),
        } as Partial<Transaction> as Transaction,
        {
          id: 3,
          executionDate: undefined,
          createdAt: addDays(baseDate, 14),
        } as Partial<Transaction> as Transaction,
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.type).toBe(FrequencyType.WEEKLY);
      expect(result.intervalDays).toBe(7);
    });

    it('should predict next expected date correctly', () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        { executionDate: baseDate } as Transaction,
        { executionDate: addDays(baseDate, 30) } as Transaction,
        { executionDate: addDays(baseDate, 60) } as Transaction,
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.nextExpectedDate).toEqual(addDays(baseDate, 90));
    });

    it('should return correct occurrence count', () => {
      // Arrange
      const baseDate = new Date('2024-01-01');
      const transactions = [
        { executionDate: baseDate } as Transaction,
        { executionDate: addDays(baseDate, 7) } as Transaction,
        { executionDate: addDays(baseDate, 14) } as Transaction,
        { executionDate: addDays(baseDate, 21) } as Transaction,
        { executionDate: addDays(baseDate, 28) } as Transaction,
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.occurrenceCount).toBe(5);
    });
  });

  describe('isWithinExpectedRange', () => {
    it('should return true when transaction is within tolerance', () => {
      // Arrange
      const pattern = {
        nextExpectedDate: new Date('2024-06-15'),
      } as any;
      const transactionDate = new Date('2024-06-18'); // 3 days difference

      // Act
      const result = service.isWithinExpectedRange(transactionDate, pattern, 7);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when transaction is outside tolerance', () => {
      // Arrange
      const pattern = {
        nextExpectedDate: new Date('2024-06-15'),
      } as any;
      const transactionDate = new Date('2024-06-25'); // 10 days difference

      // Act
      const result = service.isWithinExpectedRange(transactionDate, pattern, 7);

      // Assert
      expect(result).toBe(false);
    });

    it('should use default tolerance of 7 days', () => {
      // Arrange
      const pattern = {
        nextExpectedDate: new Date('2024-06-15'),
      } as any;
      const transactionDate = new Date('2024-06-20'); // 5 days difference

      // Act
      const result = service.isWithinExpectedRange(transactionDate, pattern);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle dates before expected date', () => {
      // Arrange
      const pattern = {
        nextExpectedDate: new Date('2024-06-15'),
      } as any;
      const transactionDate = new Date('2024-06-10'); // 5 days before

      // Act
      const result = service.isWithinExpectedRange(transactionDate, pattern, 7);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('calculateOccurrenceBoost', () => {
    it('should return 0 for 2 occurrences', () => {
      // Act
      const result = service.calculateOccurrenceBoost(2);

      // Assert
      expect(result).toBe(0);
    });

    it('should return 5 for 3 occurrences', () => {
      // Act
      const result = service.calculateOccurrenceBoost(3);

      // Assert
      expect(result).toBe(5);
    });

    it('should return 10 for 4 occurrences', () => {
      // Act
      const result = service.calculateOccurrenceBoost(4);

      // Assert
      expect(result).toBe(10);
    });

    it('should return 15 for 5 occurrences', () => {
      // Act
      const result = service.calculateOccurrenceBoost(5);

      // Assert
      expect(result).toBe(15);
    });

    it('should return 20 (max) for 6+ occurrences', () => {
      // Act
      const result6 = service.calculateOccurrenceBoost(6);
      const result10 = service.calculateOccurrenceBoost(10);
      const result100 = service.calculateOccurrenceBoost(100);

      // Assert
      expect(result6).toBe(20);
      expect(result10).toBe(20);
      expect(result100).toBe(20);
    });
  });

  describe('edge cases', () => {
    it('should handle same-day transactions', () => {
      // Arrange
      const date = new Date('2024-01-01');
      const transactions = [
        { executionDate: date } as Transaction,
        { executionDate: date } as Transaction,
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.intervalDays).toBe(0);
      expect(result.confidence).toBe(0); // Zero interval = no confidence
    });

    it('should handle very large intervals (multi-year)', () => {
      // Arrange
      const transactions = [
        { executionDate: new Date('2020-01-01') } as Transaction,
        { executionDate: new Date('2022-01-01') } as Transaction,
        { executionDate: new Date('2024-01-01') } as Transaction,
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.type).toBe(FrequencyType.ANNUAL);
      expect(result.intervalDays).toBeGreaterThan(700); // ~2 years
    });

    it('should handle slight variations in monthly intervals (28-31 days)', () => {
      // Arrange
      const transactions = [
        { executionDate: new Date('2024-01-31') } as Transaction,
        { executionDate: new Date('2024-02-29') } as Transaction, // 29 days
        { executionDate: new Date('2024-03-31') } as Transaction, // 31 days
        { executionDate: new Date('2024-04-30') } as Transaction, // 30 days
      ];

      // Act
      const result = service.analyzeFrequency(transactions);

      // Assert
      expect(result.type).toBe(FrequencyType.MONTHLY);
      expect(result.confidence).toBeGreaterThan(70); // Reasonable confidence despite variation
    });
  });
});
