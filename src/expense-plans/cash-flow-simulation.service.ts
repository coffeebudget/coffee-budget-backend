import { Injectable } from '@nestjs/common';

export interface CashFlowEvent {
  day: number;
  amount: number;
  name: string;
  type: 'income' | 'expense';
}

export interface DailyBalance {
  day: number;
  events: CashFlowEvent[];
  balanceAfter: number;
}

export interface MonthlyFlowResult {
  startingBalance: number;
  endingBalance: number;
  minimumBalance: number;
  minimumBalanceDay: number;
  hasShortfall: boolean;
  shortfallAmount: number;
  dailyBalances: DailyBalance[];
}

@Injectable()
export class CashFlowSimulationService {
  simulateMonthlyFlow(
    startingBalance: number,
    events: CashFlowEvent[],
  ): MonthlyFlowResult {
    const sorted = [...events].sort((a, b) => a.day - b.day);

    const byDay = new Map<number, CashFlowEvent[]>();
    for (const event of sorted) {
      if (!byDay.has(event.day)) byDay.set(event.day, []);
      byDay.get(event.day)!.push(event);
    }

    let balance = startingBalance;
    let minimumBalance = startingBalance;
    let minimumBalanceDay = 0;
    const dailyBalances: DailyBalance[] = [];

    for (const [day, dayEvents] of byDay) {
      for (const event of dayEvents) {
        balance += event.amount;
      }

      dailyBalances.push({ day, events: dayEvents, balanceAfter: balance });

      if (balance < minimumBalance) {
        minimumBalance = balance;
        minimumBalanceDay = day;
      }
    }

    return {
      startingBalance,
      endingBalance: balance,
      minimumBalance,
      minimumBalanceDay,
      hasShortfall: minimumBalance < 0,
      shortfallAmount: minimumBalance < 0 ? Math.abs(minimumBalance) : 0,
      dailyBalances,
    };
  }

  buildEventsForAccount(
    expensePlans: Array<{
      name: string;
      monthlyContribution: number;
      dueDay: number | null;
      paymentAccountId: number | null;
      endDate: Date | null;
    }>,
    incomePlans: Array<{
      name: string;
      amount: number;
      expectedDay: number | null;
      paymentAccountId: number | null;
      endDate: Date | null;
    }>,
    accountId: number,
  ): CashFlowEvent[] {
    const events: CashFlowEvent[] = [];
    const today = new Date();

    for (const plan of expensePlans) {
      if (plan.paymentAccountId !== accountId) continue;
      if (plan.endDate && new Date(plan.endDate) < today) continue;
      const contribution = Number(plan.monthlyContribution);
      if (contribution <= 0) continue;

      events.push({
        day: plan.dueDay ?? 1,
        amount: -contribution,
        name: plan.name,
        type: 'expense',
      });
    }

    for (const plan of incomePlans) {
      if (plan.paymentAccountId !== accountId) continue;
      if (plan.endDate && new Date(plan.endDate) < today) continue;
      const amount = Number(plan.amount);
      if (amount <= 0) continue;

      events.push({
        day: plan.expectedDay ?? 27,
        amount,
        name: plan.name,
        type: 'income',
      });
    }

    return events;
  }
}
