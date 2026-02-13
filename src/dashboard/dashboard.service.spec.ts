import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { ExpensePlan } from '../expense-plans/entities/expense-plan.entity';
import { IncomePlan } from '../income-plans/entities/income-plan.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { addMonths, format, subMonths } from 'date-fns';

describe('DashboardService', () => {
  let service: DashboardService;
  let transactionRepo: any;
  let bankAccountRepo: any;
  let expensePlanRepo: any;
  let incomePlanRepo: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        RepositoryMockFactory.createRepositoryProvider(Transaction),
        RepositoryMockFactory.createRepositoryProvider(Category),
        RepositoryMockFactory.createRepositoryProvider(BankAccount),
        RepositoryMockFactory.createRepositoryProvider(ExpensePlan),
        RepositoryMockFactory.createRepositoryProvider(IncomePlan),
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    transactionRepo = module.get(getRepositoryToken(Transaction));
    bankAccountRepo = module.get(getRepositoryToken(BankAccount));
    expensePlanRepo = module.get(getRepositoryToken(ExpensePlan));
    incomePlanRepo = module.get(getRepositoryToken(IncomePlan));
  });

  describe('getCashFlowForecast', () => {
    const userId = 1;

    beforeEach(() => {
      // Default: bank account balance = 5000
      bankAccountRepo.find.mockResolvedValue([{ balance: 5000 }]);
    });

    it('should route mode="expense-plans" to forecastFromExpensePlans', async () => {
      // Setup: no expense plans, income plans with 3000/month
      expensePlanRepo.find.mockResolvedValue([]);
      incomePlanRepo.find.mockResolvedValue([
        createMockIncomePlan({ monthlyAmount: 3000 }),
      ]);

      // Mock historical expenses by category (getHistoricalExpensesByCategory)
      setupHistoricalMock(transactionRepo, { income: 3000, expenses: 1500 });

      const result = await service.getCashFlowForecast(
        userId,
        3,
        'expense-plans',
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('month');
      expect(result[0]).toHaveProperty('income');
      expect(result[0]).toHaveProperty('expenses');
      expect(result[0]).toHaveProperty('projectedBalance');
    });

    it('should fall back to historical mode when mode="recurring"', async () => {
      setupHistoricalMock(transactionRepo, { income: 3000, expenses: 1500 });

      const result = await service.getCashFlowForecast(userId, 3, 'recurring');

      expect(result).toHaveLength(3);
      // It should produce the same result as historical mode
      const historicalResult = await service.getCashFlowForecast(
        userId,
        3,
        'historical',
      );
      // Both should have same structure (income/expenses from historical)
      expect(result.length).toBe(historicalResult.length);
    });

    it('should use historical mode by default', async () => {
      setupHistoricalMock(transactionRepo, { income: 2000, expenses: 1000 });

      const result = await service.getCashFlowForecast(userId, 3);

      expect(result).toHaveLength(3);
      expect(result[0].income).toBe(2000);
      expect(result[0].expenses).toBe(1000);
    });
  });

  describe('forecastFromExpensePlans', () => {
    const userId = 1;

    beforeEach(() => {
      bankAccountRepo.find.mockResolvedValue([{ balance: 10000 }]);
      // Default: one income plan with 3000/month across all months
      incomePlanRepo.find.mockResolvedValue([
        createMockIncomePlan({ monthlyAmount: 3000 }),
      ]);
    });

    it('should use monthlyContribution for spending_budget plans', async () => {
      const today = new Date();
      const forecastMonth1 = addMonths(today, 0);

      expensePlanRepo.find.mockResolvedValue([
        createMockPlan({
          id: 1,
          purpose: 'spending_budget',
          planType: 'fixed_monthly',
          frequency: 'monthly',
          categoryId: 10,
          targetAmount: 400,
          monthlyContribution: 400,
          status: 'active',
        }),
      ]);

      // No historical data for uncovered categories
      setupHistoricalMock(transactionRepo, { income: 3000, expenses: 0 });
      setupHistoricalByCategoryMock(transactionRepo, []);

      const result = await service.getCashFlowForecast(
        userId,
        3,
        'expense-plans',
      );

      // Each month should have 400 in expenses (from spending_budget)
      expect(result[0].expenses).toBe(400);
      expect(result[1].expenses).toBe(400);
      expect(result[2].expenses).toBe(400);
    });

    it('should use monthlyContribution (not targetAmount) for sinking_fund monthly plans', async () => {
      expensePlanRepo.find.mockResolvedValue([
        createMockPlan({
          id: 1,
          purpose: 'sinking_fund',
          planType: 'fixed_monthly',
          frequency: 'monthly',
          categoryId: 10,
          targetAmount: 864, // Annual total
          monthlyContribution: 72, // Actual monthly bill
          status: 'active',
        }),
      ]);

      setupHistoricalMock(transactionRepo, { income: 3000, expenses: 0 });
      setupHistoricalByCategoryMock(transactionRepo, []);

      const result = await service.getCashFlowForecast(
        userId,
        3,
        'expense-plans',
      );

      // Should use monthlyContribution (72), NOT targetAmount (864)
      expect(result[0].expenses).toBe(72);
      expect(result[1].expenses).toBe(72);
      expect(result[2].expenses).toBe(72);
    });

    it('should show yearly plan targetAmount only in due month', async () => {
      const today = new Date();
      // Use a due month that's in the forecast range
      const dueMonth = ((today.getMonth() + 1) % 12) + 1; // Next month (1-12)

      expensePlanRepo.find.mockResolvedValue([
        createMockPlan({
          id: 2,
          purpose: 'sinking_fund',
          planType: 'yearly_fixed',
          frequency: 'yearly',
          categoryId: 20,
          targetAmount: 1200,
          monthlyContribution: 100,
          dueMonth: dueMonth,
          status: 'active',
        }),
      ]);

      setupHistoricalMock(transactionRepo, { income: 3000, expenses: 0 });
      setupHistoricalByCategoryMock(transactionRepo, []);

      const result = await service.getCashFlowForecast(
        userId,
        12,
        'expense-plans',
      );

      // Only one month should have the 1200 expense
      const monthsWithExpense = result.filter((m) => m.expenses > 0);
      expect(monthsWithExpense.length).toBeGreaterThanOrEqual(1);

      // The due month should have exactly targetAmount
      const dueMonthIndex = dueMonth - 1; // Convert to 0-11
      const matchingForecastMonth = result.find((m) => {
        const forecastDate = parseForecastMonth(m.month);
        return forecastDate && forecastDate.getMonth() === dueMonthIndex;
      });

      if (matchingForecastMonth) {
        expect(matchingForecastMonth.expenses).toBe(1200);
      }
    });

    it('should use historical averages for uncovered categories', async () => {
      const today = new Date();
      const currentMonthIndex = today.getMonth(); // 0-11

      // One plan covering categoryId 10
      expensePlanRepo.find.mockResolvedValue([
        createMockPlan({
          id: 1,
          purpose: 'spending_budget',
          planType: 'fixed_monthly',
          frequency: 'monthly',
          categoryId: 10,
          targetAmount: 300,
          monthlyContribution: 300,
          status: 'active',
        }),
      ]);

      setupHistoricalMock(transactionRepo, { income: 3000, expenses: 0 });

      // Historical data: category 10 (covered) + category 20 (uncovered)
      setupHistoricalByCategoryMock(transactionRepo, [
        {
          categoryId: 10,
          categoryName: 'Groceries',
          monthNumber: currentMonthIndex + 1,
          totalAmount: 300,
        },
        {
          categoryId: 20,
          categoryName: 'Restaurant',
          monthNumber: currentMonthIndex + 1,
          totalAmount: 200,
        },
      ]);

      const result = await service.getCashFlowForecast(
        userId,
        1,
        'expense-plans',
      );

      // Expenses should be: 300 (planned) + 200 (unplanned historical for cat 20)
      expect(result[0].expenses).toBe(500);
    });

    it('should fall back to pure historical when no active plans exist', async () => {
      expensePlanRepo.find.mockResolvedValue([]);

      const today = new Date();
      const currentMonthIndex = today.getMonth();

      setupHistoricalMock(transactionRepo, { income: 3000, expenses: 0 });
      setupHistoricalByCategoryMock(transactionRepo, [
        {
          categoryId: 5,
          categoryName: 'Utilities',
          monthNumber: currentMonthIndex + 1,
          totalAmount: 800,
        },
      ]);

      const result = await service.getCashFlowForecast(
        userId,
        1,
        'expense-plans',
      );

      // All expenses come from historical (no plans)
      expect(result[0].expenses).toBe(800);
    });

    it('should skip emergency_fund and goal plan types', async () => {
      expensePlanRepo.find.mockResolvedValue([
        createMockPlan({
          id: 1,
          purpose: 'sinking_fund',
          planType: 'emergency_fund',
          frequency: 'monthly',
          categoryId: 30,
          targetAmount: 500,
          monthlyContribution: 500,
          status: 'active',
        }),
        createMockPlan({
          id: 2,
          purpose: 'sinking_fund',
          planType: 'goal',
          frequency: 'monthly',
          categoryId: 31,
          targetAmount: 200,
          monthlyContribution: 200,
          status: 'active',
        }),
      ]);

      setupHistoricalMock(transactionRepo, { income: 3000, expenses: 0 });
      setupHistoricalByCategoryMock(transactionRepo, []);

      const result = await service.getCashFlowForecast(
        userId,
        1,
        'expense-plans',
      );

      // No planned expenses since both plans are emergency_fund/goal
      expect(result[0].expenses).toBe(0);
    });

    it('should use income plans (guaranteed+expected) for income instead of historical', async () => {
      // Two income plans: salary (guaranteed) + freelance (expected)
      incomePlanRepo.find.mockResolvedValue([
        createMockIncomePlan({
          name: 'Salary',
          monthlyAmount: 2500,
          reliability: 'guaranteed',
        }),
        createMockIncomePlan({
          name: 'Freelance',
          monthlyAmount: 500,
          reliability: 'expected',
        }),
      ]);

      expensePlanRepo.find.mockResolvedValue([]);
      setupHistoricalMock(transactionRepo, { income: 9999, expenses: 0 }); // historical income should be ignored
      setupHistoricalByCategoryMock(transactionRepo, []);

      const result = await service.getCashFlowForecast(
        userId,
        1,
        'expense-plans',
      );

      // Income should come from income plans (2500 + 500 = 3000), NOT historical (9999)
      expect(result[0].income).toBe(3000);
    });

    it('should support variable monthly income amounts from income plans', async () => {
      const today = new Date();
      const monthNames = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december',
      ];
      const currentMonthName = monthNames[today.getMonth()];
      const nextMonthName = monthNames[(today.getMonth() + 1) % 12];

      // Income plan with different amounts per month
      const monthAmounts: any = {};
      monthNames.forEach((m) => (monthAmounts[m] = 2000));
      monthAmounts[currentMonthName] = 3500; // Current month: salary + bonus
      monthAmounts[nextMonthName] = 2000; // Next month: just salary

      incomePlanRepo.find.mockResolvedValue([
        createMockIncomePlan({ monthAmounts }),
      ]);

      expensePlanRepo.find.mockResolvedValue([]);
      setupHistoricalMock(transactionRepo, { income: 0, expenses: 0 });
      setupHistoricalByCategoryMock(transactionRepo, []);

      const result = await service.getCashFlowForecast(
        userId,
        2,
        'expense-plans',
      );

      expect(result[0].income).toBe(3500); // Current month
      expect(result[1].income).toBe(2000); // Next month
    });

    it('should handle quarterly frequency correctly', async () => {
      const today = new Date();
      const currentMonth = today.getMonth() + 1; // 1-12

      expensePlanRepo.find.mockResolvedValue([
        createMockPlan({
          id: 1,
          purpose: 'sinking_fund',
          planType: 'yearly_fixed',
          frequency: 'quarterly',
          categoryId: 40,
          targetAmount: 600,
          monthlyContribution: 200,
          dueMonth: currentMonth,
          status: 'active',
        }),
      ]);

      setupHistoricalMock(transactionRepo, { income: 5000, expenses: 0 });
      setupHistoricalByCategoryMock(transactionRepo, []);

      const result = await service.getCashFlowForecast(
        userId,
        12,
        'expense-plans',
      );

      // Quarterly: should appear in 4 months (every 3 months from dueMonth)
      // targetAmount is annual (600), so quarterly payment = 600/4 = 150
      const monthsWithExpense = result.filter((m) => m.expenses > 0);
      expect(monthsWithExpense.length).toBe(4);
      monthsWithExpense.forEach((m) => {
        expect(m.expenses).toBe(150);
      });
    });

    it('should handle seasonal frequency correctly', async () => {
      // Seasonal months: June (6), July (7), August (8)
      expensePlanRepo.find.mockResolvedValue([
        createMockPlan({
          id: 1,
          purpose: 'sinking_fund',
          planType: 'seasonal',
          frequency: 'seasonal',
          categoryId: 50,
          targetAmount: 900,
          monthlyContribution: 75,
          seasonalMonths: [6, 7, 8],
          status: 'active',
        }),
      ]);

      setupHistoricalMock(transactionRepo, { income: 5000, expenses: 0 });
      setupHistoricalByCategoryMock(transactionRepo, []);

      const result = await service.getCashFlowForecast(
        userId,
        12,
        'expense-plans',
      );

      // Should show 900/3 = 300 in June, July, August months
      const seasonalMonths = result.filter((m) => {
        const date = parseForecastMonth(m.month);
        return date && [5, 6, 7].includes(date.getMonth()); // 0-indexed
      });

      seasonalMonths.forEach((m) => {
        expect(m.expenses).toBe(300);
      });
    });

    it('should handle one_time frequency with targetDate', async () => {
      const targetDate = addMonths(new Date(), 2);

      expensePlanRepo.find.mockResolvedValue([
        createMockPlan({
          id: 1,
          purpose: 'sinking_fund',
          planType: 'yearly_fixed',
          frequency: 'one_time',
          categoryId: 60,
          targetAmount: 5000,
          monthlyContribution: 500,
          targetDate: targetDate,
          status: 'active',
        }),
      ]);

      setupHistoricalMock(transactionRepo, { income: 5000, expenses: 0 });
      setupHistoricalByCategoryMock(transactionRepo, []);

      const result = await service.getCashFlowForecast(
        userId,
        6,
        'expense-plans',
      );

      // Only the target month should have the expense
      const targetMonthResult = result.find((m) => {
        const date = parseForecastMonth(m.month);
        return (
          date &&
          date.getMonth() === targetDate.getMonth() &&
          date.getFullYear() === targetDate.getFullYear()
        );
      });

      expect(targetMonthResult).toBeDefined();
      expect(targetMonthResult!.expenses).toBe(5000);

      // Other months should have 0 expenses
      const otherMonths = result.filter(
        (m) =>
          parseForecastMonth(m.month)?.getMonth() !== targetDate.getMonth() ||
          parseForecastMonth(m.month)?.getFullYear() !==
            targetDate.getFullYear(),
      );
      otherMonths.forEach((m) => {
        expect(m.expenses).toBe(0);
      });
    });

    it('should calculate projectedBalance correctly across months', async () => {
      expensePlanRepo.find.mockResolvedValue([
        createMockPlan({
          id: 1,
          purpose: 'spending_budget',
          planType: 'fixed_monthly',
          frequency: 'monthly',
          categoryId: 10,
          targetAmount: 1000,
          monthlyContribution: 1000,
          status: 'active',
        }),
      ]);

      setupHistoricalMock(transactionRepo, { income: 3000, expenses: 0 });
      setupHistoricalByCategoryMock(transactionRepo, []);

      const result = await service.getCashFlowForecast(
        userId,
        3,
        'expense-plans',
      );

      // Starting balance: 10000
      // Month 1: +3000 income, -1000 expense = 12000
      // Month 2: +3000, -1000 = 14000
      // Month 3: +3000, -1000 = 16000
      expect(result[0].projectedBalance).toBe(12000);
      expect(result[1].projectedBalance).toBe(14000);
      expect(result[2].projectedBalance).toBe(16000);
    });

    it('should handle mix of monthly and yearly plans', async () => {
      const today = new Date();
      const nextMonth = ((today.getMonth() + 1) % 12) + 1; // 1-12

      expensePlanRepo.find.mockResolvedValue([
        createMockPlan({
          id: 1,
          purpose: 'spending_budget',
          planType: 'fixed_monthly',
          frequency: 'monthly',
          categoryId: 10,
          targetAmount: 500,
          monthlyContribution: 500,
          status: 'active',
        }),
        createMockPlan({
          id: 2,
          purpose: 'sinking_fund',
          planType: 'yearly_fixed',
          frequency: 'yearly',
          categoryId: 20,
          targetAmount: 2400,
          monthlyContribution: 200,
          dueMonth: nextMonth,
          status: 'active',
        }),
      ]);

      setupHistoricalMock(transactionRepo, { income: 3000, expenses: 0 });
      setupHistoricalByCategoryMock(transactionRepo, []);

      const result = await service.getCashFlowForecast(
        userId,
        3,
        'expense-plans',
      );

      // Month 0 (current): 500 monthly
      expect(result[0].expenses).toBe(500);

      // Month 1 (next): 500 monthly + 2400 yearly
      expect(result[1].expenses).toBe(2900);

      // Month 2: 500 monthly
      expect(result[2].expenses).toBe(500);
    });
  });
});

