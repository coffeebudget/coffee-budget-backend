import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExpensePlan } from './entities/expense-plan.entity';
import { ExpensePlanTransaction } from './entities/expense-plan-transaction.entity';
import { EventPublisherService } from '../shared/services/event-publisher.service';

export interface CreateExpensePlanDto {
  name: string;
  description?: string;
  icon?: string;
  planType: ExpensePlan['planType'];
  priority?: ExpensePlan['priority'];
  categoryId?: number;
  autoTrackCategory?: boolean;
  targetAmount: number;
  monthlyContribution: number;
  contributionSource?: ExpensePlan['contributionSource'];
  frequency: ExpensePlan['frequency'];
  frequencyYears?: number;
  dueMonth?: number;
  dueDay?: number;
  targetDate?: Date | string;
  seasonalMonths?: number[];
  autoCalculate?: boolean;
  rolloverSurplus?: boolean;
  initialBalanceSource?: ExpensePlan['initialBalanceSource'];
  initialBalanceCustom?: number;
}

export interface UpdateExpensePlanDto {
  name?: string;
  description?: string;
  icon?: string;
  planType?: ExpensePlan['planType'];
  priority?: ExpensePlan['priority'];
  categoryId?: number;
  autoTrackCategory?: boolean;
  targetAmount?: number;
  monthlyContribution?: number;
  contributionSource?: ExpensePlan['contributionSource'];
  frequency?: ExpensePlan['frequency'];
  frequencyYears?: number;
  dueMonth?: number;
  dueDay?: number;
  targetDate?: Date | string;
  seasonalMonths?: number[];
  status?: ExpensePlan['status'];
  autoCalculate?: boolean;
  rolloverSurplus?: boolean;
}

export interface MonthlyDepositSummary {
  totalMonthlyDeposit: number;
  planCount: number;
  fullyFundedCount: number;
  behindScheduleCount: number;
  byType: {
    fixed_monthly: { total: number; plans: any[] };
    sinking_funds: { total: number; plans: any[] };
    seasonal: { total: number; plans: any[] };
    goals: { total: number; plans: any[] };
    emergency: { total: number; plans: any[] };
  };
}

export interface TimelineEntry {
  date: Date;
  planId: number;
  planName: string;
  icon: string | null;
  amount: number;
  currentBalance: number;
  status: 'funded' | 'on_track' | 'behind';
  monthsAway: number;
}

