import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { ExpensePlan } from './entities/expense-plan.entity';
import { Transaction } from '../transactions/transaction.entity';
import { EventPublisherService } from '../shared/services/event-publisher.service';

export interface AdjustmentResult {
  suggestedAmount: number;
  currentAmount: number;
  percentChange: number;
  reason: 'spending_increased' | 'spending_decreased';
}

export interface CategorySpendingResult {
  weightedMonthlyAverage: number;
  transactionCount: number;
  totalSpending: number;
  spanMonths: number;
}

export interface ReviewSummary {
  plansReviewed: number;
  newSuggestions: number;
  clearedSuggestions: number;
}

@Injectable()
export class ExpensePlanAdjustmentService {
  private readonly logger = new Logger(ExpensePlanAdjustmentService.name);
  private readonly ADJUSTMENT_THRESHOLD_PERCENT = 10;
  private readonly DISMISSAL_WINDOW_DAYS = 30;
  private readonly MONTHS_TO_ANALYZE = 12;

  constructor(
    @InjectRepository(ExpensePlan)
    private readonly expensePlanRepository: Repository<ExpensePlan>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  /**
   * Calculate the weighted monthly average spending for a category.
   * Uses the same algorithm as SuggestionGeneratorService.
   */
  async calculateCategorySpending(
    userId: number,
    categoryId: number,
    monthsToAnalyze: number = this.MONTHS_TO_ANALYZE,
  ): Promise<CategorySpendingResult> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsToAnalyze);

    const transactions = await this.transactionRepository.find({
      where: {
        user: { id: userId },
        category: { id: categoryId },
        type: 'expense',
        executionDate: MoreThanOrEqual(startDate),
      },
      order: { executionDate: 'ASC' },
    });

    if (transactions.length === 0) {
      return {
        weightedMonthlyAverage: 0,
        transactionCount: 0,
        totalSpending: 0,
        spanMonths: 0,
      };
    }

    // Calculate total spending (use absolute values)
    const totalSpending = transactions.reduce(
      (sum, tx) => sum + Math.abs(Number(tx.amount)),
      0,
    );

    // Calculate span in months
    const dates = transactions
      .filter((tx) => tx.executionDate)
      .map((tx) => new Date(tx.executionDate!).getTime());
    const firstDate = Math.min(...dates);
    const lastDate = Math.max(...dates);
    const spanMs = lastDate - firstDate;
    const spanMonths = Math.max(spanMs / (1000 * 60 * 60 * 24 * 30), 1); // At least 1 month

    // Weighted monthly average
    const weightedMonthlyAverage = totalSpending / spanMonths;

