import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExpensePlan } from './entities/expense-plan.entity';
import { ExpensePlanPayment } from './entities/expense-plan-payment.entity';

/**
 * Envelope balance status based on spending vs allocation
 */
export type EnvelopeBalanceStatus =
  | 'under_budget'
  | 'on_budget'
  | 'over_budget';

/**
 * Represents the envelope balance for a single expense plan
 */
export interface EnvelopeBalance {
  planId: number;
  planName: string;
  planIcon: string | null;
  purpose: 'sinking_fund' | 'spending_budget';

  // Balance components
  previousBalance: number; // Carried over from previous month
  monthlyAllocation: number; // = monthlyContribution
  actualSpending: number; // Sum of payments this month
  currentBalance: number; // previous + allocation - spending

  // Configuration
  rolloverSurplus: boolean;

  // Status
  status: EnvelopeBalanceStatus;
  utilizationPercent: number; // actualSpending / monthlyAllocation * 100
}

/**
 * Summary of all envelope balances for a user
 */
export interface EnvelopeBufferSummary {
  year: number;
  month: number;
  totalBuffer: number;
  totalPositiveBalance: number; // Sum of all positive envelope balances
  planBuffers: EnvelopeBalance[];
  byPurpose: {
    sinkingFunds: EnvelopeBalance[];
    spendingBudgets: EnvelopeBalance[];
  };
}

/**
 * EnvelopeBalanceService calculates the "envelope balance" for expense plans.
 *
 * The envelope balance represents how much money is "blocked" in each virtual
 * envelope. This is the difference between what was allocated (monthlyContribution)
 * and what was actually spent (linked payments).
 *
 * Key concepts:
 * - Sinking Funds: ALWAYS roll over surplus to next month (accumulate for future expenses)
 * - Spending Budgets: Roll over is configurable via rolloverSurplus flag
 * - currentBalance = previousBalance + monthlyAllocation - actualSpending
 */
@Injectable()
export class EnvelopeBalanceService {
  private readonly logger = new Logger(EnvelopeBalanceService.name);

  constructor(
    @InjectRepository(ExpensePlan)
    private readonly planRepository: Repository<ExpensePlan>,
    @InjectRepository(ExpensePlanPayment)
    private readonly paymentRepository: Repository<ExpensePlanPayment>,
  ) {}

  /**
   * Calculate the envelope balance for a specific expense plan and period
   */
  async calculateEnvelopeBalance(
    planId: number,
    year: number,
    month: number,
    userId: number,
  ): Promise<EnvelopeBalance> {
    // Get plan and verify ownership
    const plan = await this.planRepository.findOne({
      where: { id: planId, userId },
    });

    if (!plan) {
      throw new NotFoundException(`Expense plan ${planId} not found`);
    }

    // Get actual spending for this period
    const actualSpending = await this.getTotalSpendingForPeriod(
      planId,
      year,
      month,
    );

    // Calculate previous balance
    const previousBalance = await this.calculatePreviousBalance(
      plan,
      year,
      month,
    );

    const monthlyAllocation = Number(plan.monthlyContribution) || 0;

    // Calculate current balance
    const currentBalance = previousBalance + monthlyAllocation - actualSpending;

    // Calculate utilization
    const utilizationPercent =
      monthlyAllocation > 0
        ? Math.round((actualSpending / monthlyAllocation) * 100 * 10) / 10
        : 0;

    // Determine status
    let status: EnvelopeBalanceStatus;
    if (utilizationPercent < 90) {
      status = 'under_budget';
    } else if (utilizationPercent <= 100) {
      status = 'on_budget';
    } else {
      status = 'over_budget';
    }

    return {
      planId: plan.id,
      planName: plan.name,
      planIcon: plan.icon,
      purpose: plan.purpose,
      previousBalance,
      monthlyAllocation,
      actualSpending,
      currentBalance,
      rolloverSurplus: plan.rolloverSurplus,
      status,
      utilizationPercent,
    };
  }

  /**
   * Get total envelope buffer for all active plans
   */
  async getTotalEnvelopeBuffer(
    userId: number,
    year: number,
    month: number,
  ): Promise<EnvelopeBufferSummary> {
    const plans = await this.planRepository.find({
      where: { userId, status: 'active' },
    });

    const balances = await Promise.all(
      plans.map((p) =>
        this.calculateEnvelopeBalance(p.id, year, month, userId),
      ),
    );

    // Calculate total buffer (sum of all positive balances)
    const totalPositiveBalance = balances
      .filter((b) => b.currentBalance > 0)
      .reduce((sum, b) => sum + b.currentBalance, 0);

    // Separate by purpose
    const sinkingFunds = balances.filter((b) => b.purpose === 'sinking_fund');
    const spendingBudgets = balances.filter(
      (b) => b.purpose === 'spending_budget',
    );

    return {
      year,
      month,
      totalBuffer: totalPositiveBalance,
      totalPositiveBalance,
      planBuffers: balances,
      byPurpose: {
        sinkingFunds,
        spendingBudgets,
      },
    };
  }

  /**
   * Calculate the balance carried over from the previous month.
   *
   * For sinking funds: ALWAYS carry over (they accumulate for future expenses)
   * For spending budgets: Only carry over if rolloverSurplus is true
   *
   * This method is recursive - it calculates the previous month's balance,
   * which in turn calculates the month before that, etc.
   */
  private async calculatePreviousBalance(
    plan: ExpensePlan,
    year: number,
    month: number,
  ): Promise<number> {
    // Calculate previous period
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear--;
    }

    // Don't go back before the plan was created
    const planCreated = new Date(plan.createdAt);
    const prevPeriodDate = new Date(prevYear, prevMonth - 1, 1);

    if (prevPeriodDate < planCreated) {
      return 0; // No previous balance before plan existed
    }

    // Determine if rollover applies
    const shouldRollover =
      plan.purpose === 'sinking_fund' || plan.rolloverSurplus;

    if (!shouldRollover) {
      // Spending budgets without rollover start fresh each month
      return 0;
    }

    // Get spending for previous period
    const prevSpending = await this.getTotalSpendingForPeriod(
      plan.id,
      prevYear,
      prevMonth,
    );

    // Get balance from the month before that (recursive)
    const balanceBeforePrev = await this.calculatePreviousBalance(
      plan,
      prevYear,
      prevMonth,
    );

    const monthlyAllocation = Number(plan.monthlyContribution) || 0;

    // Previous month's balance = balance from month before + allocation - spending
    const prevBalance = balanceBeforePrev + monthlyAllocation - prevSpending;

    // Only carry over positive balances
    return Math.max(0, prevBalance);
  }

  /**
   * Get total spending (payments) for a plan in a specific period
   */
  private async getTotalSpendingForPeriod(
    planId: number,
    year: number,
    month: number,
  ): Promise<number> {
    const result = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'total')
      .where('payment.expensePlanId = :planId', { planId })
      .andWhere('payment.year = :year', { year })
      .andWhere('payment.month = :month', { month })
      .andWhere('payment.paymentType != :unlinked', { unlinked: 'unlinked' })
      .getRawOne();

    return Number(result?.total || 0);
  }
}
