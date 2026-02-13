import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/entities/category.entity';
import {
  addMonths,
  startOfMonth,
  endOfMonth,
  format,
  subMonths,
} from 'date-fns';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { ExpensePlan } from '../expense-plans/entities/expense-plan.entity';
import { IncomePlan } from '../income-plans/entities/income-plan.entity';

export interface MonthlyIncomeExpense {
  month: string;
  income: number;
  expenses: number;
  date?: Date;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(BankAccount)
    private bankAccountsRepository: Repository<BankAccount>,
    @InjectRepository(ExpensePlan)
    private expensePlanRepository: Repository<ExpensePlan>,
    @InjectRepository(IncomePlan)
    private incomePlanRepository: Repository<IncomePlan>,
  ) {}

  /**
   * Get expense distribution by category for a specific date range
   */
  async getExpenseDistributionByCategory(
    userId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<{ categoryName: string; amount: number; percentage: number }[]> {
    const categoryTotals = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .select('category.name', 'categoryName')
      .addSelect('SUM(ABS(transaction.amount))', 'amount')
      .leftJoin('transaction.category', 'category')
      .where('transaction.user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .andWhere('transaction.executionDate BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      })
      .andWhere(
        '(category.excludeFromExpenseAnalytics IS NULL OR category.excludeFromExpenseAnalytics = false)',
      )
      .groupBy('category.name')
      .getRawMany();

    // Calculate total expense amount for percentage calculation
    const totalExpense = categoryTotals.reduce(
      (sum, row) => sum + Number(row.amount),
      0,
    );

    // Convert raw results to array with calculated percentages
    const result = categoryTotals.map((row) => ({
      categoryName: row.categoryName || 'Uncategorized',
      amount: Number(row.amount),
      percentage:
        totalExpense > 0 ? (Number(row.amount) / totalExpense) * 100 : 0,
    }));

    // Sort by amount in descending order
    return result.sort((a, b) => b.amount - a.amount);
  }

  /**
   * Get monthly income and expenses for the last N months
   */
  async getMonthlyIncomeAndExpenses(
    userId: number,
    numberOfMonths: number = 6,
  ): Promise<
    { month: string; income: number; expenses: number; date: Date }[]
  > {
    const result: {
      month: string;
      income: number;
      expenses: number;
      date: Date;
    }[] = [];
    const currentDate = new Date();

    for (let i = 0; i < numberOfMonths; i++) {
      const date = subMonths(currentDate, i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);

      // Get income total - Apply the same category filter as expenses
      const incomeResult = await this.transactionsRepository
        .createQueryBuilder('transaction')
        .leftJoin('transaction.category', 'category')
        .select('SUM(transaction.amount)', 'total')
        .where('transaction.user.id = :userId', { userId })
        .andWhere('transaction.type = :type', { type: 'income' })
        .andWhere('transaction.executionDate BETWEEN :start AND :end', {
          start,
          end,
        })
        .andWhere(
          '(category.excludeFromExpenseAnalytics IS NULL OR category.excludeFromExpenseAnalytics = false)',
        )
        .getRawOne();

      // Get expense total with exclusions
      const expenseResult = await this.transactionsRepository
        .createQueryBuilder('transaction')
        .leftJoin('transaction.category', 'category')
        .select('SUM(ABS(transaction.amount))', 'total')
        .where('transaction.user.id = :userId', { userId })
        .andWhere('transaction.type = :type', { type: 'expense' })
        .andWhere('transaction.executionDate BETWEEN :start AND :end', {
          start,
          end,
        })
        .andWhere(
          '(category.excludeFromExpenseAnalytics IS NULL OR category.excludeFromExpenseAnalytics = false)',
        )
        .getRawOne();

      // Process the results with proper type handling
      const income = Number(incomeResult?.total || 0);
      const expenses = Number(expenseResult?.total || 0);

      result.unshift({
        month: format(date, 'MMM yyyy'),
        income,
        expenses,
        date: date,
      });
    }

    return result;
  }

  /**
   * Get key statistics for a specific month
   */
  async getMonthlyStatistics(
    userId: number,
    date: Date = new Date(),
  ): Promise<{
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    averageDailyExpense: number;
    topExpenseCategory: { name: string; amount: number } | null;
    totalTransactions: number;
  }> {
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    const daysInMonth = end.getDate();

    // Get income total
    const incomeResult = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .select('SUM(transaction.amount)', 'total')
      .where('transaction.user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'income' })
      .andWhere('transaction.executionDate BETWEEN :start AND :end', {
        start,
        end,
      })
      .andWhere(
        '(category.excludeFromExpenseAnalytics IS NULL OR category.excludeFromExpenseAnalytics = false)',
      )
      .getRawOne();

    // Get expense total with exclusions
    const expenseResult = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .select('SUM(ABS(transaction.amount))', 'total')
      .where('transaction.user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .andWhere('transaction.executionDate BETWEEN :start AND :end', {
        start,
        end,
      })
      .andWhere(
        '(category.excludeFromExpenseAnalytics IS NULL OR category.excludeFromExpenseAnalytics = false)',
      )
      .getRawOne();

    // Get top expense category
    const topCategory = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .select('category.name', 'name')
      .addSelect('SUM(ABS(transaction.amount))', 'amount')
      .where('transaction.user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .andWhere('transaction.executionDate BETWEEN :start AND :end', {
        start,
        end,
      })
      .andWhere(
        '(category.excludeFromExpenseAnalytics IS NULL OR category.excludeFromExpenseAnalytics = false)',
      )
      .groupBy('category.name')
      .orderBy('amount', 'DESC')
      .limit(1)
      .getRawOne();

    // Get total transaction count
    const totalCount = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .where('transaction.user.id = :userId', { userId })
      .andWhere('transaction.executionDate BETWEEN :start AND :end', {
        start,
        end,
      })
      .getCount();

    const totalIncome = Number(incomeResult?.total || 0);
    const totalExpenses = Number(expenseResult?.total || 0);

    return {
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses,
      averageDailyExpense: totalExpenses / daysInMonth,
      topExpenseCategory: topCategory
        ? {
            name: topCategory.name || 'Uncategorized',
            amount: Number(topCategory.amount),
          }
        : null,
      totalTransactions: totalCount,
    };
  }

  /**
   * Get transactions with advanced filtering
   */
  async getFilteredTransactions(
    userId: number,
    filters: {
      startDate?: Date;
      endDate?: Date;
      categoryIds?: number[];
      tagIds?: number[];
      minAmount?: number;
      maxAmount?: number;
      type?: 'income' | 'expense';
      searchTerm?: string;
      orderBy?: 'executionDate' | 'amount' | 'description';
      orderDirection?: 'asc' | 'desc';
      uncategorizedOnly?: boolean;
      bankAccountIds?: number[];
      creditCardIds?: number[];
    },
  ): Promise<Transaction[]> {
    const query = this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.category', 'category')
      .leftJoinAndSelect('transaction.tags', 'tag')
      .leftJoinAndSelect('transaction.bankAccount', 'bankAccount')
      .leftJoinAndSelect('transaction.creditCard', 'creditCard')
      .where('transaction.user.id = :userId', { userId });

    // Apply filters
    if (filters.startDate) {
      query.andWhere('transaction.executionDate >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters.endDate) {
      query.andWhere('transaction.executionDate <= :endDate', {
        endDate: filters.endDate,
      });
    }

    if (filters.categoryIds && filters.categoryIds.length > 0) {
      query.andWhere('category.id IN (:...categoryIds)', {
        categoryIds: filters.categoryIds,
      });
    }

    if (filters.tagIds && filters.tagIds.length > 0) {
      query.andWhere('tag.id IN (:...tagIds)', { tagIds: filters.tagIds });
    }

    if (filters.minAmount !== undefined) {
      query.andWhere('ABS(transaction.amount) >= :minAmount', {
        minAmount: filters.minAmount,
      });
    }

    if (filters.maxAmount !== undefined) {
      query.andWhere('ABS(transaction.amount) <= :maxAmount', {
        maxAmount: filters.maxAmount,
      });
    }

    if (filters.type) {
      query.andWhere('transaction.type = :type', { type: filters.type });
    }

    // Filter by bank accounts
    if (filters.bankAccountIds && filters.bankAccountIds.length > 0) {
      query.andWhere('bankAccount.id IN (:...bankAccountIds)', {
        bankAccountIds: filters.bankAccountIds,
      });
    }

    // Filter by credit cards
    if (filters.creditCardIds && filters.creditCardIds.length > 0) {
      query.andWhere('creditCard.id IN (:...creditCardIds)', {
        creditCardIds: filters.creditCardIds,
      });
    }

    // Note: excludeFromExpenseAnalytics should NOT filter transaction list display
    // It should only affect analytics/dashboard calculations

    if (filters.searchTerm) {
      query.andWhere('transaction.description LIKE :searchTerm', {
        searchTerm: `%${filters.searchTerm}%`,
      });
    }

    // Handle uncategorized filter
    if (filters.uncategorizedOnly) {
      query.andWhere('category.id IS NULL');
    }

    // Handle ordering
    if (filters.orderBy) {
      const direction = filters.orderDirection
        ? (filters.orderDirection.toUpperCase() as 'ASC' | 'DESC')
        : 'DESC';

      if (filters.orderBy === 'executionDate') {
        query.orderBy('transaction.executionDate', direction);
      } else if (filters.orderBy === 'amount') {
        query.orderBy('ABS(transaction.amount)', direction);
      } else if (filters.orderBy === 'description') {
        query.orderBy('transaction.description', direction);
      }
    } else {
      // Default ordering by execution date if not specified
      query.orderBy('transaction.executionDate', 'DESC');
    }

    return query.getMany();
  }

  /**
   * Get the user's current total balance across all bank accounts.
   */
  async getCurrentBalance(userId: number): Promise<{ currentBalance: number }> {
    const bankAccounts = await this.bankAccountsRepository.find({
      where: { user: { id: userId } },
    });

    const currentBalance = bankAccounts.reduce(
      (sum, account) => sum + Number(account.balance),
      0,
    );

    return { currentBalance };
  }

  async getCashFlowForecast(
    userId: number,
    months: number = 24,
    mode: 'historical' | 'expense-plans' | 'recurring' = 'historical',
  ): Promise<
    {
      month: string;
      income: number;
      expenses: number;
      projectedBalance: number;
    }[]
  > {
    const startingBalance = (await this.getCurrentBalance(userId))
      .currentBalance;

    // Note: 'recurring' mode is deprecated - falls back to historical
    if (mode === 'recurring') {
      this.logger.warn(
        'Recurring mode is deprecated, falling back to historical mode',
      );
      mode = 'historical';
    }

    if (mode === 'expense-plans') {
      this.logger.debug(
        `Generating ${months} months cash flow forecast using expense plans mode`,
      );
      return this.forecastFromExpensePlans(userId, months, startingBalance);
    }

    this.logger.debug(
      `Generating ${months} months cash flow forecast using historical mode`,
    );

    return this.forecastFromHistoricalData(userId, months, startingBalance);
  }

  private async forecastFromHistoricalData(
    userId: number,
    months: number,
    startingBalance: number,
  ): Promise<
    {
      month: string;
      income: number;
      expenses: number;
      projectedBalance: number;
    }[]
  > {
    const today = new Date();

    // Get past months data with excluded categories already filtered out
    // Get more months of data for a better sample size if available
    const pastMonths = await this.getMonthlyIncomeAndExpenses(userId, 12);

    if (pastMonths.length === 0) return [];

    let projectedBalance = startingBalance;
    const forecast: {
      month: string;
      income: number;
      expenses: number;
      projectedBalance: number;
    }[] = [];

    // Use a debug log to inspect historical data
    console.log(
      'Historical data for forecasting:',
      JSON.stringify(
        pastMonths.map((m) => ({
          month: m.month,
          income: m.income,
          expenses: m.expenses,
        })),
      ),
    );

    for (let i = 0; i < months; i++) {
      const date = addMonths(today, i);
      const month = format(date, 'MMM yyyy');

      // Rotate through historical months cyclically, using month position for more realistic seasonal patterns
      // This makes April 2025 use data from the most recent April, etc.
      const monthIndex = date.getMonth(); // 0-11

      // Find historical data for the same month if available
      const matchingMonthData = pastMonths.find((m) => {
        return m.date.getMonth() === monthIndex;
      });

      // Use matching month data if found, otherwise use the first available month
      const historical = matchingMonthData || pastMonths[0];
      const income = historical.income;
      const expenses = historical.expenses;

      projectedBalance += income - expenses;

      forecast.push({ month, income, expenses, projectedBalance });
    }

    return forecast;
  }

  /**
   * Get historical expense averages grouped by category and month index (0-11).
   * Only includes categories not excluded from analytics.
   * Returns both the data map and category names for debugging.
   */
  private async getHistoricalExpensesByCategory(
    userId: number,
  ): Promise<{
    data: Map<number, Map<number, number>>;
    categoryNames: Map<number, string>;
  }> {
    const twelveMonthsAgo = subMonths(new Date(), 12);

    const rawData = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect(
        'EXTRACT(MONTH FROM transaction.executionDate)',
        'monthNumber',
      )
      .addSelect('SUM(ABS(transaction.amount))', 'totalAmount')
      .addSelect('COUNT(*)', 'txCount')
      .where('transaction.user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .andWhere('transaction.executionDate >= :since', {
        since: twelveMonthsAgo,
      })
      .andWhere('category.id IS NOT NULL')
      .andWhere(
        '(category.excludeFromExpenseAnalytics IS NULL OR category.excludeFromExpenseAnalytics = false)',
      )
      .groupBy('category.id')
      .addGroupBy('category.name')
      .addGroupBy('EXTRACT(MONTH FROM transaction.executionDate)')
      .getRawMany();

    // Build Map<categoryId, Map<monthIndex(0-11), totalExpense>>
    // SQL EXTRACT(MONTH) returns 1-12, we convert to 0-11
    const data = new Map<number, Map<number, number>>();
    const categoryNames = new Map<number, string>();

    for (const row of rawData) {
      const categoryId = Number(row.categoryId);
      const monthIndex = Number(row.monthNumber) - 1; // Convert 1-12 to 0-11
      const totalAmount = Number(row.totalAmount);

      categoryNames.set(categoryId, row.categoryName || 'Unknown');

      if (!data.has(categoryId)) {
        data.set(categoryId, new Map());
      }
      data.get(categoryId)!.set(monthIndex, totalAmount);
    }

    return { data, categoryNames };
  }

  /**
   * Calculate planned expense for a single expense plan in a given forecast month.
   */
  private calculatePlannedExpenseForMonth(
    plan: ExpensePlan,
    forecastDate: Date,
  ): number {
    const forecastMonth = forecastDate.getMonth(); // 0-11
    const forecastYear = forecastDate.getFullYear();

    if (plan.purpose === 'spending_budget') {
      // Spending budgets (e.g., Groceries) → monthlyContribution every month
      return Number(plan.monthlyContribution) || 0;
    }

    // Sinking fund plans → show actual payment amount when the expense occurs
    // Note: targetAmount is always the ANNUAL total for all plan types
    switch (plan.frequency) {
      case 'monthly':
        // Monthly bills: actual monthly cost = monthlyContribution (= targetAmount/12)
        return Number(plan.monthlyContribution) || 0;

      case 'yearly': {
        // Yearly bills: full annual amount in the due month
        const dueMonth = plan.dueMonth != null ? plan.dueMonth - 1 : null; // Convert 1-12 to 0-11
        if (dueMonth != null && forecastMonth === dueMonth) {
          return Number(plan.targetAmount) || 0;
        }
        return 0;
      }

      case 'quarterly': {
        // Quarterly bills: annual amount / 4 in each quarter month
        const dueMonth = plan.dueMonth != null ? plan.dueMonth - 1 : 0;
        const diff = ((forecastMonth - dueMonth) % 3 + 3) % 3;
        if (diff === 0) {
          return (Number(plan.targetAmount) || 0) / 4;
        }
        return 0;
      }

      case 'seasonal': {
        if (plan.seasonalMonths && plan.seasonalMonths.length > 0) {
          // seasonalMonths stored as 1-12
          if (plan.seasonalMonths.includes(forecastMonth + 1)) {
            return (
              (Number(plan.targetAmount) || 0) / plan.seasonalMonths.length
            );
          }
        }
        return 0;
      }

      case 'multi_year': {
        if (plan.targetDate) {
          const targetDate = new Date(plan.targetDate);
          if (
            targetDate.getMonth() === forecastMonth &&
            targetDate.getFullYear() === forecastYear
          ) {
            return Number(plan.targetAmount) || 0;
          }
          // Check cycle based on frequencyYears
          if (plan.frequencyYears && plan.frequencyYears > 0) {
            const dueMonth =
              plan.dueMonth != null ? plan.dueMonth - 1 : targetDate.getMonth();
            if (forecastMonth === dueMonth) {
              const yearDiff = forecastYear - targetDate.getFullYear();
              if (yearDiff >= 0 && yearDiff % plan.frequencyYears === 0) {
                return Number(plan.targetAmount) || 0;
              }
            }
          }
        }
        return 0;
      }

      case 'one_time': {
        if (plan.targetDate) {
          const targetDate = new Date(plan.targetDate);
          if (
            targetDate.getMonth() === forecastMonth &&
            targetDate.getFullYear() === forecastYear
          ) {
            return Number(plan.targetAmount) || 0;
          }
        }
        return 0;
      }

      default:
        return 0;
    }
  }

  /**
   * Forecast using:
   * - Income: from active income plans (guaranteed + expected reliability)
   * - Planned expenses: from active expense plans
   * - Unplanned expenses: seasonal historical averages for uncovered categories
   */
  private async forecastFromExpensePlans(
    userId: number,
    months: number,
    startingBalance: number,
  ): Promise<
    {
      month: string;
      income: number;
      expenses: number;
      projectedBalance: number;
    }[]
  > {
    const today = new Date();

    // 1. Fetch active expense plans (skip emergency_fund and goal types)
    const activePlans = await this.expensePlanRepository.find({
      where: { userId, status: 'active' },
      relations: ['category'],
    });

    const expensePlans = activePlans.filter(
      (p) => p.planType !== 'emergency_fund' && p.planType !== 'goal',
    );

    // 2. Collect category IDs covered by active plans
    const coveredCategoryIds = new Set<number>();
    for (const plan of expensePlans) {
      if (plan.categoryId) {
        coveredCategoryIds.add(plan.categoryId);
      }
    }

    // 3. Fetch active income plans (guaranteed + expected)
    const monthColumns = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ] as const;

    const activeIncomePlans = await this.incomePlanRepository.find({
      where: [
        { userId, status: 'active', reliability: 'guaranteed' },
        { userId, status: 'active', reliability: 'expected' },
      ],
    });

    // Build income per month (0-11) from income plans
    const incomeByMonth = new Map<number, number>();
    for (let m = 0; m < 12; m++) {
      let monthTotal = 0;
      for (const plan of activeIncomePlans) {
        monthTotal += Number(plan[monthColumns[m]]) || 0;
      }
      incomeByMonth.set(m, monthTotal);
    }

    // 4. Get historical expenses by category (for uncovered categories)
    const { data: historicalByCategory, categoryNames } =
      await this.getHistoricalExpensesByCategory(userId);

    // === DEBUG: Log income plans + expense plans breakdown ===
    this.logger.debug('=== EXPENSE PLANS FORECAST DEBUG ===');

    this.logger.debug(
      `Active income plans (guaranteed+expected): ${activeIncomePlans.length}`,
    );
    for (const ip of activeIncomePlans) {
      const annual = monthColumns.reduce(
        (sum, col) => sum + (Number(ip[col]) || 0),
        0,
      );
      this.logger.debug(
        `  Income: "${ip.name}" | reliability=${ip.reliability} | annual=${annual.toFixed(0)}`,
      );
    }

    this.logger.debug(
      `Active expense plans (excl emergency/goal): ${expensePlans.length}`,
    );
    for (const plan of expensePlans) {
      this.logger.debug(
        `  Plan: "${plan.name}" | type=${plan.planType} | purpose=${plan.purpose} | freq=${plan.frequency} | target=${plan.targetAmount} | monthly=${plan.monthlyContribution} | catId=${plan.categoryId} (${plan.category?.name || 'no category'})`,
      );
    }
    this.logger.debug(
      `Covered category IDs: [${[...coveredCategoryIds].join(', ')}]`,
    );

    // Log all historical categories and whether they're covered
    const allCategoryIds = [...historicalByCategory.keys()];
    this.logger.debug(
      `Total historical categories: ${allCategoryIds.length}`,
    );
    for (const catId of allCategoryIds) {
      const isCovered = coveredCategoryIds.has(catId);
      const monthMap = historicalByCategory.get(catId)!;
      const totalAcrossMonths = [...monthMap.values()].reduce(
        (s, v) => s + v,
        0,
      );
      const avgPerMonth = totalAcrossMonths / Math.max(monthMap.size, 1);
      this.logger.debug(
        `  Cat ${catId} "${categoryNames.get(catId)}": ${isCovered ? 'COVERED (excluded)' : 'UNCOVERED (historical)'} | avg/month=${avgPerMonth.toFixed(0)} | total12mo=${totalAcrossMonths.toFixed(0)}`,
      );
    }
    // === END DEBUG ===

    // Calculate total historical expense per month for uncovered categories only
    const uncoveredMonthlyTotals = new Map<number, number>();
    for (const [categoryId, monthMap] of historicalByCategory) {
      if (!coveredCategoryIds.has(categoryId)) {
        for (const [monthIdx, amount] of monthMap) {
          uncoveredMonthlyTotals.set(
            monthIdx,
            (uncoveredMonthlyTotals.get(monthIdx) || 0) + amount,
          );
        }
      }
    }

    // 5. Build forecast
    let projectedBalance = startingBalance;
    const forecast: {
      month: string;
      income: number;
      expenses: number;
      projectedBalance: number;
    }[] = [];

    for (let i = 0; i < months; i++) {
      const date = addMonths(today, i);
      const monthLabel = format(date, 'MMM yyyy');
      const monthIndex = date.getMonth(); // 0-11

      // Income: from active income plans (guaranteed + expected)
      const income = incomeByMonth.get(monthIndex) || 0;

      // Planned expenses: sum from expense plans for this specific month
      let plannedExpenses = 0;
      const planBreakdown: { name: string; amount: number }[] = [];
      for (const plan of expensePlans) {
        const amount = this.calculatePlannedExpenseForMonth(plan, date);
        if (amount > 0) {
          planBreakdown.push({ name: plan.name, amount });
        }
        plannedExpenses += amount;
      }

      // Unplanned expenses: seasonal historical for uncovered categories
      const unplannedExpenses = uncoveredMonthlyTotals.get(monthIndex) || 0;

      const expenses = plannedExpenses + unplannedExpenses;
      projectedBalance += income - expenses;

      // Debug log for first 3 months
      if (i < 3) {
        this.logger.debug(
          `  ${monthLabel}: income=${income.toFixed(0)} | planned=${plannedExpenses.toFixed(0)} [${planBreakdown.map((p) => `${p.name}:${p.amount.toFixed(0)}`).join(', ')}] | unplanned(historical)=${unplannedExpenses.toFixed(0)} | TOTAL expenses=${expenses.toFixed(0)}`,
        );
      }

      forecast.push({
        month: monthLabel,
        income,
        expenses,
        projectedBalance,
      });
    }

    return forecast;
  }

  async getSavingsPlanByCategory(
    userId: number,
  ): Promise<{ categoryName: string; total: number; monthly: number }[]> {
    const today = new Date();
    const oneYearAgo = new Date(
      today.getFullYear() - 1,
      today.getMonth(),
      today.getDate(),
    );

    // IMPROVED: Calculate NET per category instead of only expenses
    // Get all transactions and calculate net impact per category
    const allTransactions = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .select('category.name', 'categoryName')
      .addSelect('transaction.type', 'type')
      .addSelect('SUM(ABS(transaction.amount))', 'amount')
      .where('transaction.user.id = :userId', { userId })
      .andWhere('transaction.executionDate BETWEEN :start AND :end', {
        start: oneYearAgo,
        end: today,
      })
      .andWhere(
        '(category.excludeFromExpenseAnalytics IS NULL OR category.excludeFromExpenseAnalytics = false)',
      )
      .groupBy('category.name')
      .addGroupBy('transaction.type')
      .getRawMany();

    console.log(
      'DEBUG Savings Plan - Raw transactions:',
      allTransactions.length,
    );
    console.log(
      'DEBUG Savings Plan - Sample transactions:',
      allTransactions.slice(0, 5),
    );

    // Calculate net per category
    const categoryNets: Record<
      string,
      { income: number; expense: number; net: number }
    > = {};

    allTransactions.forEach((item) => {
      const categoryName = item.categoryName || 'Uncategorized';
      const amount = Number(item.amount) || 0;

      if (!categoryNets[categoryName]) {
        categoryNets[categoryName] = { income: 0, expense: 0, net: 0 };
      }

      if (item.type === 'income') {
        categoryNets[categoryName].income += amount;
      } else {
        categoryNets[categoryName].expense += amount;
      }

      categoryNets[categoryName].net =
        categoryNets[categoryName].income - categoryNets[categoryName].expense;
    });

    console.log(
      'DEBUG Savings Plan - Category nets:',
      Object.keys(categoryNets).length,
    );
    console.log(
      'DEBUG Savings Plan - Sample nets:',
      Object.entries(categoryNets).slice(0, 3),
    );

    // Only return categories with NET negative impact (where you spend more than you receive)
    const result = Object.entries(categoryNets)
      .filter(([_, data]) => data.net < 0) // Only net expenses
      .map(([categoryName, data]) => ({
        categoryName,
        total: Number(Math.abs(data.net).toFixed(2)), // Absolute value of net negative
        monthly: Number((Math.abs(data.net) / 12).toFixed(2)),
      }))
      .sort((a, b) => b.total - a.total);

    console.log(
      'DEBUG Savings Plan - Final result:',
      result.length,
      'categories',
    );

    return result;
  }
}
