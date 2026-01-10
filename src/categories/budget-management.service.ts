import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { Transaction } from '../transactions/transaction.entity';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

export interface CategorySpending {
  categoryId: number;
  categoryName: string;
  budgetLevel: 'primary' | 'secondary' | 'optional';
  currentMonthSpent: number;
  monthlyBudget: number | null;
  maxThreshold: number | null;
  warningThreshold: number | null;
  averageMonthlySpending: number;
  averageMonthlyIncome: number;
  averageMonthlyNetFlow: number;
  suggestedSavings: number;
  budgetStatus: 'under' | 'warning' | 'over' | 'no_budget';
  warningMessage?: string;
}

export interface BudgetSummary {
  primaryBudgetConfigured: number; // Somma dei monthlyBudget delle categorie primary
  primaryCategoriesData: CategorySpending[];
  secondaryWarnings: CategorySpending[]; // Solo categorie con problemi
  allSecondaryCategories: CategorySpending[]; // Tutte le categorie secondary
  optionalSuggestions: CategorySpending[]; // Top suggestions (backwards compatibility)
  allOptionalCategories: CategorySpending[]; // Tutte le categorie optional
  monthlyBudgetUtilization: number;
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  averageMonthlyNetFlow: number;
}

@Injectable()
export class BudgetManagementService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
  ) {}

  /**
   * Ottieni il riepilogo intelligente del budget per il mese corrente
   */
  async getBudgetSummary(userId: number): Promise<BudgetSummary> {
    const currentMonth = new Date();
    const startDate = startOfMonth(currentMonth);
    const endDate = endOfMonth(currentMonth);

    // Ottieni tutte le categorie con budget settings
    const categories = await this.categoriesRepository.find({
      where: { user: { id: userId } },
    });

    // Ottieni le spese del mese corrente per categoria
    const currentMonthSpending = await this.getCurrentMonthSpending(
      userId,
      startDate,
      endDate,
    );

    // Calcola i flussi netti medi degli ultimi 12 mesi per ogni categoria
    // Riutilizziamo la logica del savings plan che già calcola correttamente i NET
    const categoryNets = await this.getCategoryNetFlows(userId, 12);

    const categoryData: CategorySpending[] = [];
    let primaryBudgetConfigured = 0;

    for (const category of categories) {
      const currentSpent = currentMonthSpending[category.name] || 0;
      const netData = categoryNets[category.name] || {
        income: 0,
        expense: 0,
        net: 0,
      };
      const avgSpending = netData.expense;
      const avgIncome = netData.income;
      const netFlow = netData.net;

      const categorySpending: CategorySpending = {
        categoryId: category.id,
        categoryName: category.name,
        budgetLevel: category.budgetLevel || 'optional',
        currentMonthSpent: currentSpent,
        monthlyBudget: category.monthlyBudget
          ? Number(category.monthlyBudget)
          : null,
        maxThreshold: category.maxThreshold
          ? Number(category.maxThreshold)
          : null,
        warningThreshold: category.warningThreshold
          ? Number(category.warningThreshold)
          : null,
        averageMonthlySpending: avgSpending,
        averageMonthlyIncome: avgIncome,
        averageMonthlyNetFlow: netFlow,
        suggestedSavings: 0,
        budgetStatus: 'no_budget',
      };

      // Calcola lo status del budget
      this.calculateBudgetStatus(categorySpending);

      // Per categorie primary, calcola budget configurato
      if (category.budgetLevel === 'primary') {
        if (
          category.monthlyBudget !== null &&
          category.monthlyBudget !== undefined
        ) {
          primaryBudgetConfigured += Number(category.monthlyBudget);
        }
      }

      categoryData.push(categorySpending);
    }

    // Separa per tipo
    const primaryCategories = categoryData.filter(
      (c) => c.budgetLevel === 'primary',
    );

    // 🔧 FIX: Restituiamo TUTTE le categorie secondary, non solo quelle con warnings
    const allSecondaryCategories = categoryData.filter(
      (c) => c.budgetLevel === 'secondary',
    );
    const secondaryWarnings = allSecondaryCategories.filter(
      (c) => c.budgetStatus === 'warning' || c.budgetStatus === 'over',
    );

    // 🔧 FIX: Restituiamo TUTTE le categorie optional, non solo le prime 5
    const allOptionalCategories = categoryData.filter(
      (c) => c.budgetLevel === 'optional',
    );

    // Calcola utilizzo budget mensile
    const totalBudgeted = categoryData.reduce((sum, c) => {
      // Per le categorie secondary, usa maxThreshold se disponibile, altrimenti monthlyBudget
      const budget =
        c.budgetLevel === 'secondary'
          ? c.maxThreshold || c.monthlyBudget || 0
          : c.monthlyBudget || 0;
      return sum + budget;
    }, 0);
    const totalSpent = categoryData.reduce(
      (sum, c) => sum + c.currentMonthSpent,
      0,
    );
    const budgetUtilization =
      totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

    // Calcola le medie mensili totali degli ultimi 12 mesi direttamente dalle transazioni
    // per avere dati coerenti e non doppi conteggi
    const totalFinancials = await this.getTotalMonthlyAverages(userId, 12);

    return {
      primaryBudgetConfigured,
      primaryCategoriesData: primaryCategories,
      secondaryWarnings,
      allSecondaryCategories,
      optionalSuggestions: allOptionalCategories.slice(0, 5), // Top 5 per backwards compatibility
      allOptionalCategories,
      monthlyBudgetUtilization: Math.round(budgetUtilization * 100) / 100,
      averageMonthlyIncome: Math.round(totalFinancials.income * 100) / 100,
      averageMonthlyExpenses: Math.round(totalFinancials.expenses * 100) / 100,
      averageMonthlyNetFlow: Math.round(totalFinancials.netFlow * 100) / 100,
    };
  }

  /**
   * Ottieni tutte le categorie con i loro dati di spesa per il budget management
   * Riutilizza la stessa logica dell'Annual Savings Plan
   */
  async getAllCategoriesWithSpendingData(
    userId: number,
  ): Promise<CategorySpending[]> {
    // Ottieni tutte le categorie
    const categories = await this.categoriesRepository.find({
      where: { user: { id: userId } },
    });

    // Calcola i flussi netti degli ultimi 12 mesi per ogni categoria
    const categoryNets = await this.getCategoryNetFlows(userId, 12);

    // Ottieni le spese del mese corrente per categoria
    const currentMonth = new Date();
    const startDate = startOfMonth(currentMonth);
    const endDate = endOfMonth(currentMonth);
    const currentMonthSpending = await this.getCurrentMonthSpending(
      userId,
      startDate,
      endDate,
    );

    const categoryData: CategorySpending[] = [];

    for (const category of categories) {
      const currentSpent = currentMonthSpending[category.name] || 0;
      const netData = categoryNets[category.name] || {
        income: 0,
        expense: 0,
        net: 0,
      };
      const avgSpending = netData.expense;
      const avgIncome = netData.income;
      const netFlow = netData.net;

      const categorySpending: CategorySpending = {
        categoryId: category.id,
        categoryName: category.name,
        budgetLevel: category.budgetLevel || 'optional',
        currentMonthSpent: currentSpent,
        monthlyBudget: category.monthlyBudget
          ? Number(category.monthlyBudget)
          : null,
        maxThreshold: category.maxThreshold
          ? Number(category.maxThreshold)
          : null,
        warningThreshold: category.warningThreshold
          ? Number(category.warningThreshold)
          : null,
        averageMonthlySpending: avgSpending,
        averageMonthlyIncome: avgIncome,
        averageMonthlyNetFlow: netFlow,
        suggestedSavings: 0,
        budgetStatus: 'no_budget',
      };

      // Calcola lo status del budget
      this.calculateBudgetStatus(categorySpending);

      categoryData.push(categorySpending);
    }

    // Ordina per flusso netto (più negativo = maggiore priorità)
    // Stesso ordinamento dell'Annual Savings Plan
    return categoryData.sort(
      (a, b) => a.averageMonthlyNetFlow - b.averageMonthlyNetFlow,
    );
  }

  /**
   * Suggerisci budget automatici basati sulla spesa storica
   */
  async suggestBudgets(userId: number): Promise<{
    [categoryName: string]: {
      monthly: number;
      level: string;
      reasoning: string;
    };
  }> {
    const averageSpending = await this.getAverageMonthlySpending(userId, 12);
    const suggestions: {
      [categoryName: string]: {
        monthly: number;
        level: string;
        reasoning: string;
      };
    } = {};

    for (const [categoryName, avgSpending] of Object.entries(averageSpending)) {
      if (avgSpending < 50) {
        // Spese molto basse - optional
        suggestions[categoryName] = {
          monthly: Math.ceil(avgSpending * 1.2), // 20% di margine
          level: 'optional',
          reasoning: 'Spesa bassa e variabile - categoria opzionale',
        };
      } else if (this.isPrimaryCategory(categoryName)) {
        // Categorie essenziali - primary
        suggestions[categoryName] = {
          monthly: Math.ceil(avgSpending * 1.1), // 10% di margine
          level: 'primary',
          reasoning: 'Spesa essenziale e regolare - categoria primaria',
        };
      } else if (avgSpending > 200) {
        // Spese significative ma controllabili - secondary
        suggestions[categoryName] = {
          monthly: Math.ceil(avgSpending * 1.15), // 15% di margine
          level: 'secondary',
          reasoning:
            'Spesa significativa ma controllabile - categoria secondaria',
        };
      } else {
        suggestions[categoryName] = {
          monthly: Math.ceil(avgSpending * 1.25), // 25% di margine
          level: 'optional',
          reasoning: 'Spesa variabile - categoria opzionale',
        };
      }
    }

    return suggestions;
  }

  private calculateBudgetStatus(categorySpending: CategorySpending): void {
    const {
      currentMonthSpent,
      monthlyBudget,
      maxThreshold,
      warningThreshold,
      budgetLevel,
    } = categorySpending;

    if (!monthlyBudget && !maxThreshold) {
      categorySpending.budgetStatus = 'no_budget';
      return;
    }

    const budget = budgetLevel === 'secondary' ? maxThreshold : monthlyBudget;
    if (!budget) {
      categorySpending.budgetStatus = 'no_budget';
      return;
    }

    const utilizationPercentage = (currentMonthSpent / budget) * 100;
    const warningLimit = warningThreshold || 80; // Default 80%

    if (utilizationPercentage >= 100) {
      categorySpending.budgetStatus = 'over';
      categorySpending.warningMessage = `Budget superato del ${Math.round(utilizationPercentage - 100)}%`;
    } else if (utilizationPercentage >= warningLimit) {
      categorySpending.budgetStatus = 'warning';
      categorySpending.warningMessage = `Attenzione: utilizzato ${Math.round(utilizationPercentage)}% del budget`;
    } else {
      categorySpending.budgetStatus = 'under';
    }
  }

  private async getCurrentMonthSpending(
    userId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<{ [categoryName: string]: number }> {
    const spending = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .select('category.name', 'categoryName')
      .addSelect('SUM(ABS(transaction.amount))', 'totalSpent')
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

    const result: { [categoryName: string]: number } = {};
    spending.forEach((item) => {
      result[item.categoryName || 'Uncategorized'] =
        Number(item.totalSpent) || 0;
    });

    return result;
  }

  private async getAverageMonthlySpending(
    userId: number,
    months: number,
  ): Promise<{ [categoryName: string]: number }> {
    const endDate = new Date();
    const startDate = subMonths(endDate, months);

    const spending = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .select('category.name', 'categoryName')
      .addSelect('SUM(ABS(transaction.amount))', 'totalSpent')
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

    const result: { [categoryName: string]: number } = {};
    spending.forEach((item) => {
      const totalSpent = Number(item.totalSpent) || 0;
      result[item.categoryName || 'Uncategorized'] = totalSpent / months;
    });

    return result;
  }

  private async getCategoryNetFlows(
    userId: number,
    months: number,
  ): Promise<{
    [categoryName: string]: { income: number; expense: number; net: number };
  }> {
    const endDate = new Date();
    const startDate = subMonths(endDate, months);

    // 🔧 FIX: Get income transactions WITHOUT excludeFromExpenseAnalytics filter
    // (excludeFromExpenseAnalytics should only exclude expenses, not income)
    const incomeTransactions = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .select('category.name', 'categoryName')
      .addSelect('SUM(ABS(transaction.amount))', 'amount')
      .where('transaction.user.id = :userId', { userId })
      .andWhere('transaction.type = :incomeType', { incomeType: 'income' })
      .andWhere('transaction.executionDate BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      })
      .groupBy('category.name')
      .getRawMany();

    // 🔧 FIX: Get expense transactions WITH excludeFromExpenseAnalytics filter
    // (only exclude expenses from categories marked excludeFromExpenseAnalytics)
    const expenseTransactions = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .select('category.name', 'categoryName')
      .addSelect('SUM(ABS(transaction.amount))', 'amount')
      .where('transaction.user.id = :userId', { userId })
      .andWhere('transaction.type = :expenseType', { expenseType: 'expense' })
      .andWhere('transaction.executionDate BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      })
      .andWhere(
        '(category.excludeFromExpenseAnalytics IS NULL OR category.excludeFromExpenseAnalytics = false)',
      )
      .groupBy('category.name')
      .getRawMany();

    // Calculate net per category
    const categoryNets: Record<
      string,
      { income: number; expense: number; net: number }
    > = {};

    // Process income transactions
    incomeTransactions.forEach((item) => {
      const categoryName = item.categoryName || 'Uncategorized';
      const amount = Number(item.amount) || 0;

      if (!categoryNets[categoryName]) {
        categoryNets[categoryName] = { income: 0, expense: 0, net: 0 };
      }

      categoryNets[categoryName].income += amount;
    });

    // Process expense transactions
    expenseTransactions.forEach((item) => {
      const categoryName = item.categoryName || 'Uncategorized';
      const amount = Number(item.amount) || 0;

      if (!categoryNets[categoryName]) {
        categoryNets[categoryName] = { income: 0, expense: 0, net: 0 };
      }

      categoryNets[categoryName].expense += amount;
    });

    // Calculate net flow for each category
    Object.keys(categoryNets).forEach((categoryName) => {
      categoryNets[categoryName].net =
        categoryNets[categoryName].income - categoryNets[categoryName].expense;
    });

    // Convert to monthly averages
    Object.keys(categoryNets).forEach((categoryName) => {
      categoryNets[categoryName].income =
        categoryNets[categoryName].income / months;
      categoryNets[categoryName].expense =
        categoryNets[categoryName].expense / months;
      categoryNets[categoryName].net = categoryNets[categoryName].net / months;
    });

    return categoryNets;
  }

  private async getTotalMonthlyAverages(
    userId: number,
    months: number,
  ): Promise<{ income: number; expenses: number; netFlow: number }> {
    const endDate = new Date();
    const startDate = subMonths(endDate, months);

    // 🔧 FIX: Get income transactions WITHOUT excludeFromExpenseAnalytics filter
    // (excludeFromExpenseAnalytics should only exclude expenses, not income)
    const incomeTotal = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .select('SUM(ABS(transaction.amount))', 'total')
      .where('transaction.user.id = :userId', { userId })
      .andWhere('transaction.type = :incomeType', { incomeType: 'income' })
      .andWhere('transaction.executionDate BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      })
      .getRawOne();

    // 🔧 FIX: Get expense transactions WITH excludeFromExpenseAnalytics filter
    // (only exclude expenses from categories marked excludeFromExpenseAnalytics)
    const expenseTotal = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .select('SUM(ABS(transaction.amount))', 'total')
      .where('transaction.user.id = :userId', { userId })
      .andWhere('transaction.type = :expenseType', { expenseType: 'expense' })
      .andWhere('transaction.executionDate BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      })
      .andWhere(
        '(category.excludeFromExpenseAnalytics IS NULL OR category.excludeFromExpenseAnalytics = false)',
      )
      .getRawOne();

    const totalIncome = Number(incomeTotal?.total || 0);
    const totalExpenses = Number(expenseTotal?.total || 0);

    // Converti in medie mensili
    const monthlyIncome = totalIncome / months;
    const monthlyExpenses = totalExpenses / months;
    const monthlyNetFlow = monthlyIncome - monthlyExpenses;

    return {
      income: monthlyIncome,
      expenses: monthlyExpenses,
      netFlow: monthlyNetFlow,
    };
  }

  async getCategoryTransactions(
    userId: number,
    categoryId: number,
    months: number = 12,
  ): Promise<{
    transactions: any[];
    summary: {
      totalIncome: number;
      totalExpenses: number;
      netFlow: number;
      transactionCount: number;
      averageMonthlyIncome: number;
      averageMonthlyExpenses: number;
      averageMonthlyNetFlow: number;
    };
  }> {
    const endDate = new Date();
    const startDate = subMonths(endDate, months);

    // Get all transactions for this category in the specified period
    const transactions = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .leftJoin('transaction.bankAccount', 'bankAccount')
      .leftJoin('transaction.creditCard', 'creditCard')
      .select([
        'transaction.id',
        'transaction.executionDate',
        'transaction.amount',
        'transaction.type',
        'transaction.description',
        'transaction.source',
        'bankAccount.name',
        'creditCard.name',
      ])
      .where('transaction.user.id = :userId', { userId })
      .andWhere('category.id = :categoryId', { categoryId })
      .andWhere('transaction.executionDate BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      })
      .orderBy('transaction.executionDate', 'DESC')
      .getRawMany();

    // Calculate summary statistics
    let totalIncome = 0;
    let totalExpenses = 0;
    const transactionCount = transactions.length;

    const processedTransactions = transactions.map((tx) => {
      const amount = Math.abs(Number(tx.transaction_amount) || 0);
      const isIncome = tx.transaction_type === 'income';

      if (isIncome) {
        totalIncome += amount;
      } else {
        totalExpenses += amount;
      }

      return {
        id: tx.transaction_id,
        date: tx.transaction_executionDate,
        amount: amount,
        type: tx.transaction_type,
        description: tx.transaction_description,
        source: tx.transaction_source,
        account: tx.bankAccount_name || tx.creditCard_name || 'Unknown',
        isIncome: isIncome,
      };
    });

    const netFlow = totalIncome - totalExpenses;
    const averageMonthlyIncome = totalIncome / months;
    const averageMonthlyExpenses = totalExpenses / months;
    const averageMonthlyNetFlow = netFlow / months;

    return {
      transactions: processedTransactions,
      summary: {
        totalIncome: Math.round(totalIncome * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        netFlow: Math.round(netFlow * 100) / 100,
        transactionCount,
        averageMonthlyIncome: Math.round(averageMonthlyIncome * 100) / 100,
        averageMonthlyExpenses: Math.round(averageMonthlyExpenses * 100) / 100,
        averageMonthlyNetFlow: Math.round(averageMonthlyNetFlow * 100) / 100,
      },
    };
  }

  private isPrimaryCategory(categoryName: string): boolean {
    const primaryKeywords = [
      'mortgage',
      'mutuo',
      'rent',
      'affitto',
      'groceries',
      'spesa',
      'alimentari',
      'electricity',
      'gas',
      'water',
      'internet',
      'insurance',
      'assicurazione',
      'utilities',
      'utenze',
    ];

    return primaryKeywords.some((keyword) =>
      categoryName.toLowerCase().includes(keyword.toLowerCase()),
    );
  }
}
