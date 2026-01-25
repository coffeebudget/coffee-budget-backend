import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { ExpensePlan } from './entities/expense-plan.entity';
import { ExpensePlanTransaction } from './entities/expense-plan-transaction.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { EventPublisherService } from '../shared/services/event-publisher.service';
import { ExpensePlanDeletedEvent } from '../shared/events/expense-plan.events';
import {
  CoverageSummaryResponse,
  AccountCoverage,
  UnassignedPlanSummary,
  PlanAtRisk,
} from './dto/coverage-summary.dto';
import {
  ExpensePlanWithStatusDto,
  LongTermStatusSummary,
  PlanNeedingAttention,
  FundingStatus,
  FixedMonthlyStatusDto,
} from './dto/expense-plan-response.dto';

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
  // Payment source (optional - for coverage tracking)
  paymentAccountType?: ExpensePlan['paymentAccountType'];
  paymentAccountId?: number;
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
  // Payment source (optional - for coverage tracking)
  paymentAccountType?: ExpensePlan['paymentAccountType'];
  paymentAccountId?: number;
}

export interface MonthlyDepositSummary {
  totalMonthlyDeposit: number;
  planCount: number;
  fullyFundedCount: number;
  onTrackCount: number;
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
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND ALL
  // ═══════════════════════════════════════════════════════════════════════════

  async findAllByUser(userId: number): Promise<ExpensePlan[]> {
    return this.expensePlanRepository.find({
      where: { userId },
      relations: ['category', 'paymentAccount'],
      order: { priority: 'ASC', name: 'ASC' },
    });
  }

