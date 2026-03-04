import { Test, TestingModule } from '@nestjs/testing';
import { FreeToSpendService } from './free-to-spend.service';
import { Transaction } from '../transactions/transaction.entity';
import { ExpensePlan } from '../expense-plans/entities/expense-plan.entity';
import { IncomePlansService } from '../income-plans/income-plans.service';
import { ExpensePlansService } from '../expense-plans/expense-plans.service';
import { EnvelopeBalanceService } from '../expense-plans/envelope-balance.service';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

describe('FreeToSpendService', () => {
  let service: FreeToSpendService;
  let transactionRepository: Repository<Transaction>;
  let expensePlanRepository: Repository<ExpensePlan>;
  let incomePlansService: IncomePlansService;
  let expensePlansService: ExpensePlansService;
  let envelopeBalanceService: EnvelopeBalanceService;
  let module: TestingModule;

  const mockUser = {
    id: 1,
    auth0Id: 'auth0|123456',
    email: 'test@example.com',
  };

  const mockMonthlySummary = {
    year: 2026,
    month: 1,
    guaranteedTotal: 5000,
    expectedTotal: 500,
    uncertainTotal: 200,
    totalIncome: 5700,
    budgetSafeIncome: 5000,
    planCount: 3,
    plans: [
      {
        id: 1,
        name: 'Salary',
        icon: '💼',
        reliability: 'guaranteed',
        annualTotal: 60000,
        monthlyAverage: 5000,
        currentMonthExpected: 5000,
      },
      {
        id: 2,
        name: 'Freelance',
        icon: '💻',
        reliability: 'expected',
        annualTotal: 6000,
        monthlyAverage: 500,
        currentMonthExpected: 500,
      },
      {
        id: 3,
        name: 'Gifts',
        icon: '🎁',
        reliability: 'uncertain',
        annualTotal: 2400,
        monthlyAverage: 200,
        currentMonthExpected: 200,
      },
    ],
  };

  const mockExpensePlans: Partial<ExpensePlan>[] = [
    {
      id: 1,
      userId: 1,
      name: 'Rent',
      icon: '🏠',
      planType: 'fixed_monthly',
      purpose: 'sinking_fund',
      priority: 'essential',
      targetAmount: 1200,
      monthlyContribution: 1200, // Fixed monthly plans have contribution = target
      categoryId: 10,
      dueDay: 1,
    },
    {
      id: 2,
      userId: 1,
      name: 'Utilities',
      icon: '💡',
      planType: 'fixed_monthly',
      purpose: 'sinking_fund',
      priority: 'essential',
      targetAmount: 150,
      monthlyContribution: 150,
      categoryId: 11,
      dueDay: 15,
    },
    {
      id: 3,
      userId: 1,
      name: 'Emergency Fund',
      icon: '🆘',
      planType: 'goal',
      purpose: 'sinking_fund',
      priority: 'important',
      targetAmount: 10000,
      monthlyContribution: 200,
      categoryId: null,
    },
    {
      id: 4,
      userId: 1,
      name: 'Groceries Budget',
      icon: '🛒',
      planType: 'fixed_monthly',
      purpose: 'spending_budget',
      priority: 'essential',
      targetAmount: 400,
      monthlyContribution: 400,
      categoryId: 12,
      dueDay: 1,
    },
  ];

  const mockTransactions: Partial<Transaction>[] = [
    {
      id: 1,
      type: 'expense',
      amount: -50,
      description: 'Coffee shop',
      executionDate: new Date('2026-01-15'),
      category: { id: 20, name: 'Dining Out' } as any,
    },
    {
      id: 2,
      type: 'expense',
      amount: -30,
      description: 'Uber ride',
      executionDate: new Date('2026-01-10'),
      category: { id: 21, name: 'Transportation' } as any,
    },
    {
      id: 3,
      type: 'expense',
      amount: -100,
      description: 'Restaurant dinner',
      executionDate: new Date('2026-01-20'),
      category: { id: 20, name: 'Dining Out' } as any,
    },
    {
      id: 4,
      type: 'expense',
      amount: -350,
      description: 'Weekly groceries',
      executionDate: new Date('2026-01-08'),
      category: { id: 12, name: 'Groceries' } as any, // This is budget-tracked
    },
  ];

  // Default mock for envelope balance service
  const mockEnvelopeBufferSummary = {
    year: 2026,
    month: 1,
    totalBuffer: 200,
    totalPositiveBalance: 200,
    planBuffers: [
      {
        planId: 1,
        planName: 'Rent',
        planIcon: '🏠',
        purpose: 'sinking_fund',
        previousBalance: 0,
        monthlyAllocation: 1200,
        actualSpending: 1000,
        currentBalance: 200,
        rolloverSurplus: true,
        status: 'under_budget',
        utilizationPercent: 83.3,
      },
    ],
    byPurpose: {
      sinkingFunds: [],
      spendingBudgets: [],
    },
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        FreeToSpendService,
        RepositoryMockFactory.createRepositoryProvider(Transaction),
        RepositoryMockFactory.createRepositoryProvider(ExpensePlan),
        {
          provide: IncomePlansService,
          useValue: {
            getMonthlySummary: jest.fn().mockResolvedValue(mockMonthlySummary),
          },
        },
        {
          provide: ExpensePlansService,
          useValue: {
            findActiveByUser: jest.fn().mockResolvedValue(mockExpensePlans),
            // Note: calculateObligationForPeriod is no longer used by FreeToSpendService
            // as it now uses monthlyContribution directly for all plans
          },
        },
        {
          provide: EnvelopeBalanceService,
          useValue: {
            getTotalEnvelopeBuffer: jest
              .fn()
              .mockResolvedValue(mockEnvelopeBufferSummary),
          },
        },
      ],
    }).compile();

    service = module.get<FreeToSpendService>(FreeToSpendService);
    transactionRepository = module.get(getRepositoryToken(Transaction));
    expensePlanRepository = module.get(getRepositoryToken(ExpensePlan));
    incomePlansService = module.get<IncomePlansService>(IncomePlansService);
    expensePlansService = module.get<ExpensePlansService>(ExpensePlansService);
    envelopeBalanceService = module.get<EnvelopeBalanceService>(
      EnvelopeBalanceService,
    );
  });

  afterEach(async () => {
    await module.close();
  });

  describe('calculate', () => {
    beforeEach(() => {
      // Setup transaction repository mock
      (transactionRepository.find as jest.Mock).mockResolvedValue(
        mockTransactions,
      );
      (transactionRepository.count as jest.Mock).mockResolvedValue(0);
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null);
    });

    it('should calculate free to spend correctly', async () => {
      // Arrange
      const userId = 1;
      const month = '2026-01';

      // Act
      const result = await service.calculate(userId, month);

      // Assert
      expect(result.month).toBe('2026-01');
      expect(result.income.guaranteed).toBe(5000);
      expect(result.income.total).toBe(5700);

      // Obligations: Rent(1200) + Utilities(150) + Goal(200) + Groceries(400) = 1950
      expect(result.obligations.total).toBe(1950);

      // Discretionary: 50 + 30 + 100 = 180 (groceries excluded as budget-tracked)
      expect(result.discretionarySpending.total).toBe(180);

      // Free to spend: 5000 - 1950 - 180 = 2870
      expect(result.freeToSpend).toBe(2870);
      expect(result.status).toBe('comfortable'); // > 25% remaining
    });

    it('should return status comfortable when > 25% income remaining', async () => {
      // Arrange
      const userId = 1;
      const month = '2026-01';

      // Act
      const result = await service.calculate(userId, month);

      // Assert
      // Free to spend is 2870, which is 57.4% of 5000 guaranteed income
      expect(result.status).toBe('comfortable');
    });

    it('should return status moderate when 10-25% income remaining', async () => {
      // Arrange
      (incomePlansService.getMonthlySummary as jest.Mock).mockResolvedValue({
        ...mockMonthlySummary,
        guaranteedTotal: 2100,
        totalIncome: 2100,
      });

      // Act
      const result = await service.calculate(1, '2026-01');

      // Assert
      // Free to spend: 2100 - 1950 - 180 = -30 (would be overspent)
      // Actually with 2100 income, we'd be negative
      expect(result.status).toBe('overspent');
    });

    it('should return status overspent when free to spend is negative', async () => {
      // Arrange
      (incomePlansService.getMonthlySummary as jest.Mock).mockResolvedValue({
        ...mockMonthlySummary,
        guaranteedTotal: 1000, // Very low income
        totalIncome: 1000,
      });

      // Act
      const result = await service.calculate(1, '2026-01');

      // Assert
      // Free to spend: 1000 - 1950 - 180 = -1130
      expect(result.freeToSpend).toBe(-1130);
      expect(result.status).toBe('overspent');
    });

    it('should use current month when month not specified', async () => {
      // Arrange
      const userId = 1;

      // Act
      const result = await service.calculate(userId, '2026-01');

      // Assert
      expect(result.month).toBe('2026-01');
      expect(incomePlansService.getMonthlySummary).toHaveBeenCalledWith(
        userId,
        2026,
        1,
      );
    });

    it('should include income breakdown with sources', async () => {
      // Arrange
      const userId = 1;
      const month = '2026-01';

      // Act
      const result = await service.calculate(userId, month);

      // Assert
      expect(result.income.breakdown).toHaveLength(3);
      expect(result.income.breakdown[0]).toEqual({
        source: 'Salary',
        amount: 5000,
        reliability: 'guaranteed',
      });
    });

    it('should categorize obligations by type', async () => {
      // Arrange
      const userId = 1;
      const month = '2026-01';

      // Act
      const result = await service.calculate(userId, month);

      // Assert
      // Bills: Rent(1200) + Utilities(150) = 1350
      expect(result.obligations.byType.bills).toBe(1350);
      // Savings: Goal(200) = 200
      expect(result.obligations.byType.savings).toBe(200);
      // Budgets: Groceries(400) = 400
      expect(result.obligations.byType.budgets).toBe(400);
    });

    it('should return top spending categories for discretionary', async () => {
      // Arrange
      const userId = 1;
      const month = '2026-01';

      // Act
      const result = await service.calculate(userId, month);

      // Assert
      expect(result.discretionarySpending.topCategories).toBeDefined();
      expect(
        result.discretionarySpending.topCategories.length,
      ).toBeLessThanOrEqual(5);
      // Dining Out should be first (50 + 100 = 150)
      expect(result.discretionarySpending.topCategories[0]).toEqual({
        category: 'Dining Out',
        amount: 150,
      });
    });

    it('should include transaction count for discretionary spending', async () => {
      // Arrange
      const userId = 1;
      const month = '2026-01';

      // Act
      const result = await service.calculate(userId, month);

      // Assert
      // 3 discretionary transactions (excluding groceries which is budget-tracked)
      expect(result.discretionarySpending.transactionCount).toBe(3);
    });

    it('should include lastUpdated timestamp', async () => {
      // Arrange
      const userId = 1;
      const month = '2026-01';

      // Act
      const result = await service.calculate(userId, month);

      // Assert
      expect(result.lastUpdated).toBeDefined();
      expect(new Date(result.lastUpdated)).toBeInstanceOf(Date);
    });
  });

  describe('calculate with no income', () => {
    it('should return moderate status when no income and no obligations', async () => {
      // Arrange
      (incomePlansService.getMonthlySummary as jest.Mock).mockResolvedValue({
        year: 2026,
        month: 1,
        guaranteedTotal: 0,
        expectedTotal: 0,
        uncertainTotal: 0,
        totalIncome: 0,
        budgetSafeIncome: 0,
        planCount: 0,
        plans: [],
      });
      (expensePlansService.findActiveByUser as jest.Mock).mockResolvedValue([]);
      (transactionRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.calculate(1, '2026-01');

      // Assert
      expect(result.income.guaranteed).toBe(0);
      expect(result.freeToSpend).toBe(0);
      expect(result.status).toBe('moderate'); // Default when no income
    });
  });

  describe('calculate with no obligations', () => {
    it('should calculate correctly when no expense plans exist', async () => {
      // Arrange
      (expensePlansService.findActiveByUser as jest.Mock).mockResolvedValue([]);
      (transactionRepository.find as jest.Mock).mockResolvedValue(
        mockTransactions,
      );

      // Act
      const result = await service.calculate(1, '2026-01');

      // Assert
      expect(result.obligations.total).toBe(0);
      expect(result.obligations.items).toHaveLength(0);
      // When no expense plans, ALL transactions are discretionary
      // Total: 50 + 30 + 100 + 350 = 530
      // Free to spend = 5000 - 0 - 530 = 4470
      expect(result.discretionarySpending.total).toBe(530);
      expect(result.freeToSpend).toBe(5000 - 530);
    });
  });

  describe('calculate with no discretionary spending', () => {
    it('should handle zero discretionary spending', async () => {
      // Arrange
      (transactionRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.calculate(1, '2026-01');

      // Assert
      expect(result.discretionarySpending.total).toBe(0);
      expect(result.discretionarySpending.transactionCount).toBe(0);
      expect(result.discretionarySpending.topCategories).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle fresh user with no data', async () => {
      // Arrange
      (incomePlansService.getMonthlySummary as jest.Mock).mockResolvedValue({
        year: 2026,
        month: 1,
        guaranteedTotal: 0,
        expectedTotal: 0,
        uncertainTotal: 0,
        totalIncome: 0,
        budgetSafeIncome: 0,
        planCount: 0,
        plans: [],
      });
      (expensePlansService.findActiveByUser as jest.Mock).mockResolvedValue([]);
      (transactionRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.calculate(1, '2026-01');

      // Assert
      expect(result.freeToSpend).toBe(0);
      expect(result.income.total).toBe(0);
      expect(result.obligations.total).toBe(0);
      expect(result.discretionarySpending.total).toBe(0);
    });

    it('should correctly parse month string', async () => {
      // Arrange
      const userId = 1;
      (transactionRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      await service.calculate(userId, '2026-12');

      // Assert
      expect(incomePlansService.getMonthlySummary).toHaveBeenCalledWith(
        userId,
        2026,
        12,
      );
    });
  });

  describe('seasonal plans handling', () => {
    it('should include seasonal plan monthlyContribution even when current month is not in seasonalMonths', async () => {
      // Arrange: February 2026, seasonal plan for summer (June, July, August)
      const seasonalPlan: Partial<ExpensePlan> = {
        id: 5,
        userId: 1,
        name: 'Summer Vacation',
        icon: '🏖️',
        planType: 'seasonal',
        purpose: 'sinking_fund',
        priority: 'discretionary',
        targetAmount: 4000, // Total for summer
        monthlyContribution: 400, // Saving €400/month to reach target
        categoryId: null,
        seasonalMonths: [6, 7, 8], // June, July, August
      };

      const plansWithSeasonal = [...mockExpensePlans, seasonalPlan];
      (expensePlansService.findActiveByUser as jest.Mock).mockResolvedValue(
        plansWithSeasonal,
      );
      (transactionRepository.find as jest.Mock).mockResolvedValue([]);
      (transactionRepository.count as jest.Mock).mockResolvedValue(0);
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act: Calculate for February (not a seasonal month)
      const result = await service.calculate(1, '2026-02');

      // Assert: Seasonal plan's monthlyContribution should be included
      // Total obligations = Rent(1200) + Utilities(150) + Emergency(200) + Groceries(400) + Summer(400) = 2350
      expect(result.obligations.total).toBe(2350);

      // Verify seasonal plan is in the items
      const seasonalItem = result.obligations.items.find(
        (item) => item.name === 'Summer Vacation',
      );
      expect(seasonalItem).toBeDefined();
      expect(seasonalItem?.amount).toBe(400);
    });

    it('should skip plans with zero monthlyContribution', async () => {
      // Arrange
      const zeroPlan: Partial<ExpensePlan> = {
        id: 6,
        userId: 1,
        name: 'Empty Plan',
        planType: 'fixed_monthly',
        purpose: 'sinking_fund',
        monthlyContribution: 0,
        targetAmount: 0,
        categoryId: null,
      };

      (expensePlansService.findActiveByUser as jest.Mock).mockResolvedValue([
        zeroPlan,
      ]);
      (transactionRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.calculate(1, '2026-01');

      // Assert
      expect(result.obligations.total).toBe(0);
      expect(result.obligations.items).toHaveLength(0);
    });
  });

  describe('envelope buffer integration', () => {
    beforeEach(() => {
      (transactionRepository.find as jest.Mock).mockResolvedValue(
        mockTransactions,
      );
      (transactionRepository.count as jest.Mock).mockResolvedValue(0);
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null);
    });

    it('should include envelope buffer in response', async () => {
      // Act
      const result = await service.calculate(1, '2026-01');

      // Assert
      expect(result.envelopeBuffer).toBeDefined();
      expect(result.envelopeBuffer?.total).toBe(200);
      expect(result.envelopeBuffer?.breakdown).toHaveLength(1);
      expect(result.envelopeBuffer?.breakdown[0].planName).toBe('Rent');
    });

    it('should calculate trulyAvailable when freeToSpend is positive', async () => {
      // Arrange: freeToSpend = 5000 - 1950 - 180 = 2870
      // envelopeBuffer = 200
      // Act
      const result = await service.calculate(1, '2026-01');

      // Assert: trulyAvailable = freeToSpend + buffer = 2870 + 200 = 3070
      expect(result.freeToSpend).toBe(2870);
      expect(result.trulyAvailable).toBe(3070);
    });

    it('should calculate trulyAvailable when freeToSpend is negative (deficit)', async () => {
      // Arrange: Very low income creating a deficit
      (incomePlansService.getMonthlySummary as jest.Mock).mockResolvedValue({
        ...mockMonthlySummary,
        guaranteedTotal: 2000, // Low income
        totalIncome: 2000,
      });

      // Mock envelope buffer with €248
      (envelopeBalanceService.getTotalEnvelopeBuffer as jest.Mock).mockResolvedValue({
        ...mockEnvelopeBufferSummary,
        totalPositiveBalance: 248,
      });

      // Act
      const result = await service.calculate(1, '2026-01');

      // Assert:
      // freeToSpend = 2000 - 1950 - 180 = -130 (deficit)
      // envelopeBuffer = 248
      // trulyAvailable = max(0, 248 + (-130)) = max(0, 118) = 118
      expect(result.freeToSpend).toBe(-130);
      expect(result.trulyAvailable).toBe(118);
    });

    it('should return 0 trulyAvailable when deficit exceeds buffer', async () => {
      // Arrange: Large deficit that exceeds buffer
      (incomePlansService.getMonthlySummary as jest.Mock).mockResolvedValue({
        ...mockMonthlySummary,
        guaranteedTotal: 1000, // Very low income
        totalIncome: 1000,
      });

      // Mock envelope buffer with €100
      (envelopeBalanceService.getTotalEnvelopeBuffer as jest.Mock).mockResolvedValue({
        ...mockEnvelopeBufferSummary,
        totalPositiveBalance: 100,
      });

      // Act
      const result = await service.calculate(1, '2026-01');

      // Assert:
      // freeToSpend = 1000 - 1950 - 180 = -1130 (large deficit)
      // envelopeBuffer = 100
      // trulyAvailable = max(0, 100 + (-1130)) = max(0, -1030) = 0
      expect(result.freeToSpend).toBe(-1130);
      expect(result.trulyAvailable).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // REALISTIC SCENARIO - Full Pipeline Integration Test
  // ═══════════════════════════════════════════════════════════════════
  describe('realistic scenario - full pipeline', () => {
    // Income: 3 guaranteed + 1 uncertain
    const realisticIncomeSummary = {
      year: 2026,
      month: 3,
      guaranteedTotal: 5625,
      expectedTotal: 0,
      uncertainTotal: 300,
      totalIncome: 5925,
      budgetSafeIncome: 5625,
      planCount: 4,
      plans: [
        { id: 1, name: 'Salary', icon: '💼', reliability: 'guaranteed', annualTotal: 48000, monthlyAverage: 4000, currentMonthExpected: 4000 },
        { id: 2, name: 'Second Income', icon: '💰', reliability: 'guaranteed', annualTotal: 17400, monthlyAverage: 1450, currentMonthExpected: 1450 },
        { id: 3, name: 'Benefits', icon: '🏛️', reliability: 'guaranteed', annualTotal: 2100, monthlyAverage: 175, currentMonthExpected: 175 },
        { id: 4, name: 'Gift', icon: '🎁', reliability: 'uncertain', annualTotal: 3600, monthlyAverage: 300, currentMonthExpected: 300 },
      ],
    };

    // 10 expense plans: mix of sinking_fund and spending_budget
    const realisticExpensePlans: Partial<ExpensePlan>[] = [
      // SINKING FUND plans (bills category)
      { id: 101, userId: 1, name: 'Electricity', icon: '⚡', planType: 'fixed_monthly', purpose: 'sinking_fund', priority: 'essential', targetAmount: 1528.56, monthlyContribution: 127.38, categoryId: 376 },
      { id: 102, userId: 1, name: 'Internet & Phone', icon: '📱', planType: 'fixed_monthly', purpose: 'sinking_fund', priority: 'essential', targetAmount: 864.84, monthlyContribution: 72.07, categoryId: 379 },
      { id: 103, userId: 1, name: 'Mortgage Insurance Life', icon: '🛡️', planType: 'fixed_monthly', purpose: 'sinking_fund', priority: 'essential', targetAmount: 450.84, monthlyContribution: 37.57, categoryId: 445 },
      { id: 104, userId: 1, name: 'Insurance', icon: '📋', planType: 'seasonal', purpose: 'sinking_fund', priority: 'essential', targetAmount: 1158.24, monthlyContribution: 96.52, categoryId: 426 },
      // SINKING FUND: emergency fund with zero contribution (should be skipped)
      { id: 105, userId: 1, name: 'Emergency Fund', icon: '🆘', planType: 'emergency_fund', purpose: 'sinking_fund', priority: 'important', targetAmount: 5000, monthlyContribution: 0, categoryId: null },
      // SPENDING BUDGET plans (budgets category)
      { id: 201, userId: 1, name: 'Mortgage', icon: '🏠', planType: 'fixed_monthly', purpose: 'spending_budget', priority: 'essential', targetAmount: 15612, monthlyContribution: 1301, categoryId: 375 },
      { id: 202, userId: 1, name: 'Groceries', icon: '🛒', planType: 'yearly_variable', purpose: 'spending_budget', priority: 'essential', targetAmount: 9600, monthlyContribution: 800, categoryId: 390 },
      { id: 203, userId: 1, name: 'Personal Care', icon: '💇', planType: 'yearly_variable', purpose: 'spending_budget', priority: 'discretionary', targetAmount: 1789.92, monthlyContribution: 149.16, categoryId: 392 },
      { id: 204, userId: 1, name: 'Travel', icon: '✈️', planType: 'yearly_variable', purpose: 'spending_budget', priority: 'discretionary', targetAmount: 1809.36, monthlyContribution: 150.78, categoryId: 411 },
      { id: 205, userId: 1, name: 'Sports / Gym', icon: '🏋️', planType: 'seasonal', purpose: 'spending_budget', priority: 'discretionary', targetAmount: 2148.48, monthlyContribution: 179.04, categoryId: 415 },
    ];

    // Transactions: some in plan categories (excluded), some not (discretionary), some analytics-excluded
    const realisticTransactions: Partial<Transaction>[] = [
      // COVERED by spending_budget plans → excluded from discretionary
      { id: 301, type: 'expense', amount: -289.45, description: 'Weekly groceries', executionDate: new Date('2026-03-10'), category: { id: 390, name: 'Groceries', excludeFromExpenseAnalytics: false } as any },
      { id: 302, type: 'expense', amount: -160, description: 'Haircut', executionDate: new Date('2026-03-05'), category: { id: 392, name: 'Personal Care', excludeFromExpenseAnalytics: false } as any },
      { id: 303, type: 'expense', amount: -5.1, description: 'Train ticket', executionDate: new Date('2026-03-12'), category: { id: 411, name: 'Travel', excludeFromExpenseAnalytics: false } as any },
      { id: 304, type: 'expense', amount: -6.7, description: 'Gym session', executionDate: new Date('2026-03-08'), category: { id: 415, name: 'Sports / Gym', excludeFromExpenseAnalytics: false } as any },
      // COVERED by sinking_fund plan → ALSO excluded from discretionary (critical regression test)
      { id: 305, type: 'expense', amount: -37.3, description: 'Monthly premium', executionDate: new Date('2026-03-02'), category: { id: 445, name: 'Mortgage Insurance Life', excludeFromExpenseAnalytics: false } as any },
      // EXCLUDED via excludeFromExpenseAnalytics
      { id: 306, type: 'expense', amount: -206.32, description: 'House deposit', executionDate: new Date('2026-03-15'), category: { id: 440, name: 'New House', excludeFromExpenseAnalytics: true } as any },
      { id: 307, type: 'expense', amount: -270, description: 'Transfer', executionDate: new Date('2026-03-01'), category: { id: 424, name: 'Bank Transfers', excludeFromExpenseAnalytics: true } as any },
      // DISCRETIONARY — no plan linked to these categories
      { id: 308, type: 'expense', amount: -269.71, description: 'Car insurance payment', executionDate: new Date('2026-03-03'), category: { id: 384, name: 'Car Insurance', excludeFromExpenseAnalytics: false } as any },
      { id: 309, type: 'expense', amount: -187.41, description: 'Annual car tax', executionDate: new Date('2026-03-04'), category: { id: 385, name: 'Car Tax', excludeFromExpenseAnalytics: false } as any },
      { id: 310, type: 'expense', amount: -17.5, description: 'Dinner out', executionDate: new Date('2026-03-14'), category: { id: 394, name: 'Restaurant', excludeFromExpenseAnalytics: false } as any },
      { id: 311, type: 'expense', amount: -17, description: 'Satispay topup', executionDate: new Date('2026-03-07'), category: { id: 441, name: 'Satispay', excludeFromExpenseAnalytics: false } as any },
      { id: 312, type: 'expense', amount: -8.7, description: 'Bank fee', executionDate: new Date('2026-03-01'), category: { id: 422, name: 'Bank Fees', excludeFromExpenseAnalytics: false } as any },
      { id: 313, type: 'expense', amount: -5.5, description: 'Parking', executionDate: new Date('2026-03-09'), category: { id: 388, name: 'Parking / Tolls', excludeFromExpenseAnalytics: false } as any },
      { id: 314, type: 'expense', amount: -1, description: 'Donation', executionDate: new Date('2026-03-20'), category: { id: 421, name: 'Donations', excludeFromExpenseAnalytics: false } as any },
      // DISCRETIONARY — transaction without category
      { id: 315, type: 'expense', amount: -0.02, description: 'Rounding', executionDate: new Date('2026-03-25'), category: null as any },
    ];

    // Expected discretionary total:
    // Car Insurance(269.71) + Car Tax(187.41) + Restaurant(17.5) + Satispay(17) + Bank Fees(8.7) + Parking(5.5) + Donations(1) + Uncategorized(0.02) = 506.84
    const expectedDiscretionaryTotal = 506.84;

    // Obligations: Electricity(127.38) + Internet(72.07) + MortgageIns(37.57) + Insurance(96.52) + Mortgage(1301) + Groceries(800) + PersonalCare(149.16) + Travel(150.78) + Sports(179.04) = 2913.52
    const expectedObligationsTotal = 2913.52;

    const realisticEnvelopeBuffer = {
      year: 2026,
      month: 3,
      totalBuffer: 500,
      totalPositiveBalance: 500,
      planBuffers: [
        { planId: 202, planName: 'Groceries', planIcon: '🛒', purpose: 'spending_budget', previousBalance: 200, monthlyAllocation: 800, actualSpending: 600, currentBalance: 400, rolloverSurplus: true, status: 'under_budget', utilizationPercent: 75 },
        { planId: 203, planName: 'Personal Care', planIcon: '💇', purpose: 'spending_budget', previousBalance: 50, monthlyAllocation: 149.16, actualSpending: 100, currentBalance: 100, rolloverSurplus: true, status: 'under_budget', utilizationPercent: 67 },
      ],
      byPurpose: { sinkingFunds: [], spendingBudgets: [] },
    };

    beforeEach(() => {
      (incomePlansService.getMonthlySummary as jest.Mock).mockResolvedValue(realisticIncomeSummary);
      (expensePlansService.findActiveByUser as jest.Mock).mockResolvedValue(realisticExpensePlans);
      (transactionRepository.find as jest.Mock).mockResolvedValue(realisticTransactions);
      (transactionRepository.count as jest.Mock).mockResolvedValue(0);
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null);
      (envelopeBalanceService.getTotalEnvelopeBuffer as jest.Mock).mockResolvedValue(realisticEnvelopeBuffer);
    });

    it('should calculate free to spend correctly with realistic production-like data', async () => {
      const result = await service.calculate(1, '2026-03');

      // 1. Income: only guaranteed counts
      expect(result.income.guaranteed).toBe(5625);
      expect(result.income.uncertain).toBe(300);
      expect(result.income.total).toBe(5925);
      expect(result.income.breakdown).toHaveLength(4);

      // 2. Obligations: sum of monthlyContribution (Emergency Fund skipped at €0)
      expect(result.obligations.total).toBeCloseTo(expectedObligationsTotal, 2);
      expect(result.obligations.items).toHaveLength(9);

      // 3. Obligations breakdown by type
      // Bills (sinking_fund: fixed_monthly + seasonal essential): 127.38 + 72.07 + 37.57 + 96.52 = 333.54
      expect(result.obligations.byType.bills).toBeCloseTo(333.54, 2);
      // Savings: 0 (emergency fund has €0 contribution)
      expect(result.obligations.byType.savings).toBe(0);
      // Budgets (all spending_budget): 1301 + 800 + 149.16 + 150.78 + 179.04 = 2579.98
      expect(result.obligations.byType.budgets).toBeCloseTo(2579.98, 2);

      // 4. Discretionary spending: only uncovered categories
      expect(result.discretionarySpending.total).toBeCloseTo(expectedDiscretionaryTotal, 2);
      expect(result.discretionarySpending.transactionCount).toBe(8);

      // 5. Top discretionary categories
      expect(result.discretionarySpending.topCategories[0].category).toBe('Car Insurance');
      expect(result.discretionarySpending.topCategories[0].amount).toBeCloseTo(269.71, 2);
      expect(result.discretionarySpending.topCategories[1].category).toBe('Car Tax');
      expect(result.discretionarySpending.topCategories[1].amount).toBeCloseTo(187.41, 2);

      // 6. Free to Spend formula: 5625 - 2913.52 - 506.84 = 2204.64
      const expectedFTS = 5625 - expectedObligationsTotal - expectedDiscretionaryTotal;
      expect(result.freeToSpend).toBeCloseTo(expectedFTS, 2);
      expect(result.freeToSpend).toBeCloseTo(2204.64, 2);

      // 7. Status: 2204.64 / 5625 = 39.2% → comfortable
      expect(result.status).toBe('comfortable');

      // 8. Envelope buffer and truly available: 500 + 2204.64 = 2704.64
      expect(result.envelopeBuffer?.total).toBe(500);
      expect(result.trulyAvailable).toBeCloseTo(2704.64, 2);
    });

    it('should exclude sinking_fund plan categories from discretionary spending (regression)', async () => {
      const result = await service.calculate(1, '2026-03');

      const discretionaryCategories = result.discretionarySpending.topCategories.map(
        (c) => c.category,
      );
      expect(discretionaryCategories).not.toContain('Mortgage Insurance Life');
      expect(result.discretionarySpending.total).toBeCloseTo(expectedDiscretionaryTotal, 2);
    });

    it('should treat uncategorized transactions as discretionary', async () => {
      const result = await service.calculate(1, '2026-03');

      expect(result.discretionarySpending.total).toBeCloseTo(expectedDiscretionaryTotal, 2);
      expect(result.discretionarySpending.transactionCount).toBe(8);
    });

    it('should exclude transactions with excludeFromExpenseAnalytics from discretionary', async () => {
      const result = await service.calculate(1, '2026-03');

      const discretionaryCategories = result.discretionarySpending.topCategories.map(
        (c) => c.category,
      );
      expect(discretionaryCategories).not.toContain('New House');
      expect(discretionaryCategories).not.toContain('Bank Transfers');
      expect(result.discretionarySpending.total).toBeCloseTo(506.84, 2);
    });
  });
});