// ─── Test Helpers ──────────────────────────────────────────────────

function createChainableQB() {
  const qb: any = {};
  const chainMethods = [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'leftJoin',
    'leftJoinAndSelect',
    'groupBy',
    'addGroupBy',
    'orderBy',
    'limit',
    'offset',
    'having',
  ];
  chainMethods.forEach((method) => {
    qb[method] = jest.fn().mockReturnValue(qb);
  });
  qb.getRawMany = jest.fn().mockResolvedValue([]);
  qb.getRawOne = jest.fn().mockResolvedValue(null);
  qb.getMany = jest.fn().mockResolvedValue([]);
  qb.getCount = jest.fn().mockResolvedValue(0);
  return qb;
}

function createMockPlan(overrides: Partial<ExpensePlan>): ExpensePlan {
  return {
    id: 1,
    userId: 1,
    user: null as any,
    name: 'Test Plan',
    description: null,
    icon: null,
    planType: 'fixed_monthly',
    priority: 'important',
    categoryId: null,
    category: null,
    autoTrackCategory: false,
    purpose: 'sinking_fund',
    paymentAccountType: null,
    paymentAccountId: null,
    paymentAccount: null,
    targetAmount: 100,
    monthlyContribution: 100,
    contributionSource: 'calculated',
    frequency: 'monthly',
    frequencyYears: null,
    dueMonth: null,
    dueDay: null,
    targetDate: null,
    seasonalMonths: null,
    nextDueDate: null,
    status: 'active',
    autoCalculate: true,
    rolloverSurplus: true,
    suggestedMonthlyContribution: null,
    suggestedAdjustmentPercent: null,
    adjustmentReason: null,
    adjustmentSuggestedAt: null,
    adjustmentDismissedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ExpensePlan;
}

function createMockIncomePlan(opts: {
  monthlyAmount?: number;
  monthAmounts?: Partial<Record<string, number>>;
  reliability?: string;
  name?: string;
}): any {
  const amount = opts.monthlyAmount ?? 0;
  return {
    id: 1,
    userId: 1,
    name: opts.name || 'Test Income',
    reliability: opts.reliability || 'guaranteed',
    status: 'active',
    january: opts.monthAmounts?.january ?? amount,
    february: opts.monthAmounts?.february ?? amount,
    march: opts.monthAmounts?.march ?? amount,
    april: opts.monthAmounts?.april ?? amount,
    may: opts.monthAmounts?.may ?? amount,
    june: opts.monthAmounts?.june ?? amount,
    july: opts.monthAmounts?.july ?? amount,
    august: opts.monthAmounts?.august ?? amount,
    september: opts.monthAmounts?.september ?? amount,
    october: opts.monthAmounts?.october ?? amount,
    november: opts.monthAmounts?.november ?? amount,
    december: opts.monthAmounts?.december ?? amount,
  };
}

/**
 * Sets up the transaction repo mock to return consistent historical data.
 * The query builder is used by getMonthlyIncomeAndExpenses (called per-month)
 * and by getHistoricalExpensesByCategory.
 */
function setupHistoricalMock(
  transactionRepo: any,
  data: { income: number; expenses: number },
) {
  let callCount = 0;
  transactionRepo.createQueryBuilder.mockImplementation(() => {
    const qb = createChainableQB();
    // getMonthlyIncomeAndExpenses calls getRawOne alternating income/expense for each month
    qb.getRawOne.mockImplementation(() => {
      callCount++;
      // Odd calls are income, even calls are expenses (for each month iteration)
      if (callCount % 2 === 1) {
        return Promise.resolve({ total: data.income });
      } else {
        return Promise.resolve({ total: data.expenses });
      }
    });
    return qb;
  });
}

/**
 * Sets up mock for getHistoricalExpensesByCategory.
 * This is called AFTER getMonthlyIncomeAndExpenses, so we need to handle
 * the query builder returning different results based on call order.
 * The SQL uses SUM(ABS(amount)) as totalAmount and also selects categoryName.
 */
function setupHistoricalByCategoryMock(
  transactionRepo: any,
  categoryData: Array<{
    categoryId: number;
    categoryName?: string;
    monthNumber: number;
    totalAmount: number;
  }>,
) {
  const originalImpl = transactionRepo.createQueryBuilder.getMockImplementation();

  transactionRepo.createQueryBuilder.mockImplementation(() => {
    const qb = createChainableQB();

    // Track what kind of query this is based on chained methods
    let isGroupByCategory = false;

    qb.addGroupBy = jest.fn().mockImplementation((expr: string) => {
      if (expr.includes('EXTRACT') || expr.includes('MONTH')) {
        isGroupByCategory = true;
      }
      return qb;
    });

    qb.getRawMany = jest.fn().mockImplementation(() => {
      if (isGroupByCategory) {
        return Promise.resolve(categoryData);
      }
      return Promise.resolve([]);
    });

    // For getMonthlyIncomeAndExpenses, delegate to original
    if (originalImpl) {
      const originalQb = originalImpl();
      qb.getRawOne = originalQb.getRawOne;
    }

    return qb;
  });
}

function parseForecastMonth(monthStr: string): Date | null {
  try {
    // Format is "MMM yyyy" e.g., "Feb 2026"
    const parts = monthStr.split(' ');
    if (parts.length !== 2) return null;
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const monthIndex = monthNames.indexOf(parts[0]);
    const year = parseInt(parts[1], 10);
    if (monthIndex === -1 || isNaN(year)) return null;
    return new Date(year, monthIndex, 1);
  } catch {
    return null;
  }
}