  async findActiveByUser(userId: number): Promise<ExpensePlan[]> {
    return this.expensePlanRepository.find({
      where: { userId, status: 'active' },
      relations: ['category', 'paymentAccount'],
      order: { priority: 'ASC', name: 'ASC' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND ONE
  // ═══════════════════════════════════════════════════════════════════════════

  async findOne(id: number, userId: number): Promise<ExpensePlan> {
    const plan = await this.expensePlanRepository.findOne({
      where: { id, userId },
      relations: ['category', 'paymentAccount'],
    });

    if (!plan) {
      throw new NotFoundException(`Expense plan with ID ${id} not found`);
    }

    return plan;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND WITH FUNDING STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all expense plans for a user with calculated funding status fields.
   * Used for UI display where progress indicators are needed.
   */
  async findAllByUserWithStatus(
    userId: number,
  ): Promise<ExpensePlanWithStatusDto[]> {
    const plans = await this.findAllByUser(userId);

    // Batch fetch current month payments for fixed_monthly plans
    const fixedMonthlyPlanIds = plans
      .filter((p) => p.planType === 'fixed_monthly')
      .map((p) => p.id);

    const currentMonthPayments =
      await this.getCurrentMonthPaymentsBatch(fixedMonthlyPlanIds);

    return plans.map((plan) =>
      this.enrichPlanWithStatus(plan, currentMonthPayments.get(plan.id)),
    );
  }

  /**
   * Get a single expense plan with calculated funding status fields.
   */
  async findOneWithStatus(
    id: number,
    userId: number,
  ): Promise<ExpensePlanWithStatusDto> {
    const plan = await this.findOne(id, userId);

    // Fetch current month payment for fixed_monthly plans
    let currentMonthPayment: { made: boolean; date: Date | null } | undefined;
    if (plan.planType === 'fixed_monthly') {
      const payments = await this.getCurrentMonthPaymentsBatch([plan.id]);
      currentMonthPayment = payments.get(plan.id);
    }

    return this.enrichPlanWithStatus(plan, currentMonthPayment);
  }

  /**
   * Get long-term sinking fund status summary for coverage section.
   * This provides an overview of all sinking funds and their funding status.
   */
  async getLongTermStatus(userId: number): Promise<LongTermStatusSummary> {
    const plans = await this.findActiveByUser(userId);

    // Filter to sinking funds only
    const sinkingFunds = plans.filter(
      (plan) => plan.purpose === 'sinking_fund',
    );

    let onTrackCount = 0;
    let behindScheduleCount = 0;
    let fundedCount = 0;
    let almostReadyCount = 0;
    let totalAmountNeeded = 0;
    const plansNeedingAttention: PlanNeedingAttention[] = [];

    for (const plan of sinkingFunds) {
      const status = this.calculateStatus(plan);
      const amountNeeded = Math.max(
        0,
        Number(plan.targetAmount) - Number(plan.currentBalance),
      );
      totalAmountNeeded += amountNeeded;

      switch (status) {
        case 'funded':
          fundedCount++;
          break;
        case 'almost_ready':
          almostReadyCount++;
          // Include in plans needing attention if due soon
          if (plan.nextDueDate) {
            const monthsUntilDue = this.monthsBetween(
              new Date(),
              new Date(plan.nextDueDate),
            );
            if (monthsUntilDue <= 2) {
              plansNeedingAttention.push(
                this.buildPlanNeedingAttention(plan, 'almost_ready'),
              );
            }
          }
          break;
        case 'on_track':
          onTrackCount++;
          break;
        case 'behind':
          behindScheduleCount++;
          plansNeedingAttention.push(
            this.buildPlanNeedingAttention(plan, 'behind'),
          );
          break;
      }
    }

    // Sort plans needing attention by urgency (months until due)
    plansNeedingAttention.sort((a, b) => a.monthsUntilDue - b.monthsUntilDue);

    return {
      totalSinkingFunds: sinkingFunds.length,
      onTrackCount,
      behindScheduleCount,
      fundedCount,
      almostReadyCount,
      totalAmountNeeded,
      plansNeedingAttention,
    };
  }

  /**
   * Enrich an expense plan with calculated funding status fields.
   */
  private enrichPlanWithStatus(
    plan: ExpensePlan,
    currentMonthPayment?: { made: boolean; date: Date | null },
  ): ExpensePlanWithStatusDto {
    const currentBalance = Number(plan.currentBalance);
    const targetAmount = Number(plan.targetAmount);
    const monthlyContribution = Number(plan.monthlyContribution);

    // Calculate funding status (only for sinking funds)
    let fundingStatus: FundingStatus = null;
    let monthsUntilDue: number | null = null;
    let amountNeeded: number | null = null;
    let requiredMonthlyContribution: number | null = null;

    if (plan.purpose === 'sinking_fund') {
      fundingStatus = this.calculateStatus(plan);
      amountNeeded = Math.max(0, targetAmount - currentBalance);

      if (plan.nextDueDate) {
        monthsUntilDue = this.monthsBetween(
          new Date(),
          new Date(plan.nextDueDate),
        );
        if (monthsUntilDue > 0 && amountNeeded > 0) {
          requiredMonthlyContribution = amountNeeded / monthsUntilDue;
        } else if (monthsUntilDue <= 0) {
          requiredMonthlyContribution = amountNeeded; // Due now, need full amount
        }
      }
    }

    const progressPercent =
      targetAmount > 0 ? (currentBalance / targetAmount) * 100 : 0;

    // Calculate expected funded amount by now
    let expectedFundedByNow = this.calculateExpectedFundedByNow(plan);
    let fundingGapFromExpected =
      expectedFundedByNow !== null
        ? Math.max(0, expectedFundedByNow - currentBalance)
        : null;

    // Fixed monthly status calculation
    let fixedMonthlyStatus: FixedMonthlyStatusDto | null = null;

    if (plan.planType === 'fixed_monthly') {
      const readyForNext = currentBalance >= targetAmount;
      fixedMonthlyStatus = {
        currentMonthPaymentMade: currentMonthPayment?.made ?? false,
        paymentDate: currentMonthPayment?.date ?? null,
        readyForNextMonth: readyForNext,
        amountShort: readyForNext
          ? null
          : Math.round((targetAmount - currentBalance) * 100) / 100,
      };

      // Override: don't show expectedFundedByNow for fixed monthly
      expectedFundedByNow = null;
      fundingGapFromExpected = null;

      // Adjust funding status for fixed monthly
      fundingStatus = currentMonthPayment?.made
        ? 'funded'
        : readyForNext
          ? 'on_track'
          : 'behind';
    }

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      icon: plan.icon,
      planType: plan.planType,
      priority: plan.priority,
      purpose: plan.purpose,
      targetAmount,
      currentBalance,
      monthlyContribution,
      frequency: plan.frequency,
      nextDueDate: plan.nextDueDate,
      status: plan.status,
      categoryId: plan.categoryId,
      paymentAccountId: plan.paymentAccountId,
      paymentAccountType: plan.paymentAccountType,
      fundingStatus,
      monthsUntilDue,
      amountNeeded,
      requiredMonthlyContribution,
      progressPercent,
      expectedFundedByNow,
      fundingGapFromExpected,
      createdAt: plan.createdAt,
      fixedMonthlyStatus,
    };
  }

  /**
   * Build a PlanNeedingAttention object from a plan.
   */
  private buildPlanNeedingAttention(
    plan: ExpensePlan,
    status: 'behind' | 'almost_ready',
  ): PlanNeedingAttention {
    const currentBalance = Number(plan.currentBalance);
    const targetAmount = Number(plan.targetAmount);
    const currentMonthly = Number(plan.monthlyContribution);
    const amountNeeded = Math.max(0, targetAmount - currentBalance);

    let monthsUntilDue = 0;
    let requiredMonthly = amountNeeded;

    if (plan.nextDueDate) {
      monthsUntilDue = this.monthsBetween(
        new Date(),
        new Date(plan.nextDueDate),
      );
      if (monthsUntilDue > 0) {
        requiredMonthly = amountNeeded / monthsUntilDue;
      }
    }

    const expectedFundedByNow = this.calculateExpectedFundedByNow(plan);
    const fundingGapFromExpected =
      expectedFundedByNow !== null
        ? Math.max(0, expectedFundedByNow - currentBalance)
        : null;

    return {
      id: plan.id,
      name: plan.name,
      icon: plan.icon,
      status,
      amountNeeded,
      monthsUntilDue,
      nextDueDate: plan.nextDueDate
        ? new Date(plan.nextDueDate).toISOString().split('T')[0]
        : null,
      requiredMonthly,
      currentMonthly,
      shortfallPerMonth: Math.max(0, requiredMonthly - currentMonthly),
      expectedFundedByNow,
      currentBalance,
      fundingGapFromExpected,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE
  // ═══════════════════════════════════════════════════════════════════════════

  async create(
    userId: number,
    dto: CreateExpensePlanDto,
  ): Promise<ExpensePlan> {
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

  async update(
    id: number,
    userId: number,
    dto: UpdateExpensePlanDto,
  ): Promise<ExpensePlan> {
    const plan = await this.findOne(id, userId);

    // Handle paymentAccountId separately due to TypeORM relation management
    // TypeORM manages the paymentAccountId through the paymentAccount relation,
    // so we need to update it via the repository directly
    const { paymentAccountId, paymentAccountType, ...restDto } = dto;

    // Apply non-relation fields
    Object.assign(plan, restDto);

    // Handle payment account fields explicitly
    if (paymentAccountId !== undefined) {
      plan.paymentAccountId = paymentAccountId;
    }
    if (paymentAccountType !== undefined) {
      plan.paymentAccountType = paymentAccountType;
    }

    // Use update instead of save for fields managed by relations
    await this.expensePlanRepository.update(
      { id, userId },
      {
        ...restDto,
        ...(paymentAccountId !== undefined && { paymentAccountId }),
        ...(paymentAccountType !== undefined && { paymentAccountType }),
      },
    );

    // Return the updated plan
    return this.findOne(id, userId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════════════════════

  async delete(id: number, userId: number): Promise<void> {
    const plan = await this.findOne(id, userId);
    await this.expensePlanRepository.remove(plan);

    // Publish event so linked suggestions can be reset to pending
    this.eventPublisher.publish(new ExpensePlanDeletedEvent(id, userId));
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

  async getTransactions(
    id: number,
    userId: number,
  ): Promise<ExpensePlanTransaction[]> {
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

  async getMonthlyDepositSummary(
    userId: number,
  ): Promise<MonthlyDepositSummary> {
    const plans = await this.expensePlanRepository.find({
      where: { userId, status: 'active' },
      relations: ['category', 'paymentAccount'],
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
    let onTrackCount = 0;
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
        progress:
          (Number(plan.currentBalance) / Number(plan.targetAmount)) * 100,
        nextDueDate: plan.nextDueDate,
      };

      // Track funding status for sinking funds
      if (plan.purpose === 'sinking_fund') {
        const fundingStatus = this.calculateStatus(plan);
        switch (fundingStatus) {
          case 'funded':
            fullyFundedCount++;
            break;
          case 'on_track':
          case 'almost_ready':
            onTrackCount++;
            break;
          case 'behind':
            behindScheduleCount++;
            break;
        }
      } else if (Number(plan.currentBalance) >= Number(plan.targetAmount)) {
        // For spending budgets, only track fully funded
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
      onTrackCount,
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
        return savingMonths > 0
          ? targetAmount / savingMonths
          : targetAmount / 12;

      case 'one_time':
        // Calculate based on remaining time and amount needed
        const dueDate = plan.targetDate ? new Date(plan.targetDate) : null;
        if (!dueDate) {
          return targetAmount / 12; // Default to yearly if no date
        }
        const monthsRemaining = this.monthsBetween(new Date(), dueDate);
        const amountNeeded = targetAmount - currentBalance;
        return monthsRemaining > 0
          ? Math.max(0, amountNeeded / monthsRemaining)
          : amountNeeded;

      default:
        return targetAmount / 12;
    }
  }

  /**
   * Calculate the status of a plan based on funding progress
   */
  calculateStatus(
    plan: ExpensePlan,
  ): 'funded' | 'almost_ready' | 'on_track' | 'behind' {
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
    const dueDate =
      targetDate || plan.nextDueDate || this.calculateNextDueDate(plan);
    if (!dueDate) {
      return true; // No due date means we consider it on track
    }

    const monthsRemaining = this.monthsBetween(new Date(), dueDate);
    if (monthsRemaining <= 0) {
      return Number(plan.currentBalance) >= Number(plan.targetAmount);
    }

    const amountNeeded =
      Number(plan.targetAmount) - Number(plan.currentBalance);
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
          const nextDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            plan.dueDay,
          );
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
            nextQuarterMonth === 0
              ? today.getFullYear() + 1
              : today.getFullYear(),
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
  async getTimelineView(
    userId: number,
    months: number = 12,
  ): Promise<TimelineEntry[]> {
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

  /**
   * Link an existing transaction to a plan transaction
   */
  async linkTransaction(
    planTransactionId: number,
    transactionId: number,
    userId: number,
  ): Promise<ExpensePlanTransaction> {
    const planTransaction = await this.expensePlanTransactionRepository.findOne(
      {
        where: { id: planTransactionId },
      },
    );

    if (!planTransaction) {
      throw new NotFoundException(
        `Plan transaction ${planTransactionId} not found`,
      );
    }

    // Verify ownership through the expense plan
    const plan = await this.expensePlanRepository.findOne({
      where: { id: planTransaction.expensePlanId, userId },
    });

    if (!plan) {
      throw new NotFoundException(
        `Plan transaction ${planTransactionId} not found`,
      );
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
    const planTransaction = await this.expensePlanTransactionRepository.findOne(
      {
        where: { id: planTransactionId },
      },
    );

    if (!planTransaction) {
      throw new NotFoundException(
        `Plan transaction ${planTransactionId} not found`,
      );
    }

    // Verify ownership through the expense plan
    const plan = await this.expensePlanRepository.findOne({
      where: { id: planTransaction.expensePlanId, userId },
    });

    if (!plan) {
      throw new NotFoundException(
        `Plan transaction ${planTransactionId} not found`,
      );
    }

    planTransaction.transactionId = null;
    return this.expensePlanTransactionRepository.save(planTransaction);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COVERAGE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get coverage summary for expense plans over the next 30 days.
   * Shows which bank accounts have sufficient funds to cover upcoming expenses.
   */
  async getCoverageSummary(userId: number): Promise<CoverageSummaryResponse> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Get all active expense plans with next due date in next 30 days
    const plans = await this.expensePlanRepository.find({
      where: {
        userId,
        status: 'active',
        nextDueDate: LessThanOrEqual(thirtyDaysFromNow),
      },
      relations: ['paymentAccount'],
    });

    // Filter only plans with due dates today or in the future
    const upcomingPlans = plans.filter((plan) => {
      if (!plan.nextDueDate) return false;
      const dueDate = new Date(plan.nextDueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= today;
    });

    // Get all user's bank accounts
    const bankAccounts = await this.bankAccountRepository.find({
      where: { user: { id: userId } },
    });

    // Group plans by account
    const plansByAccountId = new Map<number | 'unassigned', ExpensePlan[]>();

    for (const plan of upcomingPlans) {
      const key = plan.paymentAccountId ?? 'unassigned';
      if (!plansByAccountId.has(key)) {
        plansByAccountId.set(key, []);
      }
      plansByAccountId.get(key)!.push(plan);
    }

    // Calculate coverage for each account that has plans linked
    const accountCoverages: AccountCoverage[] = [];

    for (const account of bankAccounts) {
      const accountPlans = plansByAccountId.get(account.id) || [];

      // Only include accounts that have upcoming plans
      if (accountPlans.length === 0) continue;

      const upcomingTotal = accountPlans.reduce(
        (sum, p) => sum + this.getUpcomingAmount(p),
        0,
      );
      const currentBalance = Number(account.balance);
      const projectedBalance = currentBalance - upcomingTotal;
      const hasShortfall = projectedBalance < 0;
      const shortfallAmount = hasShortfall ? Math.abs(projectedBalance) : 0;

      // Sort plans by due date (soonest first)
      const sortedPlans = [...accountPlans].sort((a, b) => {
        const dateA = a.nextDueDate ? new Date(a.nextDueDate).getTime() : 0;
        const dateB = b.nextDueDate ? new Date(b.nextDueDate).getTime() : 0;
        return dateA - dateB;
      });

      // Calculate plans at risk
      const plansAtRisk: PlanAtRisk[] = hasShortfall
        ? sortedPlans.map((p) => ({
            id: p.id,
            name: p.name,
            amount: this.getUpcomingAmount(p),
            nextDueDate: p.nextDueDate
              ? new Date(p.nextDueDate).toISOString().split('T')[0]
              : null,
            daysUntilDue: p.nextDueDate
              ? this.daysBetween(today, new Date(p.nextDueDate))
              : 0,
            icon: p.icon,
          }))
        : [];

      accountCoverages.push({
        accountId: account.id,
        accountName: account.name,
        institution: null, // BankAccount doesn't have institution field
        currentBalance,
        upcomingPlansTotal: upcomingTotal,
        planCount: accountPlans.length,
        projectedBalance,
        hasShortfall,
        shortfallAmount,
        plansAtRisk,
      });
    }

    // Build unassigned plans summary
    const unassignedPlans = plansByAccountId.get('unassigned') || [];
    const unassignedSummary: UnassignedPlanSummary = {
      count: unassignedPlans.length,
      totalAmount: unassignedPlans.reduce(
        (sum, p) => sum + this.getUpcomingAmount(p),
        0,
      ),
      plans: unassignedPlans.map((p) => ({
        id: p.id,
        name: p.name,
        amount: this.getUpcomingAmount(p),
        nextDueDate: p.nextDueDate
          ? new Date(p.nextDueDate).toISOString().split('T')[0]
          : null,
        daysUntilDue: p.nextDueDate
          ? this.daysBetween(today, new Date(p.nextDueDate))
          : 0,
        icon: p.icon,
      })),
    };

    // Calculate overall status
    const totalShortfall = accountCoverages.reduce(
      (sum, a) => sum + a.shortfallAmount,
      0,
    );
    const accountsWithShortfall = accountCoverages.filter(
      (a) => a.hasShortfall,
    ).length;

    let overallStatus: 'all_covered' | 'has_shortfall' | 'no_data';
    if (accountCoverages.length === 0 && unassignedPlans.length === 0) {
      overallStatus = 'no_data';
    } else if (accountsWithShortfall > 0) {
      overallStatus = 'has_shortfall';
    } else {
      overallStatus = 'all_covered';
    }

    return {
      accounts: accountCoverages,
      unassignedPlans: unassignedSummary,
      overallStatus,
      totalShortfall,
      accountsWithShortfall,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Batch fetch current month payments for fixed_monthly plans.
   * Returns a map of planId -> payment info.
   */
  private async getCurrentMonthPaymentsBatch(
    planIds: number[],
  ): Promise<Map<number, { made: boolean; date: Date | null }>> {
    if (planIds.length === 0) return new Map();

    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );

    const withdrawals = await this.expensePlanTransactionRepository
      .createQueryBuilder('tx')
      .where('tx.expensePlanId IN (:...planIds)', { planIds })
      .andWhere('tx.type = :type', { type: 'withdrawal' })
      .andWhere('tx.date >= :start', { start: firstOfMonth })
      .andWhere('tx.date <= :end', { end: lastOfMonth })
      .orderBy('tx.date', 'DESC')
      .getMany();

    const result = new Map<number, { made: boolean; date: Date | null }>();
    for (const planId of planIds) {
      const withdrawal = withdrawals.find((w) => w.expensePlanId === planId);
      result.set(planId, {
        made: !!withdrawal,
        date: withdrawal?.date || null,
      });
    }
    return result;
  }

  /**
   * Calculate the expected funded amount by now based on when savings
   * SHOULD have started to reach the target by the due date.
   *
   * For sinking funds, this calculates backwards from the due date:
   * 1. How many months are needed to save the target at the contribution rate?
   * 2. When should saving have started?
   * 3. How many months have elapsed since then?
   * 4. Expected = elapsed months × monthly contribution
   *
   * Example: Summer vacation €4,000, €400/month, due July 2026
   * - Months needed: 4000/400 = 10 months
   * - Should have started: July - 10 = September 2025
   * - Now is January 2026, so 4-5 months elapsed
   * - Expected by now: ~€1,600-2,000
   */
  private calculateExpectedFundedByNow(plan: ExpensePlan): number | null {
    // Only calculate for sinking funds
    if (plan.purpose !== 'sinking_fund') {
      return null;
    }

    const monthlyContribution = Number(plan.monthlyContribution);
    const targetAmount = Number(plan.targetAmount);

    if (monthlyContribution <= 0 || targetAmount <= 0) {
      return null;
    }

    const now = new Date();

    // Get the due date (prefer nextDueDate, fall back to targetDate)
    const dueDate = plan.nextDueDate
      ? new Date(plan.nextDueDate)
      : plan.targetDate
        ? new Date(plan.targetDate)
        : null;

    if (!dueDate) {
      // No due date - can't calculate expected progress
      return null;
    }

    // Calculate how many months are needed to save the full target
    const monthsNeededToSave = targetAmount / monthlyContribution;

    // Calculate when saving should have started
    const savingStartDate = new Date(dueDate);
    savingStartDate.setMonth(savingStartDate.getMonth() - Math.ceil(monthsNeededToSave));

    // If saving hasn't needed to start yet, expected is 0
    if (now < savingStartDate) {
      return 0;
    }

    // Calculate how many months have elapsed since saving should have started
    const monthsElapsed = this.monthsBetweenDecimal(savingStartDate, now);

    // Expected funded amount = months elapsed × monthly contribution
    // Capped at target amount
    const expectedFundedByNow = Math.min(
      monthsElapsed * monthlyContribution,
      targetAmount,
    );

    return Math.round(expectedFundedByNow * 100) / 100;
  }

  /**
   * Calculate months between two dates with decimal precision.
   * Returns fractional months for more accurate calculations.
   */
  private monthsBetweenDecimal(start: Date | string, end: Date | string): number {
    const startDate = new Date(start);
    const endDate = new Date(end);

    const yearsDiff = endDate.getFullYear() - startDate.getFullYear();
    const monthsDiff = endDate.getMonth() - startDate.getMonth();
    const daysDiff = endDate.getDate() - startDate.getDate();

    // Calculate total months with day fraction
    const totalMonths = yearsDiff * 12 + monthsDiff + daysDiff / 30;

    return Math.max(0, totalMonths);
  }

  private daysBetween(start: Date | string, end: Date | string): number {
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(0, 0, 0, 0);
    const diffTime = endDate.getTime() - startDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private monthsBetween(start: Date | string, end: Date | string): number {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const months =
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth());
    return Math.max(1, months);
  }

  /**
   * Get the upcoming amount due for a plan based on its frequency.
   * For monthly plans, this is the monthlyContribution.
   * For other frequencies, this is the targetAmount (what's due on the due date).
   */
  private getUpcomingAmount(plan: ExpensePlan): number {
    switch (plan.frequency) {
      case 'monthly':
        // Monthly plans: the upcoming expense is the monthly contribution
        return Number(plan.monthlyContribution);
      case 'quarterly':
      case 'yearly':
      case 'multi_year':
      case 'seasonal':
      case 'one_time':
      default:
        // Other frequencies: the upcoming expense is the target amount
        return Number(plan.targetAmount);
    }
  }
}
