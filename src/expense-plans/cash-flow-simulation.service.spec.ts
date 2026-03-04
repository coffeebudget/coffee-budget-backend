import {
  CashFlowSimulationService,
  CashFlowEvent,
} from './cash-flow-simulation.service';

describe('CashFlowSimulationService', () => {
  let service: CashFlowSimulationService;

  beforeEach(() => {
    service = new CashFlowSimulationService();
  });

  describe('simulateMonthlyFlow', () => {
    it('should simulate BNL-like scenario with no real shortfall', () => {
      const startingBalance = 5548.78;
      const events: CashFlowEvent[] = [
        { day: 1, amount: -350, name: 'Condominium Fees', type: 'expense' },
        {
          day: 2,
          amount: -37.57,
          name: 'Mortgage Insurance Life',
          type: 'expense',
        },
        {
          day: 5,
          amount: -325.6,
          name: 'University TAX',
          type: 'expense',
        },
        {
          day: 9,
          amount: -760,
          name: 'Daycare / School',
          type: 'expense',
        },
        { day: 27, amount: 4000, name: 'Salary', type: 'income' },
        { day: 28, amount: -1301, name: 'Mortgage', type: 'expense' },
      ];

      const result = service.simulateMonthlyFlow(startingBalance, events);

      expect(result.minimumBalance).toBeCloseTo(4075.61, 2);
      expect(result.minimumBalanceDay).toBe(9);
      expect(result.endingBalance).toBeCloseTo(6774.61, 2);
      expect(result.hasShortfall).toBe(false);
    });

    it('should detect real shortfall when balance goes negative', () => {
      const startingBalance = 500;
      const events: CashFlowEvent[] = [
        { day: 5, amount: -800, name: 'Big bill', type: 'expense' },
        { day: 27, amount: 2000, name: 'Salary', type: 'income' },
      ];

      const result = service.simulateMonthlyFlow(startingBalance, events);

      expect(result.minimumBalance).toBeCloseTo(-300, 2);
      expect(result.minimumBalanceDay).toBe(5);
      expect(result.hasShortfall).toBe(true);
      expect(result.shortfallAmount).toBeCloseTo(300, 2);
    });

    it('should handle empty events (no change)', () => {
      const result = service.simulateMonthlyFlow(1000, []);

      expect(result.minimumBalance).toBe(1000);
      expect(result.endingBalance).toBe(1000);
      expect(result.hasShortfall).toBe(false);
    });

    it('should handle multiple events on the same day', () => {
      const events: CashFlowEvent[] = [
        { day: 1, amount: -100, name: 'Bill A', type: 'expense' },
        { day: 1, amount: -200, name: 'Bill B', type: 'expense' },
        { day: 1, amount: 500, name: 'Income', type: 'income' },
      ];

      const result = service.simulateMonthlyFlow(0, events);

      expect(result.endingBalance).toBe(200);
      expect(result.hasShortfall).toBe(false);
    });

    it('should return sorted daily balances', () => {
      const events: CashFlowEvent[] = [
        { day: 15, amount: -500, name: 'Bill', type: 'expense' },
        { day: 28, amount: 2000, name: 'Salary', type: 'income' },
      ];

      const result = service.simulateMonthlyFlow(1000, events);

      expect(result.dailyBalances).toHaveLength(2);
      expect(result.dailyBalances[0]).toEqual(
        expect.objectContaining({ day: 15, balanceAfter: 500 }),
      );
      expect(result.dailyBalances[1]).toEqual(
        expect.objectContaining({ day: 28, balanceAfter: 2500 }),
      );
    });
  });

  describe('buildEventsForAccount', () => {
    it('should build events from expense plans and income plans', () => {
      const expensePlans = [
        {
          name: 'Rent',
          monthlyContribution: 1200,
          dueDay: 1,
          paymentAccountId: 9,
          endDate: null,
        },
        {
          name: 'Utilities',
          monthlyContribution: 150,
          dueDay: 15,
          paymentAccountId: 9,
          endDate: null,
        },
      ];
      const incomePlans = [
        {
          name: 'Salary',
          amount: 4000,
          expectedDay: 27,
          paymentAccountId: 9,
          endDate: null,
        },
      ];

      const events = service.buildEventsForAccount(
        expensePlans as any,
        incomePlans as any,
        9,
      );

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual(
        expect.objectContaining({
          day: 1,
          amount: -1200,
          name: 'Rent',
          type: 'expense',
        }),
      );
      expect(events[2]).toEqual(
        expect.objectContaining({
          day: 27,
          amount: 4000,
          name: 'Salary',
          type: 'income',
        }),
      );
    });

    it('should default dueDay to 1 and expectedDay to 27 when null', () => {
      const expensePlans = [
        {
          name: 'Unknown',
          monthlyContribution: 100,
          dueDay: null,
          paymentAccountId: 9,
          endDate: null,
        },
      ];
      const incomePlans = [
        {
          name: 'Income',
          amount: 500,
          expectedDay: null,
          paymentAccountId: 9,
          endDate: null,
        },
      ];

      const events = service.buildEventsForAccount(
        expensePlans as any,
        incomePlans as any,
        9,
      );

      expect(events[0].day).toBe(1);
      expect(events[1].day).toBe(27);
    });

    it('should skip expense plans with past endDate', () => {
      const expensePlans = [
        {
          name: 'Expired',
          monthlyContribution: 100,
          dueDay: 5,
          paymentAccountId: 9,
          endDate: new Date('2025-01-01'),
        },
        {
          name: 'Active',
          monthlyContribution: 200,
          dueDay: 10,
          paymentAccountId: 9,
          endDate: null,
        },
      ];

      const events = service.buildEventsForAccount(
        expensePlans as any,
        [],
        9,
      );

      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('Active');
    });
  });
});
