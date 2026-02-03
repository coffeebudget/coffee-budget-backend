import { Injectable, Logger } from '@nestjs/common';
import { DetectedPatternData } from '../interfaces/pattern.interface';
import { FrequencyType } from '../interfaces/frequency.interface';
import { Transaction } from '../../transactions/transaction.entity';
import { ExpenseType } from '../interfaces/classification.interface';

/**
 * Template IDs matching the frontend PLAN_TEMPLATES constant.
 */
export type TemplateId =
  | 'monthly-bill'
  | 'irregular-payments'
  | 'emergency-fund'
  | 'seasonal-goal'
  | 'monthly-budget'
  | 'envelope-budget'
  | 'yearly-budget';

/**
 * Result of template detection for a pattern.
 */
export interface TemplateDetectionResult {
  templateId: TemplateId;
  confidence: number; // 0-100
  reasons: string[];
  suggestedConfig: {
    dueDay?: number;
    dueMonth?: number;
    paymentSchedule?: { month: number; estimatedAmount: number }[];
    spendingWindows?: number[];
    autoTrackCategory?: boolean;
    paymentAccountId?: number;
  };
}

/**
 * Pattern analysis signals used for template detection.
 */
interface PatternSignals {
  isMonthly: boolean;
  isWeekly: boolean;
  isBiweekly: boolean;
  isQuarterly: boolean;
  isSemiannual: boolean;
  isAnnual: boolean;
  amountVariance: number; // coefficient of variation (0 = identical, 1 = high variance)
  averageAmount: number;
  yearlyTotal: number;
  transactionsPerMonth: number;
  mostCommonDay: number;
  dayVariance: number;
  hasSeasonalPattern: boolean;
  seasonalMonths: number[];
  hasCategory: boolean;
  intervalConfidence: number;
}

/**
 * Service for detecting which expense plan template best fits a transaction pattern.
 *
 * PRD-006: Enhanced AI Suggestions
 * - Analyzes pattern frequency, amount variance, and category
 * - Returns template ID, confidence score, and pre-filled configuration
 */
@Injectable()
export class TemplateDetectorService {
  private readonly logger = new Logger(TemplateDetectorService.name);

  /**
   * Detect the best template for a pattern.
   *
   * @param pattern The detected pattern data
   * @param expenseType Optional expense type from AI classification
   * @returns Template detection result with confidence and config
   */
  detectTemplate(
    pattern: DetectedPatternData,
    expenseType?: ExpenseType,
  ): TemplateDetectionResult {
    const signals = this.analyzePattern(pattern);
    const dueDay = this.inferDueDay(pattern.group.transactions);

    // 1. Monthly Bill: Regular monthly interval with consistent amounts
    if (signals.isMonthly && signals.amountVariance < 0.2) {
      return {
        templateId: 'monthly-bill',
        confidence: Math.round(
          signals.intervalConfidence * 0.7 + (1 - signals.amountVariance) * 30,
        ),
        reasons: this.buildReasons([
          'Monthly payments detected',
          signals.amountVariance < 0.1
            ? 'Very consistent amounts'
            : 'Fairly consistent amounts',
          dueDay.confidence > 70
            ? `Usually due around day ${dueDay.day}`
            : null,
        ]),
        suggestedConfig: {
          dueDay: dueDay.confidence > 50 ? dueDay.day : undefined,
          autoTrackCategory: signals.hasCategory,
        },
      };
    }

    // 2. Irregular Payments: Non-monthly but predictable schedule
    if (
      !signals.isMonthly &&
      (signals.isQuarterly || signals.isSemiannual || signals.isAnnual)
    ) {
      const schedule = this.detectPaymentSchedule(pattern.group.transactions);
      const patternName = signals.isQuarterly
        ? 'quarterly'
        : signals.isSemiannual
          ? 'semi-annual'
          : 'annual';

      return {
        templateId: 'irregular-payments',
        confidence: Math.round(
          signals.intervalConfidence * 0.6 + schedule.confidence * 0.4,
        ),
        reasons: this.buildReasons([
          `${schedule.paymentsPerYear} payments detected per year`,
          `${patternName.charAt(0).toUpperCase() + patternName.slice(1)} pattern`,
          signals.amountVariance < 0.15
            ? `Consistent amounts (~${signals.averageAmount.toFixed(0)})`
            : null,
        ]),
        suggestedConfig: {
          paymentSchedule: schedule.months,
          dueMonth: schedule.months[0]?.month,
          autoTrackCategory: signals.hasCategory,
        },
      };
    }

    // 3. Monthly Budget: Variable monthly spending with category
    if (
      signals.isMonthly &&
      signals.amountVariance >= 0.2 &&
      signals.hasCategory
    ) {
      return {
        templateId: 'monthly-budget',
        confidence: Math.round(
          70 + (signals.transactionsPerMonth > 3 ? 15 : 0),
        ),
        reasons: this.buildReasons([
          'Variable monthly spending pattern',
          'Category-based tracking recommended',
          signals.transactionsPerMonth > 5
            ? 'High transaction frequency'
            : null,
        ]),
        suggestedConfig: {
          autoTrackCategory: true,
        },
      };
    }

    // 4. Weekly/Biweekly as Monthly Bill (frequent payments)
    if (
      (signals.isWeekly || signals.isBiweekly) &&
      signals.amountVariance < 0.3
    ) {
      return {
        templateId: 'monthly-bill',
        confidence: Math.round(signals.intervalConfidence * 0.8),
        reasons: this.buildReasons([
          signals.isWeekly
            ? 'Weekly payments detected'
            : 'Bi-weekly payments detected',
          'Treating as monthly total',
        ]),
        suggestedConfig: {
          autoTrackCategory: signals.hasCategory,
        },
      };
    }

    // 5. Seasonal Goal: Concentrated spending in specific periods
    if (signals.hasSeasonalPattern) {
      return {
        templateId: 'seasonal-goal',
        confidence: 65,
        reasons: this.buildReasons([
          'Seasonal spending pattern detected',
          `Active in ${signals.seasonalMonths.length} months`,
        ]),
        suggestedConfig: {
          spendingWindows: signals.seasonalMonths,
          autoTrackCategory: signals.hasCategory,
        },
      };
    }

    // 6. Yearly Budget: Sparse transactions throughout the year with category
    if (signals.transactionsPerMonth < 2 && signals.hasCategory) {
      return {
        templateId: 'yearly-budget',
        confidence: 60,
        reasons: this.buildReasons([
          'Occasional spending pattern',
          'Category-based annual tracking',
        ]),
        suggestedConfig: {
          autoTrackCategory: true,
        },
      };
    }

    // 7. Default: Monthly Bill (most common case)
    return {
      templateId: 'monthly-bill',
      confidence: 50,
      reasons: ['Default suggestion based on spending pattern'],
      suggestedConfig: {
        dueDay: dueDay.confidence > 50 ? dueDay.day : undefined,
        autoTrackCategory: signals.hasCategory,
      },
    };
  }

