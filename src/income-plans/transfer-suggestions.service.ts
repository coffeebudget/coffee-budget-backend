import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncomePlan } from './entities/income-plan.entity';
import { ExpensePlan } from '../expense-plans/entities/expense-plan.entity';
import {
  TransferSuggestionsResponseDto,
  AccountTransferSuggestionDto,
  IncomeSourceDetailDto,
  ObligationDetailDto,
  TransferSuggestionStatus,
  DeficitAccountDto,
  TransferRouteDto,
  TransferPlanSummaryDto,
} from './dto/transfer-suggestions.dto';

const SAFETY_MARGIN_PERCENT = 0.1;

@Injectable()
export class TransferSuggestionsService {
  constructor(
    @InjectRepository(IncomePlan)
    private readonly incomePlanRepo: Repository<IncomePlan>,
    @InjectRepository(ExpensePlan)
    private readonly expensePlanRepo: Repository<ExpensePlan>,
  ) {}

  async calculateTransferSuggestions(
    userId: number,
    year: number,
    month: number,
  ): Promise<TransferSuggestionsResponseDto> {
    const monthIndex = month - 1; // getAmountForMonth uses 0-indexed

    // Fetch active income plans and expense plans in parallel
    const [incomePlans, expensePlans] = await Promise.all([
      this.incomePlanRepo.find({
        where: { userId, status: 'active' },
        relations: ['paymentAccount'],
      }),
      this.expensePlanRepo.find({
        where: { userId, status: 'active' },
        relations: ['paymentAccount'],
      }),
    ]);

    // Filter income plans to only those with a paymentAccountId
    const linkedIncomePlans = incomePlans.filter(
      (p) => p.paymentAccountId !== null,
    );

    // Get distinct income account IDs
    const distinctAccountIds = new Set(
      linkedIncomePlans.map((p) => p.paymentAccountId!),
    );
    const distinctIncomeAccountCount = distinctAccountIds.size;

    // Calculate unassigned expense plans total
    const unassignedExpensePlans = expensePlans.filter(
      (p) => p.paymentAccountId === null,
    );
    const unassignedTotal = unassignedExpensePlans.reduce(
      (sum, p) => sum + (Number(p.monthlyContribution) || 0),
      0,
    );

    // Equal split across income accounts
    const sharePerAccount =
      distinctIncomeAccountCount > 0
        ? unassignedTotal / distinctIncomeAccountCount
        : 0;

    // Build per-account suggestions
    const accountMap = new Map<number, AccountTransferSuggestionDto>();

    for (const accountId of distinctAccountIds) {
      const accountIncomePlans = linkedIncomePlans.filter(
        (p) => p.paymentAccountId === accountId,
      );
      const accountName =
        accountIncomePlans[0]?.paymentAccount?.name ??
        `Account ${accountId}`;

      // Sum income for this month
      const incomeSources: IncomeSourceDetailDto[] = accountIncomePlans.map(
        (p) => ({
          planId: p.id,
          name: p.name,
          amountForMonth: p.getAmountForMonth(monthIndex),
          reliability: p.reliability,
        }),
      );
      const totalIncome = incomeSources.reduce(
        (sum, s) => sum + s.amountForMonth,
        0,
      );

      // Direct obligations (expense plans assigned to this account)
      const directExpensePlans = expensePlans.filter(
        (p) => p.paymentAccountId === accountId,
      );
      const directObligationDetails: ObligationDetailDto[] =
        directExpensePlans.map((p) => ({
          planId: p.id,
          name: p.name,
          monthlyContribution: Number(p.monthlyContribution) || 0,
          priority: p.priority,
          isDirectlyAssigned: true,
        }));
      const directObligations = directObligationDetails.reduce(
        (sum, d) => sum + d.monthlyContribution,
        0,
      );

      // Shared obligations (unassigned, split equally)
      const sharedObligationDetails: ObligationDetailDto[] =
        unassignedExpensePlans.map((p) => ({
          planId: p.id,
          name: p.name,
          monthlyContribution: Number(p.monthlyContribution) || 0,
          priority: p.priority,
          isDirectlyAssigned: false,
        }));
      const sharedObligations = sharePerAccount;

      const totalObligations = directObligations + sharedObligations;
      const surplus = totalIncome - totalObligations;
      const safetyMargin = totalIncome * SAFETY_MARGIN_PERCENT;
      const suggestedTransfer = Math.max(0, surplus - safetyMargin);

      let status: TransferSuggestionStatus;
      if (surplus <= 0) {
        status = 'deficit';
      } else if (surplus <= safetyMargin) {
        status = 'tight';
      } else {
        status = 'transferable';
      }

      accountMap.set(accountId, {
        accountId,
        accountName,
        totalIncome,
        incomeSources,
        directObligations,
        directObligationDetails,
        sharedObligations,
        sharedObligationDetails,
        totalObligations,
        surplus,
        safetyMargin,
        suggestedTransfer,
        status,
        transferRoutes: [],
      });
    }

    // Step A: Discover deficit accounts
    // These are accounts that have expense plans assigned but NO income plans
    const deficitAccountMap = new Map<
      number,
      { accountName: string; totalNeed: number; obligations: ObligationDetailDto[] }
    >();

    for (const ep of expensePlans) {
      if (
        ep.paymentAccountId !== null &&
        !distinctAccountIds.has(ep.paymentAccountId)
      ) {
        const existing = deficitAccountMap.get(ep.paymentAccountId);
        const obligation: ObligationDetailDto = {
          planId: ep.id,
          name: ep.name,
          monthlyContribution: Number(ep.monthlyContribution) || 0,
          priority: ep.priority,
          isDirectlyAssigned: true,
        };
        if (existing) {
          existing.totalNeed += obligation.monthlyContribution;
          existing.obligations.push(obligation);
        } else {
          deficitAccountMap.set(ep.paymentAccountId, {
            accountName:
              ep.paymentAccount?.name ?? `Account ${ep.paymentAccountId}`,
            totalNeed: obligation.monthlyContribution,
            obligations: [obligation],
          });
        }
      }
    }

    const deficitAccounts: DeficitAccountDto[] = Array.from(
      deficitAccountMap.entries(),
    ).map(([accountId, data]) => ({
      accountId,
      accountName: data.accountName,
      totalNeed: data.totalNeed,
      obligationDetails: data.obligations,
    }));

    // Step B: Build transfer routes (greedy largest-first)
    const transferableAccounts = Array.from(accountMap.values())
      .filter((a) => a.suggestedTransfer > 0)
      .sort((a, b) => b.suggestedTransfer - a.suggestedTransfer);

    const sortedDeficits = [...deficitAccounts].sort(
      (a, b) => b.totalNeed - a.totalNeed,
    );

    const remainingNeed = new Map<number, number>();
    for (const d of sortedDeficits) {
      remainingNeed.set(d.accountId, d.totalNeed);
    }

    for (const surplusAccount of transferableAccounts) {
      let remainingSurplus = surplusAccount.suggestedTransfer;
      const routes: TransferRouteDto[] = [];

      for (const deficitAccount of sortedDeficits) {
        if (remainingSurplus <= 0) break;
        const need = remainingNeed.get(deficitAccount.accountId) ?? 0;
        if (need <= 0) continue;

        const allocation = Math.min(remainingSurplus, need);
        routes.push({
          toAccountId: deficitAccount.accountId,
          toAccountName: deficitAccount.accountName,
          amount: allocation,
        });

        remainingSurplus -= allocation;
        remainingNeed.set(
          deficitAccount.accountId,
          need - allocation,
        );
      }

      surplusAccount.transferRoutes = routes;
    }

    // Step C: Build plan summary
    const totalDeficit = deficitAccounts.reduce(
      (sum, d) => sum + d.totalNeed,
      0,
    );
    const totalAvailable = transferableAccounts.reduce(
      (sum, a) => sum + a.suggestedTransfer,
      0,
    );
    const planSummary: TransferPlanSummaryDto = {
      totalDeficit,
      totalAvailable,
      coveragePercent:
        totalDeficit > 0
          ? Math.min(100, (totalAvailable / totalDeficit) * 100)
          : 100,
      uncoveredAmount: Math.max(0, totalDeficit - totalAvailable),
    };

    return {
      year,
      month,
      accounts: Array.from(accountMap.values()),
      unassignedTotal,
      distinctIncomeAccountCount,
      sharePerAccount,
      deficitAccounts,
      planSummary,
    };
  }
}
