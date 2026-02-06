import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransferSuggestionsService } from './transfer-suggestions.service';
import { IncomePlan } from './entities/income-plan.entity';
import { ExpensePlan } from '../expense-plans/entities/expense-plan.entity';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';

describe('TransferSuggestionsService', () => {
  let service: TransferSuggestionsService;
  let incomePlanRepo: ReturnType<
    typeof RepositoryMockFactory.createMockRepository
  >;
  let expensePlanRepo: ReturnType<
    typeof RepositoryMockFactory.createMockRepository
  >;

  const userId = 1;
  const year = 2025;
  const month = 2; // February

  function makeIncomePlan(
    overrides: Partial<IncomePlan> & { id: number },
  ): IncomePlan {
    const plan = new IncomePlan();
    plan.id = overrides.id;
    plan.userId = userId;
    plan.name = overrides.name ?? `Income ${overrides.id}`;
    plan.status = overrides.status ?? 'active';
    plan.reliability = overrides.reliability ?? 'guaranteed';
    plan.paymentAccountId = overrides.paymentAccountId ?? null;
    plan.january = overrides.january ?? 0;
    plan.february = overrides.february ?? 0;
    plan.march = overrides.march ?? 0;
    plan.april = overrides.april ?? 0;
    plan.may = overrides.may ?? 0;
    plan.june = overrides.june ?? 0;
    plan.july = overrides.july ?? 0;
    plan.august = overrides.august ?? 0;
    plan.september = overrides.september ?? 0;
    plan.october = overrides.october ?? 0;
    plan.november = overrides.november ?? 0;
    plan.december = overrides.december ?? 0;
    plan.paymentAccount = overrides.paymentAccountId
      ? ({ id: overrides.paymentAccountId, name: `Account ${overrides.paymentAccountId}` } as any)
      : null;
    return plan;
  }

  function makeExpensePlan(
    overrides: Partial<ExpensePlan> & { id: number },
  ): ExpensePlan {
    const paymentAccountId = overrides.paymentAccountId ?? null;
    const plan = {
      id: overrides.id,
      userId,
      name: overrides.name ?? `Expense ${overrides.id}`,
      status: overrides.status ?? 'active',
      monthlyContribution: overrides.monthlyContribution ?? 0,
      priority: overrides.priority ?? 'important',
      paymentAccountId,
      paymentAccount: paymentAccountId
        ? ({ id: paymentAccountId, name: `Account ${paymentAccountId}` } as any)
        : null,
    } as ExpensePlan;
    return plan;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransferSuggestionsService,
        RepositoryMockFactory.createRepositoryProvider(IncomePlan),
        RepositoryMockFactory.createRepositoryProvider(ExpensePlan),
      ],
    }).compile();

    service = module.get<TransferSuggestionsService>(
      TransferSuggestionsService,
    );
    incomePlanRepo = module.get(getRepositoryToken(IncomePlan));
    expensePlanRepo = module.get(getRepositoryToken(ExpensePlan));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateTransferSuggestions', () => {
    it('should calculate for single income + direct obligations only', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Salary',
          paymentAccountId: 10,
          february: 2000,
        }),
      ];
      const expensePlans = [
        makeExpensePlan({
          id: 1,
          name: 'Rent',
          monthlyContribution: 500,
          paymentAccountId: 10,
        }),
        makeExpensePlan({
          id: 2,
          name: 'Utilities',
          monthlyContribution: 100,
          paymentAccountId: 10,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue(expensePlans);

      const result = await service.calculateTransferSuggestions(
        userId,
        year,
        month,
      );

      expect(result.accounts).toHaveLength(1);
      const account = result.accounts[0];
      expect(account.accountId).toBe(10);
      expect(account.totalIncome).toBe(2000);
      expect(account.directObligations).toBe(600);
      expect(account.sharedObligations).toBe(0);
      expect(account.totalObligations).toBe(600);
      expect(account.surplus).toBe(1400);
      expect(account.safetyMargin).toBe(200); // 10% of 2000
      expect(account.suggestedTransfer).toBe(1200);
      expect(account.status).toBe('transferable');
    });

    it('should calculate for single income + shared obligations (equal split)', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Salary A',
          paymentAccountId: 10,
          february: 1450,
        }),
        makeIncomePlan({
          id: 2,
          name: 'Salary B',
          paymentAccountId: 20,
          february: 1500,
        }),
      ];
      const expensePlans = [
        makeExpensePlan({
          id: 1,
          name: 'Personal Care',
          monthlyContribution: 149.16,
          paymentAccountId: 10,
        }),
        makeExpensePlan({
          id: 2,
          name: 'Fuel',
          monthlyContribution: 107.12,
          paymentAccountId: null,
        }),
        makeExpensePlan({
          id: 3,
          name: 'Groceries',
          monthlyContribution: 800,
          paymentAccountId: null,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue(expensePlans);

      const result = await service.calculateTransferSuggestions(
        userId,
        year,
        month,
      );

      expect(result.distinctIncomeAccountCount).toBe(2);
      expect(result.unassignedTotal).toBeCloseTo(907.12, 2);
      expect(result.sharePerAccount).toBeCloseTo(453.56, 2);

      // Check account 10 (Salary A = 1450)
      const acc10 = result.accounts.find((a) => a.accountId === 10);
      expect(acc10).toBeDefined();
      expect(acc10!.totalIncome).toBe(1450);
      expect(acc10!.directObligations).toBeCloseTo(149.16, 2);
      expect(acc10!.sharedObligations).toBeCloseTo(453.56, 2);
      expect(acc10!.totalObligations).toBeCloseTo(602.72, 2);
      expect(acc10!.surplus).toBeCloseTo(847.28, 2);
      expect(acc10!.safetyMargin).toBe(145); // 10% of 1450
      expect(acc10!.suggestedTransfer).toBeCloseTo(702.28, 2);
      expect(acc10!.status).toBe('transferable');
    });

    it('should aggregate multiple incomes to same account', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Salary',
          paymentAccountId: 10,
          february: 1000,
        }),
        makeIncomePlan({
          id: 2,
          name: 'Freelance',
          paymentAccountId: 10,
          february: 500,
        }),
      ];
      const expensePlans = [
        makeExpensePlan({
          id: 1,
          name: 'Rent',
          monthlyContribution: 300,
          paymentAccountId: 10,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue(expensePlans);

      const result = await service.calculateTransferSuggestions(
        userId,
        year,
        month,
      );

      expect(result.accounts).toHaveLength(1);
      const account = result.accounts[0];
      expect(account.totalIncome).toBe(1500);
      expect(account.incomeSources).toHaveLength(2);
      expect(account.directObligations).toBe(300);
      expect(account.surplus).toBe(1200);
      expect(account.safetyMargin).toBe(150); // 10% of 1500
      expect(account.suggestedTransfer).toBe(1050);
    });

    it('should return deficit when income < obligations', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Part-time',
          paymentAccountId: 10,
          february: 500,
        }),
      ];
      const expensePlans = [
        makeExpensePlan({
          id: 1,
          name: 'Rent',
          monthlyContribution: 600,
          paymentAccountId: 10,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue(expensePlans);

      const result = await service.calculateTransferSuggestions(
        userId,
        year,
        month,
      );

      const account = result.accounts[0];
      expect(account.surplus).toBe(-100);
      expect(account.suggestedTransfer).toBe(0);
      expect(account.status).toBe('deficit');
    });

    it('should return full income minus margin when no expense plans exist', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Salary',
          paymentAccountId: 10,
          february: 3000,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue([]);

      const result = await service.calculateTransferSuggestions(
        userId,
        year,
        month,
      );

      const account = result.accounts[0];
      expect(account.totalObligations).toBe(0);
      expect(account.surplus).toBe(3000);
      expect(account.safetyMargin).toBe(300);
      expect(account.suggestedTransfer).toBe(2700);
      expect(account.status).toBe('transferable');
    });

    it('should return zero for month with zero income', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Seasonal Job',
          paymentAccountId: 10,
          february: 0,
          july: 5000,
        }),
      ];
      const expensePlans = [
        makeExpensePlan({
          id: 1,
          name: 'Rent',
          monthlyContribution: 500,
          paymentAccountId: 10,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue(expensePlans);

      const result = await service.calculateTransferSuggestions(
        userId,
        year,
        month,
      );

      const account = result.accounts[0];
      expect(account.totalIncome).toBe(0);
      expect(account.surplus).toBe(-500);
      expect(account.suggestedTransfer).toBe(0);
      expect(account.status).toBe('deficit');
    });

    it('should have zero shared obligations when no unassigned plans exist', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Salary',
          paymentAccountId: 10,
          february: 2000,
        }),
      ];
      const expensePlans = [
        makeExpensePlan({
          id: 1,
          name: 'Rent',
          monthlyContribution: 400,
          paymentAccountId: 10,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue(expensePlans);

      const result = await service.calculateTransferSuggestions(
        userId,
        year,
        month,
      );

      expect(result.unassignedTotal).toBe(0);
      const account = result.accounts[0];
      expect(account.sharedObligations).toBe(0);
      expect(account.sharedObligationDetails).toHaveLength(0);
    });

    it('should split everything equally when all plans are unassigned', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Salary A',
          paymentAccountId: 10,
          february: 1000,
        }),
        makeIncomePlan({
          id: 2,
          name: 'Salary B',
          paymentAccountId: 20,
          february: 1000,
        }),
      ];
      const expensePlans = [
        makeExpensePlan({
          id: 1,
          name: 'Groceries',
          monthlyContribution: 600,
          paymentAccountId: null,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue(expensePlans);

      const result = await service.calculateTransferSuggestions(
        userId,
        year,
        month,
      );

      expect(result.unassignedTotal).toBe(600);
      expect(result.sharePerAccount).toBe(300);

      for (const account of result.accounts) {
        expect(account.directObligations).toBe(0);
        expect(account.sharedObligations).toBe(300);
        expect(account.totalObligations).toBe(300);
      }
    });

    it('should calculate safety margin as 10% of income', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Salary',
          paymentAccountId: 10,
          february: 1000,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue([]);

      const result = await service.calculateTransferSuggestions(
        userId,
        year,
        month,
      );

      const account = result.accounts[0];
      expect(account.safetyMargin).toBe(100); // 10% of 1000
      expect(account.suggestedTransfer).toBe(900); // 1000 - 0 - 100
    });

    it('should exclude income plans without paymentAccountId', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Salary',
          paymentAccountId: 10,
          february: 1000,
        }),
        makeIncomePlan({
          id: 2,
          name: 'Unlinked Income',
          paymentAccountId: null,
          february: 500,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue([]);

      const result = await service.calculateTransferSuggestions(
        userId,
        year,
        month,
      );

      // Only account 10 should appear
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].accountId).toBe(10);
      expect(result.accounts[0].totalIncome).toBe(1000);
      // The count should only include accounts with paymentAccountId
      expect(result.distinctIncomeAccountCount).toBe(1);
    });

    it('should return tight status when surplus <= safetyMargin', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Salary',
          paymentAccountId: 10,
          february: 1000,
        }),
      ];
      const expensePlans = [
        makeExpensePlan({
          id: 1,
          name: 'Rent',
          monthlyContribution: 950,
          paymentAccountId: 10,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue(expensePlans);

      const result = await service.calculateTransferSuggestions(
        userId,
        year,
        month,
      );

      const account = result.accounts[0];
      // surplus = 1000 - 950 = 50, safetyMargin = 100
      expect(account.surplus).toBe(50);
      expect(account.safetyMargin).toBe(100);
      expect(account.suggestedTransfer).toBe(0);
      expect(account.status).toBe('tight');
    });

    it('should return empty accounts array when no income plans have paymentAccountId', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Unlinked',
          paymentAccountId: null,
          february: 1000,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue([]);

      const result = await service.calculateTransferSuggestions(
        userId,
        year,
        month,
      );

      expect(result.accounts).toHaveLength(0);
      expect(result.distinctIncomeAccountCount).toBe(0);
    });

    it('should discover deficit accounts with expense plans but no income', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Salary',
          paymentAccountId: 10,
          february: 3000,
        }),
      ];
      const expensePlans = [
        makeExpensePlan({
          id: 1,
          name: 'Rent',
          monthlyContribution: 500,
          paymentAccountId: 10,
        }),
        makeExpensePlan({
          id: 2,
          name: 'Gym',
          monthlyContribution: 50,
          paymentAccountId: 30,
        }),
        makeExpensePlan({
          id: 3,
          name: 'Streaming',
          monthlyContribution: 15,
          paymentAccountId: 30,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue(expensePlans);

      const result = await service.calculateTransferSuggestions(userId, year, month);

      expect(result.deficitAccounts).toHaveLength(1);
      expect(result.deficitAccounts[0].accountId).toBe(30);
      expect(result.deficitAccounts[0].accountName).toBe('Account 30');
      expect(result.deficitAccounts[0].totalNeed).toBe(65);
      expect(result.deficitAccounts[0].obligationDetails).toHaveLength(2);
    });

    it('should build transfer routes from surplus to deficit accounts', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Salary A',
          paymentAccountId: 10,
          february: 2000,
        }),
        makeIncomePlan({
          id: 2,
          name: 'Salary B',
          paymentAccountId: 20,
          february: 1500,
        }),
      ];
      const expensePlans = [
        makeExpensePlan({
          id: 1,
          name: 'Rent',
          monthlyContribution: 300,
          paymentAccountId: 30,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue(expensePlans);

      const result = await service.calculateTransferSuggestions(userId, year, month);

      // Account 10: income 2000, shared 150, surplus 1850, margin 200, transfer 1650
      // Account 20: income 1500, shared 150, surplus 1350, margin 150, transfer 1200
      // Deficit account 30 needs 300
      // Largest surplus (account 10) fills deficit first
      const acc10 = result.accounts.find((a) => a.accountId === 10);
      expect(acc10!.transferRoutes).toHaveLength(1);
      expect(acc10!.transferRoutes[0].toAccountId).toBe(30);
      expect(acc10!.transferRoutes[0].amount).toBe(300);

      // Account 20 has no remaining deficit to fill
      const acc20 = result.accounts.find((a) => a.accountId === 20);
      expect(acc20!.transferRoutes).toHaveLength(0);
    });

    it('should handle multiple deficit accounts with greedy allocation', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Salary',
          paymentAccountId: 10,
          february: 1000,
        }),
      ];
      const expensePlans = [
        makeExpensePlan({
          id: 1,
          name: 'Big Expense',
          monthlyContribution: 500,
          paymentAccountId: 30,
        }),
        makeExpensePlan({
          id: 2,
          name: 'Small Expense',
          monthlyContribution: 200,
          paymentAccountId: 40,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue(expensePlans);

      const result = await service.calculateTransferSuggestions(userId, year, month);

      // Income 1000, no direct/shared obligations, surplus 1000, margin 100, transfer 900
      // Deficit: account 30 needs 500, account 40 needs 200
      // Greedy: fill largest first (account 30: 500), then account 40: 200
      const acc10 = result.accounts[0];
      expect(acc10.transferRoutes).toHaveLength(2);
      // Largest deficit first
      expect(acc10.transferRoutes[0].toAccountId).toBe(30);
      expect(acc10.transferRoutes[0].amount).toBe(500);
      expect(acc10.transferRoutes[1].toAccountId).toBe(40);
      expect(acc10.transferRoutes[1].amount).toBe(200);
    });

    it('should calculate plan summary with coverage percent', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Salary',
          paymentAccountId: 10,
          february: 2000,
        }),
      ];
      const expensePlans = [
        makeExpensePlan({
          id: 1,
          name: 'Rent',
          monthlyContribution: 400,
          paymentAccountId: 30,
        }),
        makeExpensePlan({
          id: 2,
          name: 'Utils',
          monthlyContribution: 100,
          paymentAccountId: 30,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue(expensePlans);

      const result = await service.calculateTransferSuggestions(userId, year, month);

      // Surplus = 2000, margin = 200, transfer = 1800
      // Deficit: account 30 needs 500
      // Coverage: 1800/500 = 360% → capped at 100
      expect(result.planSummary.totalDeficit).toBe(500);
      expect(result.planSummary.totalAvailable).toBe(1800);
      expect(result.planSummary.coveragePercent).toBe(100);
      expect(result.planSummary.uncoveredAmount).toBe(0);
    });

    it('should return empty deficit accounts when all expense plans are on income accounts', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Salary',
          paymentAccountId: 10,
          february: 2000,
        }),
      ];
      const expensePlans = [
        makeExpensePlan({
          id: 1,
          name: 'Rent',
          monthlyContribution: 500,
          paymentAccountId: 10,
        }),
        makeExpensePlan({
          id: 2,
          name: 'Groceries',
          monthlyContribution: 300,
          paymentAccountId: null,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue(expensePlans);

      const result = await service.calculateTransferSuggestions(userId, year, month);

      expect(result.deficitAccounts).toHaveLength(0);
      expect(result.planSummary.totalDeficit).toBe(0);
      expect(result.planSummary.coveragePercent).toBe(100);
    });

    it('should handle partial coverage when surplus < total deficit', async () => {
      const incomePlans = [
        makeIncomePlan({
          id: 1,
          name: 'Part-time',
          paymentAccountId: 10,
          february: 600,
        }),
      ];
      const expensePlans = [
        makeExpensePlan({
          id: 1,
          name: 'Direct Expense',
          monthlyContribution: 50,
          paymentAccountId: 10,
        }),
        makeExpensePlan({
          id: 2,
          name: 'Big Rent',
          monthlyContribution: 800,
          paymentAccountId: 30,
        }),
      ];

      incomePlanRepo.find.mockResolvedValue(incomePlans);
      expensePlanRepo.find.mockResolvedValue(expensePlans);

      const result = await service.calculateTransferSuggestions(userId, year, month);

      // Income 600, direct 50, surplus 550, margin 60, transfer 490
      // Deficit: account 30 needs 800
      // Coverage: 490/800 = 61.25%
      expect(result.planSummary.totalDeficit).toBe(800);
      expect(result.planSummary.totalAvailable).toBe(490);
      expect(result.planSummary.coveragePercent).toBeCloseTo(61.25, 1);
      expect(result.planSummary.uncoveredAmount).toBe(310);

      // Transfer route should allocate all available to deficit
      const acc10 = result.accounts[0];
      expect(acc10.transferRoutes).toHaveLength(1);
      expect(acc10.transferRoutes[0].toAccountId).toBe(30);
      expect(acc10.transferRoutes[0].amount).toBe(490);
    });
  });
});
