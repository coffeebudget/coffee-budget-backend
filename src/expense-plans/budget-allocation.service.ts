import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { MonthlyBudget } from './entities/monthly-budget.entity';
import { ExpensePlan } from './entities/expense-plan.entity';
import { Transaction } from '../transactions/transaction.entity';
import {
  AllocationStateDto,
  IncomeBreakdownDto,
  PlanAllocationDto,
  SaveAllocationsDto,
  SaveAllocationsResultDto,
  SetIncomeOverrideDto,
  AutoAllocateResultDto,
} from './dto/budget-allocation.dto';

@Injectable()
export class BudgetAllocationService {
  private readonly logger = new Logger(BudgetAllocationService.name);

  constructor(
    @InjectRepository(MonthlyBudget)
    private readonly monthlyBudgetRepository: Repository<MonthlyBudget>,
    @InjectRepository(ExpensePlan)
    private readonly expensePlanRepository: Repository<ExpensePlan>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  /**
   * Get the current month in YYYY-MM format
   */
  private getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Get start and end dates for a month
   */
  private getMonthDateRange(month: string): { start: Date; end: Date } {
    const [year, monthNum] = month.split('-').map(Number);
    const start = new Date(year, monthNum - 1, 1);
    const end = new Date(year, monthNum, 0, 23, 59, 59, 999);
    return { start, end };
  }

  /**
   * Detect income from transactions for a given month
   */
  private async detectIncome(
    userId: number,
    month: string,
  ): Promise<{
    total: number;
    transactions: { id: number; description: string; amount: number; date: string }[];
  }> {
    const { start, end } = this.getMonthDateRange(month);

    // Find positive transactions (income) for this month
    // Income is typically positive amounts or transactions in income categories
    const incomeTransactions = await this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.category', 'category')
      .leftJoinAndSelect('transaction.user', 'user')
      .where('user.id = :userId', { userId })
      .andWhere('transaction.executionDate BETWEEN :start AND :end', {
        start,
        end,
      })
      .orderBy('transaction.executionDate', 'DESC')
      .getMany();

    // Filter for income: positive amounts or income-like categories
    const incomeItems = incomeTransactions.filter((t) => {
      const amount = Number(t.amount);
      // Positive amounts are typically income
      if (amount > 0) return true;
      // Check for income category
      if (t.category?.name?.toLowerCase().includes('income')) return true;
      if (t.category?.name?.toLowerCase().includes('salary')) return true;
      if (t.category?.name?.toLowerCase().includes('stipendio')) return true;
      return false;
    });

    const total = incomeItems.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

    return {
      total,
      transactions: incomeItems.map((t) => ({
        id: t.id,
        description: t.description || '',
        amount: Math.abs(Number(t.amount)),
        date: t.executionDate
          ? t.executionDate.toISOString().split('T')[0]
          : t.createdAt.toISOString().split('T')[0],
      })),
    };
  }

  /**
   * Get or create MonthlyBudget record for a user/month
   */
  private async getOrCreateMonthlyBudget(
    userId: number,
    month: string,
  ): Promise<MonthlyBudget> {
    let budget = await this.monthlyBudgetRepository.findOne({
      where: { userId, month },
    });

    if (!budget) {
      // Auto-detect income
      const { total } = await this.detectIncome(userId, month);

      budget = this.monthlyBudgetRepository.create({
        userId,
        month,
        autoDetectedIncome: total,
        totalAllocated: 0,
        unallocated: total,
        isComplete: false,
      });
      budget = await this.monthlyBudgetRepository.save(budget);
    }

    return budget;
  }

  /**
   * Get allocation state for a specific month
   */
  async getAllocationState(
    userId: number,
    month?: string,
  ): Promise<AllocationStateDto> {
    const targetMonth = month || this.getCurrentMonth();

    // Get or create monthly budget
    const budget = await this.getOrCreateMonthlyBudget(userId, targetMonth);

    // Get income breakdown
    const incomeData = await this.detectIncome(userId, targetMonth);
    const income: IncomeBreakdownDto = {
      autoDetectedIncome: Number(budget.autoDetectedIncome),
      manualIncomeOverride: budget.manualIncomeOverride
        ? Number(budget.manualIncomeOverride)
        : null,
      effectiveIncome:
        budget.manualIncomeOverride !== null
          ? Number(budget.manualIncomeOverride)
          : Number(budget.autoDetectedIncome),
      incomeTransactions: incomeData.transactions,
    };

    // Get all active expense plans
    const plans = await this.expensePlanRepository.find({
      where: { userId, status: 'active' },
      relations: ['paymentAccount'],
      order: { priority: 'ASC', name: 'ASC' },
    });

    // Map plans to allocation DTOs
    const planAllocations: PlanAllocationDto[] = plans.map((plan) => ({
      planId: plan.id,
      planName: plan.name,
      icon: plan.icon,
      purpose: plan.purpose,
      suggestedAmount: Number(plan.monthlyContribution),
      allocatedAmount: plan.allocatedThisMonth
        ? Number(plan.allocatedThisMonth)
        : 0,
      spentThisMonth: Number(plan.spentThisMonth || 0),
      paymentAccountId: plan.paymentAccountId,
      paymentAccountName: plan.paymentAccount?.name || null,
    }));

    // Calculate totals
    const totalAllocated = planAllocations.reduce(
      (sum, p) => sum + p.allocatedAmount,
      0,
    );
    const unallocated = income.effectiveIncome - totalAllocated;

    // Determine status color
    let statusColor: 'green' | 'yellow' | 'red' = 'yellow';
    if (Math.abs(unallocated) < 0.01) {
      statusColor = 'green'; // Perfectly balanced
    } else if (unallocated < 0) {
      statusColor = 'red'; // Over-allocated
    }

    return {
      month: targetMonth,
      income,
      totalAllocated,
      unallocated,
      isComplete: Math.abs(unallocated) < 0.01,
      statusColor,
      plans: planAllocations,
      notes: budget.notes,
    };
  }

  /**
   * Save allocations for a month
   */
  async saveAllocations(
    userId: number,
    month: string,
    dto: SaveAllocationsDto,
  ): Promise<SaveAllocationsResultDto> {
    const budget = await this.getOrCreateMonthlyBudget(userId, month);

    let plansUpdated = 0;

    for (const allocation of dto.allocations) {
      const plan = await this.expensePlanRepository.findOne({
        where: { id: allocation.planId, userId },
      });

      if (plan) {
        plan.allocatedThisMonth = allocation.amount;

        // Update allocation history
        const history = plan.allocationHistory || [];
        const existingIndex = history.findIndex((h) => h.month === month);
        if (existingIndex >= 0) {
          history[existingIndex].allocated = allocation.amount;
        } else {
          history.push({
            month,
            allocated: allocation.amount,
            spent: plan.spentThisMonth || 0,
          });
        }
        plan.allocationHistory = history;

        // For sinking funds, allocating = contributing to balance
        if (plan.purpose === 'sinking_fund') {
          // Note: This adds to the current balance
          // The actual contribution should be handled separately
          // For now, we just track the allocation
        }

        await this.expensePlanRepository.save(plan);
        plansUpdated++;
      }
    }

    // Update monthly budget totals
    const totalAllocated = dto.allocations.reduce(
      (sum, a) => sum + a.amount,
      0,
    );
    budget.totalAllocated = totalAllocated;
    budget.unallocated =
      (budget.manualIncomeOverride ?? budget.autoDetectedIncome) -
      totalAllocated;
    budget.isComplete = Math.abs(budget.unallocated) < 0.01;
    await this.monthlyBudgetRepository.save(budget);

    // Return updated state
    const state = await this.getAllocationState(userId, month);

    return {
      success: true,
      state,
      plansUpdated,
    };
  }

  /**
   * Override income for a month
   */
  async setIncomeOverride(
    userId: number,
    month: string,
    dto: SetIncomeOverrideDto,
  ): Promise<AllocationStateDto> {
    const budget = await this.getOrCreateMonthlyBudget(userId, month);

    if (dto.amount !== undefined) {
      budget.manualIncomeOverride = dto.amount;
    }
    if (dto.notes !== undefined) {
      budget.notes = dto.notes;
    }

    // Recalculate unallocated
    const effectiveIncome =
      budget.manualIncomeOverride ?? budget.autoDetectedIncome;
    budget.unallocated = effectiveIncome - budget.totalAllocated;
    budget.isComplete = Math.abs(budget.unallocated) < 0.01;

    await this.monthlyBudgetRepository.save(budget);

    return this.getAllocationState(userId, month);
  }

  /**
   * Auto-allocate using suggested amounts
   */
  async autoAllocate(
    userId: number,
    month: string,
  ): Promise<AutoAllocateResultDto> {
    const state = await this.getAllocationState(userId, month);

    // Allocate to each plan using their suggested amount
    const allocations = state.plans.map((plan) => ({
      planId: plan.planId,
      amount: plan.suggestedAmount,
    }));

    await this.saveAllocations(userId, month, { allocations });

    const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
    const remaining = state.income.effectiveIncome - totalAllocated;

    return {
      plansAllocated: allocations.length,
      totalAllocated,
      remaining,
      allocations,
    };
  }

  /**
   * Refresh income detection for a month
   * Called when transactions change
   */
  async refreshIncomeDetection(userId: number, month: string): Promise<void> {
    const budget = await this.monthlyBudgetRepository.findOne({
      where: { userId, month },
    });

    if (budget) {
      const { total } = await this.detectIncome(userId, month);
      budget.autoDetectedIncome = total;

      // Only update unallocated if no manual override
      if (budget.manualIncomeOverride === null) {
        budget.unallocated = total - budget.totalAllocated;
      }

      await this.monthlyBudgetRepository.save(budget);
    }
  }
}
