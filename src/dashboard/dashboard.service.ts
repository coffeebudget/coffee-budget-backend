import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { addMonths, startOfMonth, endOfMonth, format, subMonths } from 'date-fns';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { RecurringTransactionGeneratorService } from '../recurring-transactions/recurring-transaction-generator.service';

export interface MonthlyIncomeExpense {
  month: string;
  income: number;
  expenses: number;
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
    const transactions = await this.transactionsRepository.find({
      where: {
        user: { id: userId },
        type: 'expense',
        executionDate: Between(startDate, endDate),
      },
      relations: ['category'],
    });

    // Group transactions by category
    const categoryMap = new Map<string, number>();
    let totalExpenses = 0;

    transactions.forEach(transaction => {
      const categoryName = transaction.category?.name || 'Uncategorized';
      const amount = Math.abs(transaction.amount);
      totalExpenses += amount;
      
      if (categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, (categoryMap.get(categoryName) ?? 0) + amount);
      } else {
        categoryMap.set(categoryName, amount);
      }
    });

    // Convert map to array and calculate percentages
    const result = Array.from(categoryMap.entries()).map(([categoryName, amount]) => ({
      categoryName,
      amount,
      percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
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
  ): Promise<{ month: string; income: number; expenses: number }[]> {
    const result: { month: string; income: number; expenses: number }[] = [];
    const currentDate = new Date();

    for (let i = 0; i < numberOfMonths; i++) {
      const date = subMonths(currentDate, i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      
      const transactions = await this.transactionsRepository.find({
        where: {
          user: { id: userId },
          executionDate: Between(start, end),
        },
      });

      let income = 0;
      let expenses = 0;

      transactions.forEach(transaction => {
        if (transaction.type === 'income') {
          income += Number(transaction.amount);
        } else {
          expenses += Math.abs(Number(transaction.amount));
        }
      });

      result.unshift({
        month: format(date, 'MMM yyyy'),
        income,
        expenses,
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
  
    const transactions = await this.transactionsRepository.find({
      where: { user: { id: userId }, executionDate: Between(start, end) },
      relations: ['category'],
    });
  
    let totalIncome = 0;
    let totalExpenses = 0;
    const categoryExpenses = new Map<string, { id: number; amount: number }>();
  
    transactions.forEach(transaction => {
      if (transaction.type === 'income') {
        totalIncome += Number(transaction.amount);
      } else {
        const amount = Math.abs(Number(transaction.amount));
        totalExpenses += amount;
  
        if (transaction.category) {
          const categoryName = transaction.category.name;
          categoryExpenses.set(categoryName, {
            id: transaction.category.id,
            amount: (categoryExpenses.get(categoryName)?.amount ?? 0) + amount,
          });
        }
      }
    });
  
  
    // ✅ Find top expense category
    let topExpenseCategory: { name: string; amount: number } | null = null;
    let maxAmount = 0;
    
    categoryExpenses.forEach((value, key) => {
      if (value.amount > maxAmount) {
        maxAmount = value.amount;
        topExpenseCategory = { name: key, amount: value.amount };
      }
    });
  
    return {
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses,
      averageDailyExpense: totalExpenses / daysInMonth,
      topExpenseCategory,
      totalTransactions: transactions.length,
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
    },
  ): Promise<Transaction[]> {
    const query = this.transactionsRepository.createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.category', 'category')
      .leftJoinAndSelect('transaction.tags', 'tag')
      .leftJoinAndSelect('transaction.bankAccount', 'bankAccount')
      .leftJoinAndSelect('transaction.creditCard', 'creditCard')
      .where('transaction.user.id = :userId', { userId });

    // Apply filters
    if (filters.startDate) {
      query.andWhere('transaction.executionDate >= :startDate', { startDate: filters.startDate });
    }
    
    if (filters.endDate) {
      query.andWhere('transaction.executionDate <= :endDate', { endDate: filters.endDate });
    }
    
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      query.andWhere('category.id IN (:...categoryIds)', { categoryIds: filters.categoryIds });
    }
    
    if (filters.tagIds && filters.tagIds.length > 0) {
      query.andWhere('tag.id IN (:...tagIds)', { tagIds: filters.tagIds });
    }
    
    if (filters.minAmount !== undefined) {
      query.andWhere('ABS(transaction.amount) >= :minAmount', { minAmount: filters.minAmount });
    }
    
    if (filters.maxAmount !== undefined) {
      query.andWhere('ABS(transaction.amount) <= :maxAmount', { maxAmount: filters.maxAmount });
    }
    
    if (filters.type) {
      query.andWhere('transaction.type = :type', { type: filters.type });
    }
    
    if (filters.searchTerm) {
      query.andWhere('transaction.description LIKE :searchTerm', { searchTerm: `%${filters.searchTerm}%` });
    }
    
    // Order by execution date, newest first
    query.orderBy('transaction.executionDate', 'DESC');
    
    return query.getMany();
  }

  /**
    * Get the user's current total balance across all bank accounts.
    */
  async getCurrentBalance(userId: number): Promise<{ currentBalance: number }> {
    const bankAccounts = await this.bankAccountsRepository.find({
      where: { user: { id: userId } },
    });

    const currentBalance = bankAccounts.reduce((sum, account) => sum + Number(account.balance), 0);

    return { currentBalance };
  }


  async getCashFlowForecast(
    userId: number,
    months: number = 24,
    mode: 'historical' | 'recurring' = 'historical',
  ): Promise<{ month: string; income: number; expenses: number; projectedBalance: number }[]> {
    const startingBalance = (await this.getCurrentBalance(userId)).currentBalance;
  
    if (mode === 'historical') {
      return this.forecastFromHistoricalData(userId, months, startingBalance);
    }
  
    return this.forecastFromRecurringTransactions(userId, months, startingBalance);
  }
  
  private async forecastFromHistoricalData(
    userId: number,
    months: number,
    startingBalance: number,
  ): Promise<{ month: string; income: number; expenses: number; projectedBalance: number }[]> {
    const today = new Date();
    const pastMonths = await this.getMonthlyIncomeAndExpenses(userId, 6);
  
    if (pastMonths.length === 0) return [];
  
    let projectedBalance = startingBalance;
    const forecast: { month: string; income: number; expenses: number; projectedBalance: number }[] = [];
  
    for (let i = 0; i < months; i++) {
      const date = addMonths(today, i);
      const month = format(date, 'MMM yyyy');
  
      // Rotate through historical months cyclically
      const historical = pastMonths[i % pastMonths.length];
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
  ): Promise<{ month: string; income: number; expenses: number; projectedBalance: number }[]> {
    const today = new Date();
    let projectedBalance = startingBalance;
    const forecast: { month: string; income: number; expenses: number; projectedBalance: number }[] = [];
  
    const recurringTransactions = await this.recurringTransactionRepository.find({
      where: { user: { id: userId }, status: 'SCHEDULED' },
    });
  
    for (let i = 0; i < months; i++) {
      const date = addMonths(today, i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
  
      let totalIncome = 0;
      let totalExpenses = 0;
  
      for (const transaction of recurringTransactions) {
        const executionDate = this.generatorService.calculateNextExecutionDate(start, transaction);
  
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

  async getSavingsPlanByCategory(userId: number): Promise<{ categoryName: string; total: number; monthly: number }[]> {
    const today = new Date();
    const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  
    const transactions = await this.transactionsRepository.find({
      where: {
        user: { id: userId },
        type: 'expense',
        executionDate: Between(oneYearAgo, today),
      },
      relations: ['category'],
    });
  
    const categoryTotals = new Map<string, number>();
  
    for (const tx of transactions) {
      const category = tx.category?.name ?? 'Uncategorized';
      const amount = Math.abs(Number(tx.amount));
  
      categoryTotals.set(category, (categoryTotals.get(category) || 0) + amount);
    }
  
    return Array.from(categoryTotals.entries()).map(([categoryName, total]) => ({
      categoryName,
      total: Number(total.toFixed(2)),
      monthly: Number((total / 12).toFixed(2)),
    })).sort((a, b) => b.total - a.total);
  }
  
  
  
  
  
  

} 