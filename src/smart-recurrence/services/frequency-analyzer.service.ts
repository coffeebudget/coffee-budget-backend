import { Injectable } from '@nestjs/common';
import { differenceInDays, addDays } from 'date-fns';
import { Transaction } from '../../transactions/transaction.entity';
import {
  FrequencyPattern,
  FrequencyType,
} from '../interfaces/frequency.interface';

@Injectable()
export class FrequencyAnalyzerService {
  /**
   * Analyze temporal pattern of transactions to detect frequency
   * @param transactions Array of transactions (should be sorted by date)
   * @returns FrequencyPattern with type, interval, confidence, and next expected date
   */
  analyzeFrequency(transactions: Transaction[]): FrequencyPattern {
    if (transactions.length < 2) {
      throw new Error('At least 2 transactions required for frequency analysis');
    }

    // Sort transactions by execution date (ascending)
    const sortedTransactions = [...transactions].sort((a, b) => {
      const dateA = a.executionDate || a.createdAt;
      const dateB = b.executionDate || b.createdAt;
      return dateA.getTime() - dateB.getTime();
    });

    // Calculate intervals between consecutive transactions
    const intervals = this.calculateIntervals(sortedTransactions);

    // Calculate average interval and standard deviation
    const avgInterval = this.calculateAverage(intervals);
    const stdDev = this.calculateStandardDeviation(intervals, avgInterval);

    // Calculate confidence based on interval consistency
    // Low standard deviation = high confidence in regularity
    const confidence = this.calculateConfidence(avgInterval, stdDev);

    // Classify frequency type based on average interval
    const type = this.classifyFrequency(avgInterval);

    // Predict next expected date
    const lastDate =
      sortedTransactions[sortedTransactions.length - 1].executionDate ||
      sortedTransactions[sortedTransactions.length - 1].createdAt;
    const nextExpectedDate = addDays(lastDate, Math.round(avgInterval));

    return {
      type,
      intervalDays: Math.round(avgInterval),
      confidence,
      nextExpectedDate,
      occurrenceCount: transactions.length,
    };
  }

  /**
   * Calculate intervals (in days) between consecutive transactions
   */
  private calculateIntervals(transactions: Transaction[]): number[] {
    const intervals: number[] = [];

    for (let i = 1; i < transactions.length; i++) {
      const prevDate = transactions[i - 1].executionDate || transactions[i - 1].createdAt;
      const currDate = transactions[i].executionDate || transactions[i].createdAt;
      const days = differenceInDays(currDate, prevDate);
      intervals.push(days);
    }

    return intervals;
  }

  /**
   * Calculate average of numbers
   */
  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    const sum = numbers.reduce((acc, val) => acc + val, 0);
    return sum / numbers.length;
  }

  /**
   * Calculate standard deviation of intervals
   * Measures consistency of intervals
   */
  private calculateStandardDeviation(numbers: number[], average: number): number {
    if (numbers.length === 0) return 0;

    const squaredDifferences = numbers.map((val) => Math.pow(val - average, 2));
    const variance =
      squaredDifferences.reduce((acc, val) => acc + val, 0) / numbers.length;

    return Math.sqrt(variance);
  }

  /**
   * Calculate confidence score based on interval consistency
   * Low standard deviation relative to average = high confidence
   * @param avgInterval Average days between transactions
   * @param stdDev Standard deviation of intervals
   * @returns Confidence score 0-100
   */
  private calculateConfidence(avgInterval: number, stdDev: number): number {
    if (avgInterval === 0) return 0;

    // Coefficient of variation (CV) = stdDev / mean
    // Lower CV = more consistent = higher confidence
    const coefficientOfVariation = stdDev / avgInterval;

    // Convert CV to confidence score (0-100)
    // CV of 0 = 100% confidence
    // CV of 1 (stdDev equals mean) = 0% confidence
    const confidence = Math.max(0, 100 - coefficientOfVariation * 100);

    return Math.round(confidence);
  }

  /**
   * Classify frequency type based on average interval in days
   * @param avgDays Average days between occurrences
   * @returns FrequencyType classification
   */
  private classifyFrequency(avgDays: number): FrequencyType {
    // Weekly: ~7 days (±3 days tolerance)
    if (avgDays <= 10) {
      return FrequencyType.WEEKLY;
    }

    // Biweekly: ~14 days (±3 days tolerance)
    if (avgDays <= 17) {
      return FrequencyType.BIWEEKLY;
    }

    // Monthly: ~30 days (±5 days tolerance)
    if (avgDays <= 35) {
      return FrequencyType.MONTHLY;
    }

    // Quarterly: ~90 days (±10 days tolerance)
    if (avgDays <= 100) {
      return FrequencyType.QUARTERLY;
    }

    // Semiannual: ~180 days (±20 days tolerance)
    if (avgDays <= 200) {
      return FrequencyType.SEMIANNUAL;
    }

    // Annual: ~365 days
    return FrequencyType.ANNUAL;
  }

  /**
   * Check if a transaction falls within expected date range for a pattern
   * Useful for validating if a new transaction fits an existing pattern
   * @param transactionDate Date of the transaction
   * @param pattern Frequency pattern to check against
   * @param toleranceDays Number of days tolerance (default: 7)
   * @returns true if within tolerance, false otherwise
   */
  isWithinExpectedRange(
    transactionDate: Date,
    pattern: FrequencyPattern,
    toleranceDays: number = 7,
  ): boolean {
    const daysDifference = Math.abs(
      differenceInDays(transactionDate, pattern.nextExpectedDate),
    );
    return daysDifference <= toleranceDays;
  }

  /**
   * Calculate frequency confidence boost based on number of occurrences
   * More occurrences = higher confidence in pattern
   * @param occurrenceCount Number of times pattern has occurred
   * @returns Confidence boost 0-20
   */
  calculateOccurrenceBoost(occurrenceCount: number): number {
    // 2 occurrences: +0
    // 3 occurrences: +5
    // 4 occurrences: +10
    // 5 occurrences: +15
    // 6+ occurrences: +20
    if (occurrenceCount <= 2) return 0;
    if (occurrenceCount === 3) return 5;
    if (occurrenceCount === 4) return 10;
    if (occurrenceCount === 5) return 15;
    return 20; // Max boost
  }
}