    return {
      weightedMonthlyAverage: Math.round(weightedMonthlyAverage * 100) / 100,
      transactionCount: transactions.length,
      totalSpending: Math.round(totalSpending * 100) / 100,
      spanMonths: Math.round(spanMonths * 100) / 100,
    };
  }

  /**
   * Check if a plan needs an adjustment suggestion based on actual spending.
   */
  async detectAdjustmentNeeded(
    plan: ExpensePlan,
  ): Promise<AdjustmentResult | null> {
    // Skip plans that shouldn't be reviewed
    if (!plan.categoryId) {
      return null;
    }

    if (plan.status !== 'active') {
      return null;
    }

    const spending = await this.calculateCategorySpending(
      plan.userId,
      plan.categoryId,
    );

    if (spending.transactionCount === 0) {
      return null;
    }

    const currentContribution = Number(plan.monthlyContribution);
    const actualSpending = spending.weightedMonthlyAverage;

    // Calculate percent difference
    const percentChange =
      ((actualSpending - currentContribution) / currentContribution) * 100;

    // Check if outside threshold
    if (Math.abs(percentChange) < this.ADJUSTMENT_THRESHOLD_PERCENT) {
      return null;
    }

    return {
      suggestedAmount: actualSpending,
      currentAmount: currentContribution,
      percentChange: Math.round(percentChange * 100) / 100,
      reason: percentChange > 0 ? 'spending_increased' : 'spending_decreased',
    };
  }

  /**
   * Review a single plan and update its adjustment suggestion if needed.
   * Returns true if the plan was updated, false otherwise.
   */
  async reviewPlan(plan: ExpensePlan): Promise<boolean> {
    // Check if recently dismissed
    if (plan.adjustmentDismissedAt) {
      const daysSinceDismissal = this.daysBetween(
        plan.adjustmentDismissedAt,
        new Date(),
      );
      if (daysSinceDismissal < this.DISMISSAL_WINDOW_DAYS) {
        return false;
      }
    }

    const adjustment = await this.detectAdjustmentNeeded(plan);

    // If no adjustment needed but there's an existing suggestion, clear it
    if (!adjustment && plan.suggestedMonthlyContribution !== null) {
      plan.suggestedMonthlyContribution = null;
      plan.suggestedAdjustmentPercent = null;
      plan.adjustmentReason = null;
      plan.adjustmentSuggestedAt = null;
      await this.expensePlanRepository.save(plan);
      this.logger.log(
        `Cleared outdated adjustment suggestion for plan ${plan.id} (${plan.name})`,
      );
      return true;
    }

    // If adjustment needed, set suggestion fields
    if (adjustment) {
      plan.suggestedMonthlyContribution = adjustment.suggestedAmount;
      plan.suggestedAdjustmentPercent = adjustment.percentChange;
      plan.adjustmentReason = adjustment.reason;
      plan.adjustmentSuggestedAt = new Date();
      // Clear dismissed timestamp when new suggestion is created
      plan.adjustmentDismissedAt = null;
      await this.expensePlanRepository.save(plan);
      this.logger.log(
        `Suggested adjustment for plan ${plan.id} (${plan.name}): ${adjustment.currentAmount} → ${adjustment.suggestedAmount} (${adjustment.percentChange}%)`,
      );
      return true;
    }

    return false;
  }

  /**
   * Review all active plans for a user and update adjustment suggestions.
   */
  async reviewAllPlansForUser(userId: number): Promise<ReviewSummary> {
    const plans = await this.expensePlanRepository.find({
      where: {
        userId,
        status: 'active',
      },
    });

    let newSuggestions = 0;
    let clearedSuggestions = 0;

    for (const plan of plans) {
      // Skip plans without category
      if (!plan.categoryId) {
        continue;
      }

      const hadSuggestion = plan.suggestedMonthlyContribution !== null;
      const updated = await this.reviewPlan(plan);

      if (updated) {
        if (plan.suggestedMonthlyContribution !== null) {
          newSuggestions++;
        } else if (hadSuggestion) {
          clearedSuggestions++;
        }
      }
    }

    this.logger.log(
      `Reviewed ${plans.length} plans for user ${userId}: ${newSuggestions} new suggestions, ${clearedSuggestions} cleared`,
    );

    return {
      plansReviewed: plans.length,
      newSuggestions,
      clearedSuggestions,
    };
  }

  /**
   * Clear adjustment suggestion for a plan.
   */
  async clearSuggestion(planId: number, userId: number): Promise<void> {
    const plan = await this.expensePlanRepository.findOne({
      where: { id: planId, userId },
    });

    if (!plan) {
      return;
    }

    plan.suggestedMonthlyContribution = null;
    plan.suggestedAdjustmentPercent = null;
    plan.adjustmentReason = null;
    plan.adjustmentSuggestedAt = null;

    await this.expensePlanRepository.save(plan);
  }

  /**
   * Accept an adjustment suggestion and update the plan's monthly contribution.
   */
  async acceptAdjustment(
    planId: number,
    userId: number,
    customAmount?: number,
  ): Promise<ExpensePlan> {
    const plan = await this.expensePlanRepository.findOne({
      where: { id: planId, userId },
    });

    if (!plan) {
      throw new Error(`Plan ${planId} not found for user ${userId}`);
    }

    // Use custom amount or suggested amount
    const newAmount = customAmount ?? plan.suggestedMonthlyContribution;

    if (newAmount === null || newAmount === undefined) {
      throw new Error(`No adjustment suggestion to accept for plan ${planId}`);
    }

    // Update the monthly contribution
    plan.monthlyContribution = newAmount;
    plan.contributionSource = 'calculated';

    // Clear the suggestion fields
    plan.suggestedMonthlyContribution = null;
    plan.suggestedAdjustmentPercent = null;
    plan.adjustmentReason = null;
    plan.adjustmentSuggestedAt = null;
    plan.adjustmentDismissedAt = null;

    const saved = await this.expensePlanRepository.save(plan);
    this.logger.log(
      `Accepted adjustment for plan ${planId}: new contribution = ${newAmount}`,
    );

    return saved;
  }

  /**
   * Dismiss an adjustment suggestion.
   */
  async dismissAdjustment(
    planId: number,
    userId: number,
  ): Promise<ExpensePlan> {
    const plan = await this.expensePlanRepository.findOne({
      where: { id: planId, userId },
    });

    if (!plan) {
      throw new Error(`Plan ${planId} not found for user ${userId}`);
    }

    // Clear suggestion fields but set dismissed timestamp
    plan.suggestedMonthlyContribution = null;
    plan.suggestedAdjustmentPercent = null;
    plan.adjustmentReason = null;
    plan.adjustmentSuggestedAt = null;
    plan.adjustmentDismissedAt = new Date();

    const saved = await this.expensePlanRepository.save(plan);
    this.logger.log(`Dismissed adjustment for plan ${planId}`);

    return saved;
  }

  private daysBetween(date1: Date, date2: Date): number {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(
      Math.abs(
        (new Date(date2).getTime() - new Date(date1).getTime()) / oneDay,
      ),
    );
  }
}
