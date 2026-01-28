import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { ExpensePlan } from '../expense-plans/entities/expense-plan.entity';
import { IncomePlansService } from '../income-plans/income-plans.service';
import { ExpensePlansService } from '../expense-plans/expense-plans.service';
import {
  FreeToSpendResponseDto,
  FreeToSpendStatus,
  IncomeBreakdownDto,
  IncomeSourceDto,
  ObligationsBreakdownDto,
  ObligationItemDto,
  ObligationsByTypeDto,
  DiscretionarySpendingDto,
  CategorySpendingDto,
} from './dto/free-to-spend.dto';

@Injectable()
export class FreeToSpendService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(ExpensePlan)
    private readonly expensePlanRepository: Repository<ExpensePlan>,
    private readonly incomePlansService: IncomePlansService,
    private readonly expensePlansService: ExpensePlansService,
  ) {}

  /**
   * Calculate the "Free to Spend" amount for a given month.
   * Formula: Free to Spend = Income - Obligations - Already Spent (discretionary)
   */
  async calculate(
    userId: number,
    month: string,
  ): Promise<FreeToSpendResponseDto> {
    // Parse month string (YYYY-MM)
    const [year, monthNum] = month.split('-').map(Number);
    const periodStart = new Date(year, monthNum - 1, 1);
    const periodEnd = new Date(year, monthNum, 0, 23, 59, 59, 999);

    // Get all components in parallel
    const [income, obligations, discretionarySpending] = await Promise.all([
      this.getIncome(userId, year, monthNum),
      this.getObligations(userId, periodStart, periodEnd),
      this.getDiscretionarySpending(userId, periodStart, periodEnd),
    ]);

    // Calculate free to spend
    // Use guaranteed income as the base (conservative approach)
    const freeToSpend =
      income.guaranteed - obligations.total - discretionarySpending.total;

    // Determine status based on percentage of income remaining
    const status = this.getStatus(freeToSpend, income.guaranteed);

    return {
      month,
      freeToSpend,
      status,
      income,
      obligations,
      discretionarySpending,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get income breakdown for the month using IncomePlansService
   */
  private async getIncome(
    userId: number,
    year: number,
    month: number,
  ): Promise<IncomeBreakdownDto> {
    const summary = await this.incomePlansService.getMonthlySummary(
      userId,
      year,
      month,
    );

    const breakdown: IncomeSourceDto[] = summary.plans.map((plan) => ({
      source: plan.name,
      amount: plan.currentMonthExpected,
      reliability: plan.reliability,
    }));

    return {
      total: summary.totalIncome,
      guaranteed: summary.guaranteedTotal,
      expected: summary.expectedTotal,
      uncertain: summary.uncertainTotal,
      breakdown,
    };
  }

  /**
   * Get obligations breakdown from expense plans
   * Categorizes into: bills, savings, budgets
   */
  private async getObligations(
    userId: number,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<ObligationsBreakdownDto> {
    const plans = await this.expensePlansService.findActiveByUser(userId);

    const items: ObligationItemDto[] = [];
    let totalBills = 0;
    let totalSavings = 0;
    let totalBudgets = 0;
    let totalAlreadyPaid = 0;
    let totalCommitted = 0;

    for (const plan of plans) {
      const obligation = this.expensePlansService.calculateObligationForPeriod(
        plan,
        periodStart,
        periodEnd,
      );

      if (!obligation.hasObligation) {
        continue;
      }

      // Categorize the plan type
      const type = this.categorizeExpensePlan(plan);

      // Check if already paid (look for linked transactions this period)
      const isPaid = await this.checkIfPlanPaid(
        userId,
        plan.id,
        periodStart,
        periodEnd,
      );

      // Aggregate by type
      switch (type) {
        case 'bills':
          totalBills += obligation.amount;
          break;
        case 'savings':
          totalSavings += obligation.amount;
          break;
        case 'budgets':
          totalBudgets += obligation.amount;
          break;
      }

      if (isPaid) {
        totalAlreadyPaid += obligation.amount;
      } else {
        totalCommitted += obligation.amount;
      }

      items.push({
        id: plan.id,
        name: plan.name,
        amount: obligation.amount,
        type,
        isPaid,
        icon: plan.icon,
      });
    }

    const byType: ObligationsByTypeDto = {
      bills: totalBills,
      savings: totalSavings,
      budgets: totalBudgets,
    };

    return {
      total: totalBills + totalSavings + totalBudgets,
      committed: totalCommitted,
      alreadyPaid: totalAlreadyPaid,
      byType,
      items,
    };
  }

  /**
   * Categorize expense plan into bills, savings, or budgets
   */
  private categorizeExpensePlan(
    plan: ExpensePlan,
  ): 'bills' | 'savings' | 'budgets' {
    // Use purpose field if available
    if (plan.purpose === 'spending_budget') {
      return 'budgets';
    }

    // Otherwise categorize by plan type
    switch (plan.planType) {
      case 'fixed_monthly':
      case 'yearly_fixed':
      case 'yearly_variable':
        return 'bills';
      case 'goal':
      case 'multi_year':
      case 'emergency_fund':
        return 'savings';
      case 'seasonal':
        // Seasonal can be either bills or budgets depending on priority
        return plan.priority === 'essential' ? 'bills' : 'budgets';
      default:
        return 'bills';
    }
  }

  /**
   * Check if a plan has been paid this period
   * This is a simplified check - in reality would use payment tracking
   */
  private async checkIfPlanPaid(
    userId: number,
    planId: number,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<boolean> {
    // Look for transactions linked to this expense plan
    // For now, check if there's a transaction with matching category
    const plan = await this.expensePlanRepository.findOne({
      where: { id: planId, userId },
    });

    if (!plan || !plan.categoryId) {
      return false;
    }

    // Find expense transactions in this category during the period
    const count = await this.transactionRepository.count({
      where: {
        user: { id: userId },
        category: { id: plan.categoryId },
        type: 'expense',
        executionDate: Between(periodStart, periodEnd),
      },
    });

    return count > 0;
  }

  /**
   * Get discretionary spending for the month
   * Discretionary = expenses NOT linked to expense plans or budget categories
   */
  private async getDiscretionarySpending(
    userId: number,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<DiscretionarySpendingDto> {
    // Get all expense plans to know which categories to exclude
    const plans = await this.expensePlansService.findActiveByUser(userId);
    const budgetCategoryIds = plans
      .filter((p) => p.categoryId !== null)
      .map((p) => p.categoryId);

    // Get all expense transactions for the period
    const transactions = await this.transactionRepository.find({
      where: {
        user: { id: userId },
        type: 'expense',
        executionDate: Between(periodStart, periodEnd),
      },
      relations: ['category'],
    });

    // Filter to only discretionary (not linked to expense plan categories)
    const discretionaryTransactions = transactions.filter((t) => {
      // If no category, it's discretionary
      if (!t.category) {
        return true;
      }
      // If category is in budget plans, it's NOT discretionary
      return !budgetCategoryIds.includes(t.category.id);
    });

    // Calculate total and group by category
    const categoryTotals = new Map<string, number>();
    let total = 0;

    for (const t of discretionaryTransactions) {
      const amount = Math.abs(Number(t.amount));
      total += amount;

      const categoryName = t.category?.name ?? 'Uncategorized';
      categoryTotals.set(
        categoryName,
        (categoryTotals.get(categoryName) ?? 0) + amount,
      );
    }

    // Sort categories by amount and take top 5
    const topCategories: CategorySpendingDto[] = Array.from(
      categoryTotals.entries(),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({ category, amount }));

    return {
      total,
      transactionCount: discretionaryTransactions.length,
      topCategories,
    };
  }

  /**
   * Determine status based on remaining percentage of income
   */
  private getStatus(freeToSpend: number, income: number): FreeToSpendStatus {
    if (freeToSpend < 0) {
      return 'overspent';
    }

    if (income <= 0) {
      // No income defined - return moderate as default
      return 'moderate';
    }

    const percentage = (freeToSpend / income) * 100;

    if (percentage > 25) {
      return 'comfortable';
    } else if (percentage >= 10) {
      return 'moderate';
    } else {
      return 'tight';
    }
  }
}