  /**
   * Analyze a pattern to extract signals for template detection.
   */
  private analyzePattern(pattern: DetectedPatternData): PatternSignals {
    const { frequency, group } = pattern;
    const transactions = group.transactions;

    // Calculate amount variance (coefficient of variation)
    const amounts = transactions.map((t) => Math.abs(t.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = this.calculateVariance(amounts, avgAmount);
    const stdDev = Math.sqrt(variance);
    const amountVariance = avgAmount > 0 ? stdDev / avgAmount : 0;

    // Calculate transactions per month
    const firstDate = new Date(pattern.firstOccurrence);
    const lastDate = new Date(pattern.lastOccurrence);
    const spanMonths = Math.max(
      1,
      (lastDate.getFullYear() - firstDate.getFullYear()) * 12 +
        (lastDate.getMonth() - firstDate.getMonth()) +
        1,
    );
    const transactionsPerMonth = transactions.length / spanMonths;

    // Check for seasonal pattern
    const { hasSeasonal, months } = this.detectSeasonalPattern(transactions);

    return {
      isMonthly: frequency.type === FrequencyType.MONTHLY,
      isWeekly: frequency.type === FrequencyType.WEEKLY,
      isBiweekly: frequency.type === FrequencyType.BIWEEKLY,
      isQuarterly: frequency.type === FrequencyType.QUARTERLY,
      isSemiannual: frequency.type === FrequencyType.SEMIANNUAL,
      isAnnual: frequency.type === FrequencyType.ANNUAL,
      amountVariance,
      averageAmount: avgAmount,
      yearlyTotal: avgAmount * (12 / (frequency.intervalDays / 30)),
      transactionsPerMonth,
      mostCommonDay: this.getMostCommonDay(transactions),
      dayVariance: this.calculateDayVariance(transactions),
      hasSeasonalPattern: hasSeasonal,
      seasonalMonths: months,
      hasCategory: group.categoryId !== null,
      intervalConfidence: frequency.confidence,
    };
  }

  /**
   * Infer the typical due day from transaction dates.
   */
  private inferDueDay(transactions: Transaction[]): {
    day: number;
    confidence: number;
  } {
    if (transactions.length < 2) {
      return { day: 1, confidence: 0 };
    }

    const days = transactions
      .filter((t) => t.executionDate)
      .map((t) => new Date(t.executionDate!).getDate());
    const dayCounts = new Map<number, number>();

    for (const day of days) {
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    }

    // Find most common day
    let mostCommonDay = 1;
    let maxCount = 0;
    for (const [day, count] of dayCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonDay = day;
      }
    }

    // Calculate confidence based on how concentrated the days are
    const avgDay = days.reduce((a, b) => a + b, 0) / days.length;
    const dayVariance = this.calculateVariance(days, avgDay);
    const dayStdDev = Math.sqrt(dayVariance);

    // Lower std dev = higher confidence
    const confidence =
      dayStdDev < 3 ? 90 : dayStdDev < 5 ? 75 : dayStdDev < 10 ? 50 : 30;

    return { day: mostCommonDay, confidence };
  }

  /**
   * Detect payment schedule from transaction history.
   */
  private detectPaymentSchedule(transactions: Transaction[]): {
    months: { month: number; estimatedAmount: number }[];
    paymentsPerYear: number;
    confidence: number;
  } {
    const monthlyData = new Map<number, number[]>();

    for (const tx of transactions) {
      if (!tx.executionDate) continue;
      const month = new Date(tx.executionDate).getMonth() + 1;
      if (!monthlyData.has(month)) {
        monthlyData.set(month, []);
      }
      monthlyData.get(month)!.push(Math.abs(tx.amount));
    }

    const months: { month: number; estimatedAmount: number }[] = [];
    for (const [month, amounts] of monthlyData) {
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      months.push({ month, estimatedAmount: Math.round(avg * 100) / 100 });
    }

    // Sort by month
    months.sort((a, b) => a.month - b.month);

    // Calculate confidence based on consistency
    const totalPaymentYears = this.countYearsWithData(transactions);
    const avgOccurrencesPerMonth =
      months.reduce(
        (sum, m) => sum + (monthlyData.get(m.month)?.length || 0),
        0,
      ) / Math.max(1, months.length);
    const confidence = Math.min(
      95,
      50 + avgOccurrencesPerMonth * 10 + totalPaymentYears * 5,
    );

    return {
      months,
      paymentsPerYear: months.length,
      confidence: Math.round(confidence),
    };
  }

  /**
   * Detect if there's a seasonal spending pattern.
   */
  private detectSeasonalPattern(transactions: Transaction[]): {
    hasSeasonal: boolean;
    months: number[];
  } {
    const monthCounts = new Array(12).fill(0);

    for (const tx of transactions) {
      if (!tx.executionDate) continue;
      const month = new Date(tx.executionDate).getMonth();
      monthCounts[month]++;
    }

    const totalTx = transactions.length;
    const avgPerMonth = totalTx / 12;

    // Find months with above-average spending
    const activeMonths: number[] = [];
    for (let i = 0; i < 12; i++) {
      if (monthCounts[i] > avgPerMonth * 1.5) {
        activeMonths.push(i + 1); // 1-indexed months
      }
    }

    // Seasonal if spending is concentrated in 2-6 months
    const hasSeasonal = activeMonths.length >= 2 && activeMonths.length <= 6;

    return { hasSeasonal, months: activeMonths };
  }

  /**
   * Get the most common day of month from transactions.
   */
  private getMostCommonDay(transactions: Transaction[]): number {
    const dayCounts = new Map<number, number>();

    for (const tx of transactions) {
      if (!tx.executionDate) continue;
      const day = new Date(tx.executionDate).getDate();
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    }

    let mostCommonDay = 1;
    let maxCount = 0;
    for (const [day, count] of dayCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonDay = day;
      }
    }

    return mostCommonDay;
  }

  /**
   * Calculate variance of day of month in transactions.
   */
  private calculateDayVariance(transactions: Transaction[]): number {
    const days = transactions
      .filter((t) => t.executionDate)
      .map((t) => new Date(t.executionDate!).getDate());
    if (days.length === 0) return 0;
    const avg = days.reduce((a, b) => a + b, 0) / days.length;
    return this.calculateVariance(days, avg);
  }

  /**
   * Calculate variance of a number array.
   */
  private calculateVariance(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Count how many unique years have transaction data.
   */
  private countYearsWithData(transactions: Transaction[]): number {
    const years = new Set<number>();
    for (const tx of transactions) {
      if (tx.executionDate) {
        years.add(new Date(tx.executionDate).getFullYear());
      }
    }
    return years.size;
  }

  /**
   * Build reasons array filtering out nulls.
   */
  private buildReasons(items: (string | null)[]): string[] {
    return items.filter((item): item is string => item !== null);
  }
}
