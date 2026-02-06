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
      });
    }

    return {
      year,
      month,
      accounts: Array.from(accountMap.values()),
      unassignedTotal,
      distinctIncomeAccountCount,
      sharePerAccount,
    };
  }
}
