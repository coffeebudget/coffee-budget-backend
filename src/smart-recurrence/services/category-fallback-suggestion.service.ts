import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subMonths } from 'date-fns';
import { Transaction } from '../../transactions/transaction.entity';
import { Category } from '../../categories/entities/category.entity';

/**
 * Configuration for fallback suggestions
 */
export const SUGGESTION_CONFIG = {
  // Minimum monthly average to generate a fallback suggestion (€30)
  MIN_MONTHLY_AVERAGE: 30,

  // Threshold for discrepancy warning between pattern amount and category average (10%)
  DISCREPANCY_THRESHOLD: 10,

  // Minimum transactions required in 12 months to suggest
  MIN_TRANSACTIONS: 2,

  // Months to analyze for fallback calculation
  MONTHS_TO_ANALYZE: 12,
};

/**
 * Category fallback suggestion data
 * Used when pattern detection fails but category has significant spending
 */
export interface CategoryFallbackSuggestion {
  categoryId: number;
  categoryName: string;
  totalSpent: number;
  transactionCount: number;
  monthlyAverage: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  suggestedPurpose: 'spending_budget';
  reason: 'no_pattern_detected';
}

/**
 * Discrepancy check result
 */
export interface DiscrepancyResult {
  hasDiscrepancy: boolean;
  patternAmount?: number;
  categoryAverage?: number;
  discrepancyPercentage?: number;
  message?: string;
}

@Injectable()
export class CategoryFallbackSuggestionService {
  private readonly logger = new Logger(CategoryFallbackSuggestionService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  /**
   * Generate fallback suggestions for categories without detected patterns
   * Uses simple monthly average (annual / 12) approach
   */
  async generateFallbackSuggestions(
    userId: number,
  ): Promise<CategoryFallbackSuggestion[]> {
    const startDate = subMonths(new Date(), SUGGESTION_CONFIG.MONTHS_TO_ANALYZE);

    this.logger.log(
      `Generating fallback suggestions for user ${userId} from ${startDate.toISOString()}`,
    );

    // Get all expense transactions with categories in the last 12 months
    const categoryStats = await this.transactionRepository
      .createQueryBuilder('t')
      .select('t.categoryId', 'categoryId')
      .addSelect('c.name', 'categoryName')
      .addSelect('SUM(ABS(t.amount))', 'totalSpent')
      .addSelect('COUNT(t.id)', 'transactionCount')
      .addSelect('MIN(t.executionDate)', 'firstOccurrence')
      .addSelect('MAX(t.executionDate)', 'lastOccurrence')
      .innerJoin('t.category', 'c')
      .where('t.userId = :userId', { userId })
      .andWhere('t.type = :type', { type: 'expense' })
      .andWhere('t.executionDate >= :startDate', { startDate })
      .andWhere('c.excludeFromExpenseAnalytics = false')
      .groupBy('t.categoryId')
      .addGroupBy('c.name')
      .getRawMany();

    this.logger.log(`Found ${categoryStats.length} categories with expenses`);

    // Filter and map to fallback suggestions
    const fallbackSuggestions: CategoryFallbackSuggestion[] = [];

    for (const stat of categoryStats) {
      const totalSpent = parseFloat(stat.totalSpent) || 0;
      const transactionCount = parseInt(stat.transactionCount, 10) || 0;
      const monthlyAverage = Math.round((totalSpent / SUGGESTION_CONFIG.MONTHS_TO_ANALYZE) * 100) / 100;

      // Skip if below minimum thresholds
      if (monthlyAverage < SUGGESTION_CONFIG.MIN_MONTHLY_AVERAGE) {
        continue;
      }

      if (transactionCount < SUGGESTION_CONFIG.MIN_TRANSACTIONS) {
        continue;
      }

      fallbackSuggestions.push({
        categoryId: parseInt(stat.categoryId, 10),
        categoryName: stat.categoryName,
        totalSpent,
        transactionCount,
        monthlyAverage,
        firstOccurrence: new Date(stat.firstOccurrence),
        lastOccurrence: new Date(stat.lastOccurrence),
        suggestedPurpose: 'spending_budget',
        reason: 'no_pattern_detected',
      });
    }

    this.logger.log(
      `Generated ${fallbackSuggestions.length} fallback suggestions ` +
        `(${categoryStats.length - fallbackSuggestions.length} filtered below threshold)`,
    );

    // Sort by monthly average (highest first)
    return fallbackSuggestions.sort((a, b) => b.monthlyAverage - a.monthlyAverage);
  }

  /**
   * Get monthly average spending for a specific category
   * Used for discrepancy checks against pattern amounts
   */
  async getCategoryMonthlyAverage(
    categoryId: number,
    userId: number,
  ): Promise<number> {
    const startDate = subMonths(new Date(), SUGGESTION_CONFIG.MONTHS_TO_ANALYZE);

    const result = await this.transactionRepository
      .createQueryBuilder('t')
      .select('SUM(ABS(t.amount))', 'totalSpent')
      .where('t.userId = :userId', { userId })
      .andWhere('t.categoryId = :categoryId', { categoryId })
      .andWhere('t.type = :type', { type: 'expense' })
      .andWhere('t.executionDate >= :startDate', { startDate })
      .getRawOne();

    const totalSpent = parseFloat(result?.totalSpent) || 0;
    return Math.round((totalSpent / SUGGESTION_CONFIG.MONTHS_TO_ANALYZE) * 100) / 100;
  }

  /**
   * Check discrepancy between detected pattern amount and category monthly average
   * Returns warning if difference exceeds threshold
   */
  async checkPatternDiscrepancy(
    patternMonthlyAmount: number,
    categoryId: number,
    userId: number,
  ): Promise<DiscrepancyResult> {
    const categoryAverage = await this.getCategoryMonthlyAverage(categoryId, userId);

    // If category average is 0, no discrepancy to check
    if (categoryAverage === 0) {
      return { hasDiscrepancy: false };
    }

    // Calculate discrepancy as percentage of category average
    const difference = Math.abs(patternMonthlyAmount - categoryAverage);
    const discrepancyPercentage = Math.round((difference / categoryAverage) * 100 * 100) / 100;

    // Check if discrepancy exceeds threshold
    if (discrepancyPercentage > SUGGESTION_CONFIG.DISCREPANCY_THRESHOLD) {
      const isPatternLower = patternMonthlyAmount < categoryAverage;
      const message = isPatternLower
        ? `Pattern suggests €${patternMonthlyAmount.toFixed(2)}/month, but category average is €${categoryAverage.toFixed(2)}/month. ` +
          `There may be additional variable expenses or transactions to recategorize.`
        : `Pattern suggests €${patternMonthlyAmount.toFixed(2)}/month, but category average is only €${categoryAverage.toFixed(2)}/month. ` +
          `The pattern may include one-time expenses or transactions that should be in different categories.`;

      this.logger.log(
        `Discrepancy detected for category ${categoryId}: ` +
          `pattern €${patternMonthlyAmount} vs average €${categoryAverage} (${discrepancyPercentage}%)`,
      );

      return {
        hasDiscrepancy: true,
        patternAmount: patternMonthlyAmount,
        categoryAverage,
        discrepancyPercentage,
        message,
      };
    }

    return {
      hasDiscrepancy: false,
      patternAmount: patternMonthlyAmount,
      categoryAverage,
      discrepancyPercentage,
    };
  }
}
