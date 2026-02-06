import { IncomePlanReliability } from '../entities/income-plan.entity';
import { ExpensePlanPriority } from '../../expense-plans/entities/expense-plan.entity';

export type TransferSuggestionStatus = 'deficit' | 'tight' | 'transferable';

export class IncomeSourceDetailDto {
  planId: number;
  name: string;
  amountForMonth: number;
  reliability: IncomePlanReliability;
}

export class ObligationDetailDto {
  planId: number;
  name: string;
  monthlyContribution: number;
  priority: ExpensePlanPriority;
  isDirectlyAssigned: boolean;
}

export class TransferRouteDto {
  toAccountId: number;
  toAccountName: string;
  amount: number;
}

export class DeficitAccountDto {
  accountId: number;
  accountName: string;
  totalNeed: number;
  obligationDetails: ObligationDetailDto[];
}

export class TransferPlanSummaryDto {
  totalDeficit: number;
  totalAvailable: number;
  coveragePercent: number;
  uncoveredAmount: number;
}

export class AccountTransferSuggestionDto {
  accountId: number;
  accountName: string;
  totalIncome: number;
  incomeSources: IncomeSourceDetailDto[];
  directObligations: number;
  directObligationDetails: ObligationDetailDto[];
  sharedObligations: number;
  sharedObligationDetails: ObligationDetailDto[];
  totalObligations: number;
  surplus: number;
  safetyMargin: number;
  suggestedTransfer: number;
  status: TransferSuggestionStatus;
  transferRoutes: TransferRouteDto[];
}

export class TransferSuggestionsResponseDto {
  year: number;
  month: number;
  accounts: AccountTransferSuggestionDto[];
  unassignedTotal: number;
  distinctIncomeAccountCount: number;
  sharePerAccount: number;
  deficitAccounts: DeficitAccountDto[];
  planSummary: TransferPlanSummaryDto;
}
