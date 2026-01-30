import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExpensePlan } from './entities/expense-plan.entity';
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
  CoveragePeriodType,
  getPeriodRange,
  PeriodRange,
  VALID_COVERAGE_PERIODS,
} from './dto/coverage-period.dto';
import {
  AccountAllocationSummaryResponse,
  AccountAllocationSummary,
  FixedMonthlyPlanAllocation,
  SinkingFundPlanAllocation,
} from './dto/account-allocation-summary.dto';
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
  status: 'funded' | 'on_track' | 'behind';
  monthsAway: number;
}

@Injectable()
export class ExpensePlansService {
  constructor(
    @InjectRepository(ExpensePlan)
    private readonly expensePlanRepository: Repository<ExpensePlan>,
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
    return plans.map((plan) => this.enrichPlanWithStatus(plan));
  }

  /**
   * Get a single expense plan with calculated funding status fields.
   */
  async findOneWithStatus(
    id: number,
    userId: number,
  ): Promise<ExpensePlanWithStatusDto> {
    const plan = await this.findOne(id, userId);
    return this.enrichPlanWithStatus(plan);
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
      const amountNeeded = Number(plan.targetAmount);
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
   * Now based on time-based calculations instead of currentBalance.
   */
  private enrichPlanWithStatus(plan: ExpensePlan): ExpensePlanWithStatusDto {
    const targetAmount = Number(plan.targetAmount);
    const monthlyContribution = Number(plan.monthlyContribution);

    // For seasonal plans, use per-occurrence amount for funding calculations
    const effectiveTarget = this.getEffectiveTargetForNextDue(plan);

    // Calculate funding status (only for sinking funds)
    let fundingStatus: FundingStatus = null;
    let monthsUntilDue: number | null = null;
    let amountNeeded: number | null = null;
    let requiredMonthlyContribution: number | null = null;

    if (plan.purpose === 'sinking_fund') {
      fundingStatus = this.calculateStatus(plan);
      amountNeeded = effectiveTarget; // Use effective target for next due

      if (plan.nextDueDate) {
        monthsUntilDue = this.monthsBetween(
          new Date(),
          new Date(plan.nextDueDate),
        );
        if (monthsUntilDue > 0) {
          requiredMonthlyContribution = effectiveTarget / monthsUntilDue;
        } else {
          requiredMonthlyContribution = effectiveTarget; // Due now, need full amount
        }
      }
    }

    // Calculate expected funded amount by now (for sinking funds)
    const expectedFundedByNow = this.calculateExpectedFundedByNow(plan);

    // Fixed monthly status calculation
    let fixedMonthlyStatus: FixedMonthlyStatusDto | null = null;

    if (plan.planType === 'fixed_monthly') {
      // For fixed monthly, check if next due date has passed
      const dueDay = plan.dueDay || 1;
      const now = new Date();
      const currentDueDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        dueDay,
      );
      const isPaidThisMonth = now >= currentDueDate;

      fixedMonthlyStatus = {
        currentMonthPaymentMade: isPaidThisMonth,
        paymentDate: isPaidThisMonth ? currentDueDate : null,
      };

      // Adjust funding status for fixed monthly
      fundingStatus = isPaidThisMonth ? 'funded' : 'on_track';
    }

    // Calculate progress based on time rather than balance
    // Use effectiveTarget (per-occurrence for seasonal) for progress calculation
    const progressPercent =
      plan.purpose === 'sinking_fund' && expectedFundedByNow !== null
        ? (expectedFundedByNow / effectiveTarget) * 100
        : 0;

    // Return all plan fields plus calculated status fields
    return {
      // Spread all original plan fields
      ...plan,
      // Override numeric fields to ensure they're numbers not strings
      targetAmount,
      monthlyContribution,
      // Add calculated status fields
      fundingStatus,
      monthsUntilDue,
      amountNeeded,
      requiredMonthlyContribution,
      progressPercent,
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
    const targetAmount = Number(plan.targetAmount);
    const currentMonthly = Number(plan.monthlyContribution);
    const amountNeeded = targetAmount;

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

    // Recalculate nextDueDate if timing fields changed
    const timingFieldsChanged =
      dto.frequency !== undefined ||
      dto.dueMonth !== undefined ||
      dto.dueDay !== undefined ||
      dto.seasonalMonths !== undefined ||
      dto.targetDate !== undefined;

    let nextDueDate: Date | null | undefined = undefined;
    if (timingFieldsChanged) {
      nextDueDate = this.calculateNextDueDate(plan);
    }

    // Use update instead of save for fields managed by relations
    await this.expensePlanRepository.update(
      { id, userId },
      {
        ...restDto,
        ...(paymentAccountId !== undefined && { paymentAccountId }),
        ...(paymentAccountType !== undefined && { paymentAccountType }),
        ...(nextDueDate !== undefined && { nextDueDate }),
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
  // CALCULATION ENGINE
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
        // Calculate based on remaining time
        const dueDate = plan.targetDate ? new Date(plan.targetDate) : null;
        if (!dueDate) {
          return targetAmount / 12; // Default to yearly if no date
        }
        const monthsRemaining = this.monthsBetween(new Date(), dueDate);
        return monthsRemaining > 0
          ? Math.max(0, targetAmount / monthsRemaining)
          : targetAmount;

      default:
        return targetAmount / 12;
    }
  }

  /**
   * Get the effective target amount for the next due date.
   * For seasonal plans, this is the per-occurrence amount (targetAmount / seasonalMonths.length).
   * For other plans, this is the full targetAmount.
   */
  private getEffectiveTargetForNextDue(plan: ExpensePlan): number {
    const targetAmount = Number(plan.targetAmount);

    if (
      plan.frequency === 'seasonal' &&
      plan.seasonalMonths &&
      plan.seasonalMonths.length > 0
    ) {
      // For seasonal plans, targetAmount is the yearly total
      // Divide by number of occurrences to get per-occurrence amount
      return targetAmount / plan.seasonalMonths.length;
    }

    return targetAmount;
  }

  /**
   * Calculate the status of a plan based on contribution rate vs required rate.
   * No longer depends on currentBalance.
   */
  calculateStatus(
    plan: ExpensePlan,
  ): 'funded' | 'almost_ready' | 'on_track' | 'behind' {
    if (!plan.nextDueDate) {
      return 'on_track'; // No due date means we consider it on track
    }

    const monthsUntilDue = this.monthsBetween(
      new Date(),
      new Date(plan.nextDueDate),
    );

    // Use effective target (per-occurrence for seasonal plans)
    const effectiveTarget = this.getEffectiveTargetForNextDue(plan);

    // If due date is very close (less than 1 month), check if almost ready
    if (monthsUntilDue <= 1) {
      // Check if configured contribution would cover the target
      const expectedFunded = this.calculateExpectedFundedByNow(plan);
      if (expectedFunded !== null && expectedFunded >= effectiveTarget * 0.8) {
        return expectedFunded >= effectiveTarget ? 'funded' : 'almost_ready';
      }
      return 'behind';
    }

    // Calculate required monthly vs configured monthly
    const requiredMonthly = effectiveTarget / monthsUntilDue;
    const configuredMonthly = Number(plan.monthlyContribution);

    // 10% tolerance
    if (configuredMonthly >= requiredMonthly * 0.9) {
      // Check if almost ready (more than 80% of time elapsed)
      const expectedFunded = this.calculateExpectedFundedByNow(plan);
      if (expectedFunded !== null && expectedFunded >= effectiveTarget * 0.8) {
        return 'almost_ready';
      }
      return 'on_track';
    }

    return 'behind';
  }

  /**
   * Check if a plan is on track to meet its target by the due date.
   * Based on contribution rate comparison.
   */
  isOnTrack(plan: ExpensePlan, targetDate?: Date): boolean {
    const dueDate =
      targetDate || plan.nextDueDate || this.calculateNextDueDate(plan);
    if (!dueDate) {
      return true; // No due date means we consider it on track
    }

    const monthsRemaining = this.monthsBetween(new Date(), dueDate);
    if (monthsRemaining <= 0) {
      return true; // Can't determine without balance tracking
    }

    const targetAmount = Number(plan.targetAmount);
    const requiredMonthly = targetAmount / monthsRemaining;

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
        // For multi-year without lastFundedDate, use targetDate or calculate from creation
        if (plan.targetDate) {
          return new Date(plan.targetDate);
        }
        return null;

      case 'seasonal':
        // Return next seasonal period, using dueDay if set
        if (plan.seasonalMonths && plan.seasonalMonths.length > 0) {
          const sortedMonths = [...plan.seasonalMonths].sort((a, b) => a - b);
          const currentMonth = today.getMonth() + 1; // 1-indexed
          const day = plan.dueDay || 1; // Use dueDay if set, otherwise 1st of month

          // Check if current month is seasonal and due date hasn't passed yet
          if (sortedMonths.includes(currentMonth)) {
            const currentMonthDue = new Date(today.getFullYear(), currentMonth - 1, day);
            if (currentMonthDue > today) {
              return currentMonthDue;
            }
          }

          // Find next seasonal month after current month
          for (const month of sortedMonths) {
            if (month > currentMonth) {
              return new Date(today.getFullYear(), month - 1, day);
            }
          }
          // Next year's first seasonal month
          return new Date(today.getFullYear() + 1, sortedMonths[0] - 1, day);
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

      const targetAmount = Number(plan.targetAmount);

      let status: 'funded' | 'on_track' | 'behind';
      if (this.isOnTrack(plan, dueDate)) {
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
        status,
        monthsAway,
      });
    }

    return timeline.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COVERAGE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get coverage summary for expense plans over a configurable period.
   * Shows which bank accounts have sufficient funds to cover upcoming expenses.
   *
   * @param userId - The user ID
   * @param periodType - The period type (defaults to 'next_30_days')
   */
  async getCoverageSummary(
    userId: number,
    periodType: CoveragePeriodType = 'next_30_days',
  ): Promise<CoverageSummaryResponse> {
    // Validate and get period range
    const validPeriod = VALID_COVERAGE_PERIODS.includes(periodType)
      ? periodType
      : 'next_30_days';
    const period = getPeriodRange(validPeriod);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const periodStart = new Date(period.start);
    periodStart.setHours(0, 0, 0, 0);
    const periodEnd = new Date(period.end);
    periodEnd.setHours(23, 59, 59, 999);

    // Get ALL active expense plans (not filtered by nextDueDate anymore)
    const plans = await this.expensePlanRepository.find({
      where: {
        userId,
        status: 'active',
      },
      relations: ['paymentAccount'],
    });

    // Calculate obligation for each plan in the period
    // Store plan + obligation data together
    interface PlanWithObligation {
      plan: ExpensePlan;
      obligation: {
        amount: number;
        hasObligation: boolean;
        occurrences: number;
      };
    }

    const plansWithObligations: PlanWithObligation[] = plans.map((plan) => ({
      plan,
      obligation: this.calculateObligationForPeriod(
        plan,
        periodStart,
        periodEnd,
      ),
    }));

    // Filter to only plans with obligations in this period
    const upcomingPlans = plansWithObligations.filter(
      (po) => po.obligation.hasObligation,
    );

    // Get all user's bank accounts
    const bankAccounts = await this.bankAccountRepository.find({
      where: { user: { id: userId } },
    });

    // Group plans by account
    const plansByAccountId = new Map<
      number | 'unassigned',
      PlanWithObligation[]
    >();

    for (const po of upcomingPlans) {
      const key = po.plan.paymentAccountId ?? 'unassigned';
      if (!plansByAccountId.has(key)) {
        plansByAccountId.set(key, []);
      }
      plansByAccountId.get(key)!.push(po);
    }

    // Calculate coverage for each account that has plans linked
    const accountCoverages: AccountCoverage[] = [];

    for (const account of bankAccounts) {
      const accountPlans = plansByAccountId.get(account.id) || [];

      // Only include accounts that have upcoming plans
      if (accountPlans.length === 0) continue;

      // Use the calculated obligation amounts instead of getUpcomingAmount
      const upcomingTotal = accountPlans.reduce(
        (sum, po) => sum + po.obligation.amount,
        0,
      );
      const currentBalance = Number(account.balance);
      const projectedBalance = currentBalance - upcomingTotal;
      const hasShortfall = projectedBalance < 0;
      const shortfallAmount = hasShortfall ? Math.abs(projectedBalance) : 0;

      // Sort plans by due date (soonest first)
      const sortedPlans = [...accountPlans].sort((a, b) => {
        const dateA = a.plan.nextDueDate
          ? new Date(a.plan.nextDueDate).getTime()
          : 0;
        const dateB = b.plan.nextDueDate
          ? new Date(b.plan.nextDueDate).getTime()
          : 0;
        return dateA - dateB;
      });

      // Calculate plans at risk (using obligation amounts)
      const plansAtRisk: PlanAtRisk[] = hasShortfall
        ? sortedPlans.map((po) => ({
            id: po.plan.id,
            name: po.plan.name,
            amount: po.obligation.amount,
            nextDueDate: po.plan.nextDueDate
              ? new Date(po.plan.nextDueDate).toISOString().split('T')[0]
              : null,
            daysUntilDue: po.plan.nextDueDate
              ? this.daysBetween(today, new Date(po.plan.nextDueDate))
              : 0,
            icon: po.plan.icon,
            obligationType: this.getObligationType(po.plan),
          }))
        : [];

      // Determine balance source from GoCardless integration
      const balanceSource = account.gocardlessAccountId
        ? 'gocardless'
        : 'manual';

      accountCoverages.push({
        accountId: account.id,
        accountName: account.name,
        institution: null, // BankAccount doesn't have institution field
        currentBalance,
        balanceSource,
        balanceLastUpdated: null, // TODO: Track balance update timestamps
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
        (sum, po) => sum + po.obligation.amount,
        0,
      ),
      plans: unassignedPlans.map((po) => ({
        id: po.plan.id,
        name: po.plan.name,
        amount: po.obligation.amount,
        nextDueDate: po.plan.nextDueDate
          ? new Date(po.plan.nextDueDate).toISOString().split('T')[0]
          : null,
        daysUntilDue: po.plan.nextDueDate
          ? this.daysBetween(today, new Date(po.plan.nextDueDate))
          : 0,
        icon: po.plan.icon,
        obligationType: this.getObligationType(po.plan),
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
      period,
      accounts: accountCoverages,
      unassignedPlans: unassignedSummary,
      overallStatus,
      totalShortfall,
      accountsWithShortfall,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNT ALLOCATION SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get account allocation summary showing what each account should hold TODAY.
   *
   * This answers the question: "How much should my account have right now?"
   *
   * For fixed_monthly plans: requiredToday = targetAmount (full payment ready)
   * For sinking funds: requiredToday = expectedFundedByNow (savings progress)
   *
   * Sum per account = totalRequiredToday
   * Compare to currentBalance = shortfall/surplus
   *
   * @param userId - The user ID
   * @param periodType - The period type (defaults to 'this_month' for allocation view)
   */
  async getAccountAllocationSummary(
    userId: number,
    periodType: CoveragePeriodType = 'this_month',
  ): Promise<AccountAllocationSummaryResponse> {
    // Validate and get period range
    const validPeriod = VALID_COVERAGE_PERIODS.includes(periodType)
      ? periodType
      : 'this_month';
    const period = getPeriodRange(validPeriod);

    // Get all active expense plans with payment accounts
    const plans = await this.expensePlanRepository.find({
      where: { userId, status: 'active' },
      relations: ['paymentAccount'],
    });

    // Get all user's bank accounts
    const bankAccounts = await this.bankAccountRepository.find({
      where: { user: { id: userId } },
    });

    // Group plans by account
    const plansByAccountId = new Map<number, ExpensePlan[]>();
    for (const plan of plans) {
      if (plan.paymentAccountId) {
        if (!plansByAccountId.has(plan.paymentAccountId)) {
          plansByAccountId.set(plan.paymentAccountId, []);
        }
        plansByAccountId.get(plan.paymentAccountId)!.push(plan);
      }
    }

    // Calculate allocation summary for each account that has plans
    const accountSummaries: AccountAllocationSummary[] = [];
    let totalShortfall = 0;
    let accountsWithShortfall = 0;
    let totalMonthlyContribution = 0;

    for (const account of bankAccounts) {
      const accountPlans = plansByAccountId.get(account.id);
      if (!accountPlans || accountPlans.length === 0) continue;

      const summary = this.buildAccountAllocationSummary(account, accountPlans);

      accountSummaries.push(summary);
      totalMonthlyContribution += summary.monthlyContributionTotal;

      if (summary.shortfall > 0) {
        totalShortfall += summary.shortfall;
        accountsWithShortfall++;
      }
    }

    // Determine overall status
    let overallStatus: 'healthy' | 'tight' | 'shortfall';
    if (accountsWithShortfall > 0) {
      overallStatus = 'shortfall';
    } else {
      // Check if any account is tight (surplus < 10% of required)
      const hasTight = accountSummaries.some((a) => a.healthStatus === 'tight');
      overallStatus = hasTight ? 'tight' : 'healthy';
    }

    return {
      period,
      accounts: accountSummaries,
      overallStatus,
      totalShortfall,
      accountsWithShortfall,
      totalMonthlyContribution,
    };
  }

  /**
   * Build allocation summary for a single account.
   */
  private buildAccountAllocationSummary(
    account: BankAccount,
    plans: ExpensePlan[],
  ): AccountAllocationSummary {
    const currentBalance = Number(account.balance);
    const fixedMonthlyPlans: FixedMonthlyPlanAllocation[] = [];
    const sinkingFundPlans: SinkingFundPlanAllocation[] = [];
    let fixedMonthlyTotal = 0;
    let sinkingFundTotal = 0;
    let monthlyContributionTotal = 0;

    for (const plan of plans) {
      monthlyContributionTotal += Number(plan.monthlyContribution);

      if (plan.planType === 'fixed_monthly') {
        const allocation = this.buildFixedMonthlyAllocation(plan);
        fixedMonthlyPlans.push(allocation);
        fixedMonthlyTotal += allocation.requiredToday;
      } else if (plan.purpose === 'sinking_fund') {
        const allocation = this.buildSinkingFundAllocation(plan);
        sinkingFundPlans.push(allocation);
        sinkingFundTotal += allocation.requiredToday;
      }
    }

    const totalRequiredToday = fixedMonthlyTotal + sinkingFundTotal;
    const diff = currentBalance - totalRequiredToday;
    const shortfall = diff < 0 ? Math.abs(diff) : 0;
    const surplus = diff > 0 ? diff : 0;

    // Determine health status
    let healthStatus: 'healthy' | 'tight' | 'shortfall';
    if (shortfall > 0) {
      healthStatus = 'shortfall';
    } else if (surplus < totalRequiredToday * 0.1) {
      // Less than 10% buffer is "tight"
      healthStatus = 'tight';
    } else {
      healthStatus = 'healthy';
    }

    // Determine balance source from GoCardless integration
    const balanceSource = account.gocardlessAccountId ? 'gocardless' : 'manual';

    return {
      accountId: account.id,
      accountName: account.name,
      currentBalance,
      balanceSource,
      balanceLastUpdated: null, // TODO: Track balance update timestamps
      totalRequiredToday,
      shortfall,
      surplus,
      healthStatus,
      fixedMonthlyPlans,
      fixedMonthlyTotal,
      sinkingFundPlans,
      sinkingFundTotal,
      monthlyContributionTotal,
      suggestedCatchUp: shortfall > 0 ? shortfall : null,
    };
  }

  /**
   * Build allocation details for a fixed monthly plan.
   * Required amount is the full target (payment amount).
   */
  private buildFixedMonthlyAllocation(
    plan: ExpensePlan,
  ): FixedMonthlyPlanAllocation {
    const targetAmount = Number(plan.targetAmount);

    // Without envelope tracking, we show the required amount
    // and assume the user tracks payments separately
    return {
      id: plan.id,
      name: plan.name,
      icon: plan.icon,
      requiredToday: targetAmount,
      paymentMade: false, // Can't track without envelope transactions
      status: 'pending',
    };
  }

  /**
   * Build allocation details for a sinking fund plan.
   * Required amount is the expected funded by now amount.
   */
  private buildSinkingFundAllocation(
    plan: ExpensePlan,
  ): SinkingFundPlanAllocation {
    const targetAmount = Number(plan.targetAmount);
    const monthlyContribution = Number(plan.monthlyContribution);

    // Use effective target (per-occurrence for seasonal plans)
    const effectiveTarget = this.getEffectiveTargetForNextDue(plan);

    // Calculate expected funded by now
    const expectedFundedByNow = this.calculateExpectedFundedByNow(plan);
    // If we can't calculate expected, use 0 (shouldn't contribute to required)
    const requiredToday = expectedFundedByNow ?? 0;

    const progressPercent =
      effectiveTarget > 0 ? (requiredToday / effectiveTarget) * 100 : 0;

    // Calculate months until due
    let monthsUntilDue: number | null = null;
    let nextDueDateStr: string | null = null;

    const dueDate = plan.nextDueDate
      ? new Date(plan.nextDueDate)
      : plan.targetDate
        ? new Date(plan.targetDate)
        : null;

    if (dueDate) {
      monthsUntilDue = this.monthsBetween(new Date(), dueDate);
      nextDueDateStr = dueDate.toISOString().split('T')[0];
    }

    // Determine status based on contribution rate
    const status = this.isOnTrack(plan) ? 'on_track' : 'behind';

    return {
      id: plan.id,
      name: plan.name,
      icon: plan.icon,
      requiredToday,
      targetAmount,
      monthlyContribution,
      progressPercent: Math.round(progressPercent * 10) / 10,
      status,
      nextDueDate: nextDueDateStr,
      monthsUntilDue,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

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

    // Use effective target (per-occurrence for seasonal plans)
    const effectiveTarget = this.getEffectiveTargetForNextDue(plan);

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

    // Calculate how many months are needed to save the effective target
    const monthsNeededToSave = effectiveTarget / monthlyContribution;

    // Calculate when saving should have started
    const savingStartDate = new Date(dueDate);
    savingStartDate.setMonth(
      savingStartDate.getMonth() - Math.ceil(monthsNeededToSave),
    );

    // If saving hasn't needed to start yet, expected is 0
    if (now < savingStartDate) {
      return 0;
    }

    // Calculate how many months have elapsed since saving should have started
    const monthsElapsed = this.monthsBetweenDecimal(savingStartDate, now);

    // Expected funded amount = months elapsed × monthly contribution
    // Capped at effective target (per-occurrence for seasonal)
    const expectedFundedByNow = Math.min(
      monthsElapsed * monthlyContribution,
      effectiveTarget,
    );

    return Math.round(expectedFundedByNow * 100) / 100;
  }

  /**
   * Calculate months between two dates with decimal precision.
   * Returns fractional months for more accurate calculations.
   */
  private monthsBetweenDecimal(
    start: Date | string,
    end: Date | string,
  ): number {
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
   * Determine the obligation type for a plan.
   * - 'fixed': Known exact amount (fixed_monthly, yearly_fixed)
   * - 'estimated': Amount based on historical data or estimates (yearly_variable, seasonal)
   * - 'prorated': Amount calculated as progress toward a goal (sinking funds)
   */
  private getObligationType(
    plan: ExpensePlan,
  ): 'fixed' | 'estimated' | 'prorated' {
    switch (plan.planType) {
      case 'fixed_monthly':
      case 'yearly_fixed':
        return 'fixed';
      case 'yearly_variable':
      case 'seasonal':
        return 'estimated';
      default:
        // Sinking funds and goals use prorated calculation
        return plan.purpose === 'sinking_fund' ? 'prorated' : 'fixed';
    }
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

  /**
   * Calculate the obligation amount for a plan within a specific period.
   * Returns { amount, hasObligation } where:
   * - amount: the total obligation in this period
   * - hasObligation: whether the plan has any obligation in this period
   *
   * Handles all plan types appropriately:
   * - fixed_monthly: counts occurrences in period
   * - yearly_fixed/yearly_variable: checks if due date is in period
   * - multi_year: checks if target date is in period
   * - seasonal: checks if any seasonal months fall in period
   * - emergency_fund: no periodic obligation
   * - goal: monthly contribution × months in period
   */
  calculateObligationForPeriod(
    plan: ExpensePlan,
    periodStart: Date,
    periodEnd: Date,
  ): { amount: number; hasObligation: boolean; occurrences: number } {
    switch (plan.planType) {
      case 'fixed_monthly':
        return this.calculateFixedMonthlyObligationForPeriod(
          plan,
          periodStart,
          periodEnd,
        );

      case 'yearly_fixed':
      case 'yearly_variable':
        return this.calculateYearlyObligationForPeriod(
          plan,
          periodStart,
          periodEnd,
        );

      case 'multi_year':
        return this.calculateMultiYearObligationForPeriod(
          plan,
          periodStart,
          periodEnd,
        );

      case 'seasonal':
        return this.calculateSeasonalObligationForPeriod(
          plan,
          periodStart,
          periodEnd,
        );

      case 'emergency_fund':
        // Emergency funds don't have periodic obligations
        // (they are for maintaining a buffer)
        return { amount: 0, hasObligation: false, occurrences: 0 };

      case 'goal':
        return this.calculateGoalObligationForPeriod(
          plan,
          periodStart,
          periodEnd,
        );

      default:
        // Fallback: check if nextDueDate is in period
        return this.calculateDefaultObligationForPeriod(
          plan,
          periodStart,
          periodEnd,
        );
    }
  }

  /**
   * Fixed monthly plans: count how many months fall in the period
   * and multiply by the monthly contribution.
   *
   * Note: For fixed_monthly plans, we use monthlyContribution (not targetAmount) because:
   * - Some plans track aggregated category expenses where targetAmount = yearly total
   * - The actual monthly obligation is the monthlyContribution amount
   */
  private calculateFixedMonthlyObligationForPeriod(
    plan: ExpensePlan,
    periodStart: Date,
    periodEnd: Date,
  ): { amount: number; hasObligation: boolean; occurrences: number } {
    // Use monthlyContribution as the per-occurrence amount for fixed monthly plans
    // This handles both true monthly bills and aggregated category expenses
    const monthlyAmount = Number(plan.monthlyContribution);
    const dueDay = plan.dueDay || 1;

    // Count how many payment dates fall within the period
    let occurrences = 0;
    const current = new Date(periodStart);
    current.setDate(dueDay);

    // If we're past the due day in the start month, start from next month
    if (current < periodStart) {
      current.setMonth(current.getMonth() + 1);
    }

    while (current <= periodEnd) {
      occurrences++;
      current.setMonth(current.getMonth() + 1);
    }

    return {
      amount: occurrences * monthlyAmount,
      hasObligation: occurrences > 0,
      occurrences,
    };
  }

  /**
   * Yearly plans: calculate obligation for the period.
   *
   * For spending_budget plans: These track ongoing expenses (e.g., monthly school fees).
   * The targetAmount is a yearly total, but expenses are ongoing.
   * Use monthlyContribution × months in period.
   *
   * For sinking_fund plans: These save for one-time payments (e.g., annual insurance).
   * Use targetAmount when the due date falls in the period.
   */
  private calculateYearlyObligationForPeriod(
    plan: ExpensePlan,
    periodStart: Date,
    periodEnd: Date,
  ): { amount: number; hasObligation: boolean; occurrences: number } {
    const targetAmount = Number(plan.targetAmount);
    const monthlyContribution = Number(plan.monthlyContribution);

    // For spending_budget plans, calculate monthly obligation similar to fixed_monthly
    // These are ongoing expenses where targetAmount is yearly total
    if (plan.purpose === 'spending_budget') {
      // Count how many months fall within the period
      let occurrences = 0;
      const current = new Date(periodStart);
      current.setDate(1); // Start from first of month

      while (current <= periodEnd) {
        occurrences++;
        current.setMonth(current.getMonth() + 1);
      }

      // Cap at 1 occurrence for 30-day periods (typical coverage period)
      occurrences = Math.min(occurrences, 1);

      return {
        amount: occurrences * monthlyContribution,
        hasObligation: occurrences > 0,
        occurrences,
      };
    }

    // For sinking_fund plans, check if the due date falls within the period
    // These are saving for one-time payments
    if (plan.nextDueDate) {
      const dueDate = new Date(plan.nextDueDate);
      dueDate.setHours(0, 0, 0, 0);
      if (dueDate >= periodStart && dueDate <= periodEnd) {
        return { amount: targetAmount, hasObligation: true, occurrences: 1 };
      }
    }

    // Fallback: check if dueMonth/dueDay combination falls in period
    if (plan.dueMonth !== null && plan.dueDay !== null) {
      // Check current year and next year
      for (const year of [periodStart.getFullYear(), periodEnd.getFullYear()]) {
        const dueDate = new Date(year, plan.dueMonth - 1, plan.dueDay);
        if (dueDate >= periodStart && dueDate <= periodEnd) {
          return { amount: targetAmount, hasObligation: true, occurrences: 1 };
        }
      }
    }

    return { amount: 0, hasObligation: false, occurrences: 0 };
  }

  /**
   * Multi-year plans: check if target date falls in period.
   */
  private calculateMultiYearObligationForPeriod(
    plan: ExpensePlan,
    periodStart: Date,
    periodEnd: Date,
  ): { amount: number; hasObligation: boolean; occurrences: number } {
    const targetAmount = Number(plan.targetAmount);

    // Check targetDate
    if (plan.targetDate) {
      const targetDate = new Date(plan.targetDate);
      targetDate.setHours(0, 0, 0, 0);
      if (targetDate >= periodStart && targetDate <= periodEnd) {
        return { amount: targetAmount, hasObligation: true, occurrences: 1 };
      }
    }

    // Check nextDueDate as fallback
    if (plan.nextDueDate) {
      const dueDate = new Date(plan.nextDueDate);
      dueDate.setHours(0, 0, 0, 0);
      if (dueDate >= periodStart && dueDate <= periodEnd) {
        return { amount: targetAmount, hasObligation: true, occurrences: 1 };
      }
    }

    return { amount: 0, hasObligation: false, occurrences: 0 };
  }

  /**
   * Seasonal plans: check if any seasonal months fall in the period.
   * Uses per-occurrence amount (targetAmount / seasonalMonths.length).
   */
  private calculateSeasonalObligationForPeriod(
    plan: ExpensePlan,
    periodStart: Date,
    periodEnd: Date,
  ): { amount: number; hasObligation: boolean; occurrences: number } {
    const targetAmount = Number(plan.targetAmount);
    const seasonalMonths = plan.seasonalMonths || [];

    if (seasonalMonths.length === 0) {
      return { amount: 0, hasObligation: false, occurrences: 0 };
    }

    // Calculate per-occurrence amount (targetAmount is yearly total)
    const perOccurrenceAmount = targetAmount / seasonalMonths.length;

    // Count how many seasonal months fall in the period
    let occurrences = 0;
    const current = new Date(periodStart);

    while (current <= periodEnd) {
      const month = current.getMonth() + 1; // 1-indexed
      if (seasonalMonths.includes(month)) {
        occurrences++;
      }
      current.setMonth(current.getMonth() + 1);
      current.setDate(1); // Move to first of next month
    }

    // Use per-occurrence amount (targetAmount / seasonalMonths.length)
    return {
      amount: occurrences * perOccurrenceAmount,
      hasObligation: occurrences > 0,
      occurrences,
    };
  }

  /**
   * Goal plans: calculate monthly contribution × months in period.
   */
  private calculateGoalObligationForPeriod(
    plan: ExpensePlan,
    periodStart: Date,
    periodEnd: Date,
  ): { amount: number; hasObligation: boolean; occurrences: number } {
    const monthlyContribution = Number(plan.monthlyContribution);

    // Count months in period
    const months = this.countMonthsInPeriod(periodStart, periodEnd);

    return {
      amount: months * monthlyContribution,
      hasObligation: months > 0,
      occurrences: months,
    };
  }

  /**
   * Default: check if nextDueDate is in period.
   */
  private calculateDefaultObligationForPeriod(
    plan: ExpensePlan,
    periodStart: Date,
    periodEnd: Date,
  ): { amount: number; hasObligation: boolean; occurrences: number } {
    if (!plan.nextDueDate) {
      return { amount: 0, hasObligation: false, occurrences: 0 };
    }

    const dueDate = new Date(plan.nextDueDate);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate >= periodStart && dueDate <= periodEnd) {
      return {
        amount: Number(plan.targetAmount),
        hasObligation: true,
        occurrences: 1,
      };
    }

    return { amount: 0, hasObligation: false, occurrences: 0 };
  }

  /**
   * Count the number of months (or partial months) in a period.
   */
  private countMonthsInPeriod(periodStart: Date, periodEnd: Date): number {
    const startYear = periodStart.getFullYear();
    const startMonth = periodStart.getMonth();
    const endYear = periodEnd.getFullYear();
    const endMonth = periodEnd.getMonth();

    return (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
  }
}
