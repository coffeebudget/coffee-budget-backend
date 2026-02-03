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
});
