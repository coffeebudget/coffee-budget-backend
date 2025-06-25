import { Injectable } from '@nestjs/common';
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
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { RecurringTransactionGeneratorService } from '../recurring-transactions/recurring-transaction-generator.service';

export interface MonthlyIncomeExpense {
  month: string;
  income: number;
  expenses: number;
  date?: Date;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(BankAccount)
    private bankAccountsRepository: Repository<BankAccount>,
    @InjectRepository(RecurringTransaction)
    private recurringTransactionRepository: Repository<RecurringTransaction>,
    private generatorService: RecurringTransactionGeneratorService,
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
    mode: 'historical' | 'recurring' = 'historical',
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

    console.log(
      `Generating ${months} months cash flow forecast using ${mode} mode`,
    );

    let forecast;
    if (mode === 'historical') {
      forecast = await this.forecastFromHistoricalData(
        userId,
        months,
        startingBalance,
      );
    } else {
      forecast = await this.forecastFromRecurringTransactions(
        userId,
        months,
        startingBalance,
      );
    }

    // Log April 2025 forecast if it exists
    const april2025 = forecast.find((f) => f.month === 'Apr 2025');
    if (april2025) {
      console.log('April 2025 forecast:', april2025);
    }

    return forecast;
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

  private async forecastFromRecurringTransactions(
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
    let projectedBalance = startingBalance;
    const forecast: {
      month: string;
      income: number;
      expenses: number;
      projectedBalance: number;
    }[] = [];

    // Get recurring transactions that are scheduled and exclude those with categories marked excludeFromExpenseAnalytics
    const recurringTransactions = await this.recurringTransactionRepository
      .createQueryBuilder('recTransaction')
      .leftJoinAndSelect('recTransaction.category', 'category')
      .where('recTransaction.user.id = :userId', { userId })
      .andWhere('recTransaction.status = :status', { status: 'SCHEDULED' })
      .andWhere(
        '(category.excludeFromExpenseAnalytics IS NULL OR category.excludeFromExpenseAnalytics = false)',
      )
      .getMany();

    for (let i = 0; i < months; i++) {
      const date = addMonths(today, i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);

      let totalIncome = 0;
      let totalExpenses = 0;

      for (const transaction of recurringTransactions) {
        const executionDate = this.generatorService.calculateNextExecutionDate(
          start,
          transaction,
        );

        if (executionDate >= start && executionDate <= end) {
          if (transaction.type === 'income') {
            totalIncome += Number(transaction.amount);
          } else {
            totalExpenses += Math.abs(Number(transaction.amount));
          }
        }
      }

      projectedBalance += totalIncome - totalExpenses;

      forecast.push({
        month: format(date, 'MMM yyyy'),
        income: totalIncome,
        expenses: totalExpenses,
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

    const categoryTotals = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .select('category.name', 'categoryName')
      .addSelect('SUM(ABS(transaction.amount))', 'total')
      .where('transaction.user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .andWhere('transaction.executionDate BETWEEN :start AND :end', {
        start: oneYearAgo,
        end: today,
      })
      .andWhere(
        '(category.excludeFromExpenseAnalytics IS NULL OR category.excludeFromExpenseAnalytics = false)',
      )
      .groupBy('category.name')
      .getRawMany();

    return categoryTotals
      .map((item) => ({
        categoryName: item.categoryName || 'Uncategorized',
        total: Number(Number(item.total).toFixed(2)),
        monthly: Number((Number(item.total) / 12).toFixed(2)),
      }))
      .sort((a, b) => b.total - a.total);
  }
}