@Injectable()
export class ExpensePlansService {
  constructor(
    @InjectRepository(ExpensePlan)
    private readonly expensePlanRepository: Repository<ExpensePlan>,
    @InjectRepository(ExpensePlanTransaction)
    private readonly expensePlanTransactionRepository: Repository<ExpensePlanTransaction>,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND ALL
  // ═══════════════════════════════════════════════════════════════════════════

  async findAllByUser(userId: number): Promise<ExpensePlan[]> {
    return this.expensePlanRepository.find({
      where: { userId },
      relations: ['category'],
      order: { priority: 'ASC', name: 'ASC' },
    });
  }

  async findActiveByUser(userId: number): Promise<ExpensePlan[]> {
    return this.expensePlanRepository.find({
      where: { userId, status: 'active' },
      relations: ['category'],
      order: { priority: 'ASC', name: 'ASC' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND ONE
  // ═══════════════════════════════════════════════════════════════════════════

  async findOne(id: number, userId: number): Promise<ExpensePlan> {
    const plan = await this.expensePlanRepository.findOne({
      where: { id, userId },
      relations: ['category'],
    });

    if (!plan) {
      throw new NotFoundException(`Expense plan with ID ${id} not found`);
    }

    return plan;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE
  // ═══════════════════════════════════════════════════════════════════════════

  async create(userId: number, dto: CreateExpensePlanDto): Promise<ExpensePlan> {
    const plan = this.expensePlanRepository.create({
      ...dto,
      userId,
      currentBalance: 0,
      status: 'active',
    });

    return this.expensePlanRepository.save(plan);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  async update(id: number, userId: number, dto: UpdateExpensePlanDto): Promise<ExpensePlan> {
    const plan = await this.findOne(id, userId);

    Object.assign(plan, dto);

    return this.expensePlanRepository.save(plan);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════════════════════

  async delete(id: number, userId: number): Promise<void> {
    const plan = await this.findOne(id, userId);
    await this.expensePlanRepository.remove(plan);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTRIBUTE
  // ═══════════════════════════════════════════════════════════════════════════

  async contribute(
    id: number,
    userId: number,
    amount: number,
    note?: string,
    transactionId?: number,
    isAutomatic: boolean = false,
  ): Promise<ExpensePlanTransaction> {
    const plan = await this.findOne(id, userId);

    const newBalance = Number(plan.currentBalance) + amount;

    const planTransaction = await this.expensePlanTransactionRepository.save({
      expensePlanId: plan.id,
      type: 'contribution' as const,
      amount,
      date: new Date(),
      balanceAfter: newBalance,
      transactionId: transactionId || null,
      note: note || null,
      isAutomatic,
    });

    plan.currentBalance = newBalance;
    plan.lastFundedDate = new Date();
    await this.expensePlanRepository.save(plan);

    return planTransaction;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WITHDRAW
  // ═══════════════════════════════════════════════════════════════════════════

  async withdraw(
    id: number,
    userId: number,
    amount: number,
    note?: string,
    transactionId?: number,
    isAutomatic: boolean = false,
  ): Promise<ExpensePlanTransaction> {
    const plan = await this.findOne(id, userId);

    if (Number(plan.currentBalance) < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    const newBalance = Number(plan.currentBalance) - amount;

    const planTransaction = await this.expensePlanTransactionRepository.save({
      expensePlanId: plan.id,
      type: 'withdrawal' as const,
      amount: -amount,
      date: new Date(),
      balanceAfter: newBalance,
      transactionId: transactionId || null,
      note: note || null,
      isAutomatic,
    });

    plan.currentBalance = newBalance;
    await this.expensePlanRepository.save(plan);

    return planTransaction;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET TRANSACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async getTransactions(id: number, userId: number): Promise<ExpensePlanTransaction[]> {
    // Verify ownership
    await this.findOne(id, userId);

    return this.expensePlanTransactionRepository.find({
      where: { expensePlanId: id },
      relations: ['transaction'],
      order: { date: 'DESC', createdAt: 'DESC' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  async getMonthlyDepositSummary(userId: number): Promise<MonthlyDepositSummary> {
    const plans = await this.expensePlanRepository.find({
      where: { userId, status: 'active' },
      relations: ['category'],
    });

    const byType: MonthlyDepositSummary['byType'] = {
      fixed_monthly: { total: 0, plans: [] },
      sinking_funds: { total: 0, plans: [] },
      seasonal: { total: 0, plans: [] },
      goals: { total: 0, plans: [] },
      emergency: { total: 0, plans: [] },
    };

    let totalMonthlyDeposit = 0;
    let fullyFundedCount = 0;
    let behindScheduleCount = 0;

    for (const plan of plans) {
      const contribution = Number(plan.monthlyContribution);
      totalMonthlyDeposit += contribution;

      const planSummary = {
        id: plan.id,
        name: plan.name,
        icon: plan.icon,
        monthlyContribution: contribution,
        targetAmount: Number(plan.targetAmount),
        currentBalance: Number(plan.currentBalance),
        progress: (Number(plan.currentBalance) / Number(plan.targetAmount)) * 100,
        nextDueDate: plan.nextDueDate,
      };

      // Track funding status
      if (Number(plan.currentBalance) >= Number(plan.targetAmount)) {
        fullyFundedCount++;
      }

      // Categorize by type
      switch (plan.planType) {
        case 'fixed_monthly':
          byType.fixed_monthly.total += contribution;
          byType.fixed_monthly.plans.push(planSummary);
          break;
        case 'yearly_fixed':
        case 'yearly_variable':
        case 'multi_year':
          byType.sinking_funds.total += contribution;
          byType.sinking_funds.plans.push(planSummary);
          break;
        case 'seasonal':
          byType.seasonal.total += contribution;
          byType.seasonal.plans.push(planSummary);
          break;
        case 'goal':
          byType.goals.total += contribution;
          byType.goals.plans.push(planSummary);
          break;
        case 'emergency_fund':
          byType.emergency.total += contribution;
          byType.emergency.plans.push(planSummary);
          break;
      }
    }

    return {
      totalMonthlyDeposit,
      planCount: plans.length,
      fullyFundedCount,
      behindScheduleCount,
      byType,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: CALCULATION ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate the monthly contribution needed for a plan based on its configuration
   */
  calculateMonthlyContribution(plan: ExpensePlan): number {
    // If manually set, return the manual value
    if (plan.contributionSource === 'manual') {
      return Number(plan.monthlyContribution);
    }

    const targetAmount = Number(plan.targetAmount);
    const currentBalance = Number(plan.currentBalance);

    switch (plan.frequency) {
      case 'monthly':
        return targetAmount;

      case 'quarterly':
        return targetAmount / 3;

      case 'yearly':
        return targetAmount / 12;

      case 'multi_year':
        const totalMonths = (plan.frequencyYears || 1) * 12;
        return targetAmount / totalMonths;

      case 'seasonal':
        // Spread over non-seasonal months
        const seasonalMonthCount = plan.seasonalMonths?.length || 0;
        const savingMonths = 12 - seasonalMonthCount;
        return savingMonths > 0 ? targetAmount / savingMonths : targetAmount / 12;

      case 'one_time':
        // Calculate based on remaining time and amount needed
        const dueDate = plan.targetDate ? new Date(plan.targetDate) : null;
        if (!dueDate) {
          return targetAmount / 12; // Default to yearly if no date
        }
        const monthsRemaining = this.monthsBetween(new Date(), dueDate);
        const amountNeeded = targetAmount - currentBalance;
        return monthsRemaining > 0 ? Math.max(0, amountNeeded / monthsRemaining) : amountNeeded;

      default:
        return targetAmount / 12;
    }
  }

  /**
   * Calculate the status of a plan based on funding progress
   */
  calculateStatus(plan: ExpensePlan): 'funded' | 'almost_ready' | 'on_track' | 'behind' {
    const currentBalance = Number(plan.currentBalance);
    const targetAmount = Number(plan.targetAmount);
    const progress = currentBalance / targetAmount;

    if (progress >= 1) {
      return 'funded';
    }

    if (progress >= 0.8) {
      return 'almost_ready';
    }

    if (this.isOnTrack(plan)) {
      return 'on_track';
    }

    return 'behind';
  }

  /**
   * Check if a plan is on track to meet its target by the due date
   */
  isOnTrack(plan: ExpensePlan, targetDate?: Date): boolean {
    const dueDate = targetDate || plan.nextDueDate || this.calculateNextDueDate(plan);
    if (!dueDate) {
      return true; // No due date means we consider it on track
    }

    const monthsRemaining = this.monthsBetween(new Date(), dueDate);
    if (monthsRemaining <= 0) {
      return Number(plan.currentBalance) >= Number(plan.targetAmount);
    }

    const amountNeeded = Number(plan.targetAmount) - Number(plan.currentBalance);
    const requiredMonthly = amountNeeded / monthsRemaining;

    // 10% tolerance
    return requiredMonthly <= Number(plan.monthlyContribution) * 1.1;
  }

  /**
   * Calculate the next due date for a plan based on its frequency
   */
  calculateNextDueDate(plan: ExpensePlan): Date | null {
    const today = new Date();

    switch (plan.frequency) {
      case 'one_time':
        return plan.targetDate ? new Date(plan.targetDate) : null;

      case 'monthly':
        if (plan.dueDay) {
          const nextDate = new Date(today.getFullYear(), today.getMonth(), plan.dueDay);
          if (nextDate <= today) {
            nextDate.setMonth(nextDate.getMonth() + 1);
          }
          return nextDate;
        }
        return null;

      case 'quarterly':
        if (plan.dueDay) {
          const currentQuarter = Math.floor(today.getMonth() / 3);
          let nextQuarterMonth = (currentQuarter + 1) * 3;
          if (nextQuarterMonth > 11) {
            nextQuarterMonth = 0;
          }
          const nextDate = new Date(
            nextQuarterMonth === 0 ? today.getFullYear() + 1 : today.getFullYear(),
            nextQuarterMonth,
            plan.dueDay,
          );
          return nextDate;
        }
        return null;

      case 'yearly':
        if (plan.dueMonth && plan.dueDay) {
          const month = plan.dueMonth - 1; // Convert to 0-indexed
          let nextDate = new Date(today.getFullYear(), month, plan.dueDay);
          if (nextDate <= today) {
            nextDate = new Date(today.getFullYear() + 1, month, plan.dueDay);
          }
          return nextDate;
        }
        return null;

      case 'multi_year':
        if (plan.lastFundedDate && plan.frequencyYears) {
          const lastDate = new Date(plan.lastFundedDate);
          const nextDate = new Date(lastDate);
          nextDate.setFullYear(nextDate.getFullYear() + plan.frequencyYears);
          return nextDate;
        }
        return null;

      case 'seasonal':
        // Return start of next seasonal period
        if (plan.seasonalMonths && plan.seasonalMonths.length > 0) {
          const sortedMonths = [...plan.seasonalMonths].sort((a, b) => a - b);
          const currentMonth = today.getMonth() + 1; // 1-indexed

          for (const month of sortedMonths) {
            if (month > currentMonth) {
              return new Date(today.getFullYear(), month - 1, 1);
            }
          }
          // Next year's first seasonal month
          return new Date(today.getFullYear() + 1, sortedMonths[0] - 1, 1);
        }
        return null;

      default:
        return null;
    }
  }

  /**
   * Get a timeline view of upcoming expenses
   */
  async getTimelineView(userId: number, months: number = 12): Promise<TimelineEntry[]> {
    const plans = await this.expensePlanRepository.find({
      where: { userId, status: 'active' },
    });

    const timeline: TimelineEntry[] = [];
    const today = new Date();

    for (const plan of plans) {
      const dueDate = plan.nextDueDate || this.calculateNextDueDate(plan);
      if (!dueDate) continue;

      const monthsAway = this.monthsBetween(today, dueDate);
      if (monthsAway > months) continue;

      const currentBalance = Number(plan.currentBalance);
      const targetAmount = Number(plan.targetAmount);

      let status: 'funded' | 'on_track' | 'behind';
      if (currentBalance >= targetAmount) {
        status = 'funded';
      } else if (this.isOnTrack(plan, dueDate)) {
        status = 'on_track';
      } else {
        status = 'behind';
      }

      timeline.push({
        date: dueDate,
        planId: plan.id,
        planName: plan.name,
        icon: plan.icon,
        amount: targetAmount,
        currentBalance,
        status,
        monthsAway,
      });
    }

    return timeline.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Adjust the balance of an expense plan to a new amount
   */
  async adjustBalance(
    id: number,
    userId: number,
    newBalance: number,
    note?: string,
  ): Promise<ExpensePlanTransaction> {
    const plan = await this.findOne(id, userId);

    const currentBalance = Number(plan.currentBalance);
    const difference = newBalance - currentBalance;

    const planTransaction = await this.expensePlanTransactionRepository.save({
      expensePlanId: plan.id,
      type: 'adjustment' as const,
      amount: difference,
      date: new Date(),
      balanceAfter: newBalance,
      transactionId: null,
      note: note || null,
      isAutomatic: false,
    });

    plan.currentBalance = newBalance;
    await this.expensePlanRepository.save(plan);

    return planTransaction;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4: MANUAL FUNDING FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Quick fund a plan with its monthly contribution amount
   */
  async quickFund(id: number, userId: number): Promise<ExpensePlanTransaction> {
    const plan = await this.findOne(id, userId);
    const amount = Number(plan.monthlyContribution);

    return this.contribute(id, userId, amount, 'Quick fund - monthly contribution');
  }

  /**
   * Fund a plan to reach its target amount
   * Returns null if already fully funded
   */
  async fundToTarget(
    id: number,
    userId: number,
    note?: string,
  ): Promise<ExpensePlanTransaction | null> {
    const plan = await this.findOne(id, userId);

    const currentBalance = Number(plan.currentBalance);
    const targetAmount = Number(plan.targetAmount);
    const amountNeeded = targetAmount - currentBalance;

    if (amountNeeded <= 0) {
      return null; // Already fully funded or over-funded
    }

    return this.contribute(id, userId, amountNeeded, note || 'Fund to target');
  }

  /**
   * Bulk fund multiple plans at once
   */
  async bulkFund(
    userId: number,
    items: Array<{ planId: number; amount: number; note?: string }>,
  ): Promise<BulkFundResult> {
    const result: BulkFundResult = {
      successful: [],
      failed: [],
      totalFunded: 0,
    };

    for (const item of items) {
      try {
        const plan = await this.expensePlanRepository.findOne({
          where: { id: item.planId, userId },
        });

        if (!plan) {
          result.failed.push({
            planId: item.planId,
            reason: `Plan ${item.planId} not found`,
          });
          continue;
        }

        const transaction = await this.contribute(
          item.planId,
          userId,
          item.amount,
          item.note || 'Bulk funding',
        );

        result.successful.push({
          planId: item.planId,
          amount: item.amount,
          transactionId: transaction.id,
        });
        result.totalFunded += item.amount;
      } catch (error) {
        result.failed.push({
          planId: item.planId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * Quick fund all active plans with their monthly contribution amounts
   * Skips fully funded plans
   */
  async bulkQuickFund(userId: number): Promise<BulkQuickFundResult> {
    const plans = await this.expensePlanRepository.find({
      where: { userId, status: 'active' },
    });

    const result: BulkQuickFundResult = {
      successful: [],
      failed: [],
      skipped: [],
      totalFunded: 0,
    };

    for (const plan of plans) {
      const currentBalance = Number(plan.currentBalance);
      const targetAmount = Number(plan.targetAmount);

      // Skip fully funded plans
      if (currentBalance >= targetAmount) {
        result.skipped.push({
          planId: plan.id,
          reason: 'Already fully funded',
        });
        continue;
      }

      try {
        const transaction = await this.quickFund(plan.id, userId);
        result.successful.push({
          planId: plan.id,
          amount: transaction.amount,
          transactionId: transaction.id,
        });
        result.totalFunded += transaction.amount;
      } catch (error) {
        result.failed.push({
          planId: plan.id,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * Link an existing transaction to a plan transaction
   */
  async linkTransaction(
    planTransactionId: number,
    transactionId: number,
    userId: number,
  ): Promise<ExpensePlanTransaction> {
    const planTransaction = await this.expensePlanTransactionRepository.findOne({
      where: { id: planTransactionId },
    });

    if (!planTransaction) {
      throw new NotFoundException(`Plan transaction ${planTransactionId} not found`);
    }

    // Verify ownership through the expense plan
    const plan = await this.expensePlanRepository.findOne({
      where: { id: planTransaction.expensePlanId, userId },
    });

    if (!plan) {
      throw new NotFoundException(`Plan transaction ${planTransactionId} not found`);
    }

    planTransaction.transactionId = transactionId;
    return this.expensePlanTransactionRepository.save(planTransaction);
  }

  /**
   * Unlink a transaction from a plan transaction
   */
  async unlinkTransaction(
    planTransactionId: number,
    userId: number,
  ): Promise<ExpensePlanTransaction> {
    const planTransaction = await this.expensePlanTransactionRepository.findOne({
      where: { id: planTransactionId },
    });

    if (!planTransaction) {
      throw new NotFoundException(`Plan transaction ${planTransactionId} not found`);
    }

    // Verify ownership through the expense plan
    const plan = await this.expensePlanRepository.findOne({
      where: { id: planTransaction.expensePlanId, userId },
    });

    if (!plan) {
      throw new NotFoundException(`Plan transaction ${planTransactionId} not found`);
    }

    planTransaction.transactionId = null;
    return this.expensePlanTransactionRepository.save(planTransaction);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private monthsBetween(start: Date, end: Date): number {
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());
    return Math.max(1, months);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface BulkFundResult {
  successful: Array<{ planId: number; amount: number; transactionId: number }>;
  failed: Array<{ planId: number; reason: string }>;
  totalFunded: number;
}

export interface BulkQuickFundResult extends BulkFundResult {
  skipped: Array<{ planId: number; reason: string }>;
}
