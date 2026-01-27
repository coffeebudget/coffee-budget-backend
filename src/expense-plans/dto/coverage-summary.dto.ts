import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PeriodRange } from './coverage-period.dto';

/**
 * Source of the balance information
 */
export type BalanceSource = 'gocardless' | 'manual' | 'unknown';

/**
 * Type of obligation calculation
 */
export type ObligationType = 'fixed' | 'estimated' | 'prorated';

/**
 * Represents an expense plan at risk of not being covered
 */
export class PlanAtRisk {
  @ApiProperty({
    description: 'Expense plan ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Expense plan name',
    example: 'Car Insurance',
  })
  name: string;

  @ApiProperty({
    description: 'Amount of the expense',
    example: 1200,
  })
  amount: number;

  @ApiPropertyOptional({
    description: 'Next due date for this expense',
    example: '2026-02-15',
  })
  nextDueDate: string | null;

  @ApiProperty({
    description: 'Number of days until due',
    example: 15,
  })
  daysUntilDue: number;

  @ApiPropertyOptional({
    description: 'Icon for the expense plan',
    example: '🚗',
  })
  icon: string | null;

  @ApiProperty({
    description: 'Type of obligation calculation',
    enum: ['fixed', 'estimated', 'prorated'],
    example: 'fixed',
  })
  obligationType: ObligationType;
}

/**
 * Coverage information for a single bank account
 */
export class AccountCoverage {
  @ApiProperty({
    description: 'Bank account ID',
    example: 1,
  })
  accountId: number;

  @ApiProperty({
    description: 'Bank account name',
    example: 'Main Checking',
  })
  accountName: string;

  @ApiPropertyOptional({
    description: 'Financial institution name',
    example: 'ING',
  })
  institution: string | null;

  @ApiProperty({
    description: 'Current account balance',
    example: 2500,
  })
  currentBalance: number;

  @ApiProperty({
    description: 'Source of the balance information',
    enum: ['gocardless', 'manual', 'unknown'],
    example: 'gocardless',
  })
  balanceSource: BalanceSource;

  @ApiPropertyOptional({
    description: 'When the balance was last updated',
    example: '2026-01-27T10:30:00Z',
  })
  balanceLastUpdated: string | null;

  @ApiProperty({
    description: 'Total amount of upcoming plans in next 30 days',
    example: 1850,
  })
  upcomingPlansTotal: number;

  @ApiProperty({
    description: 'Number of plans linked to this account',
    example: 4,
  })
  planCount: number;

  @ApiProperty({
    description: 'Projected balance after all upcoming expenses',
    example: 650,
  })
  projectedBalance: number;

  @ApiProperty({
    description: 'Whether there is a shortfall',
    example: false,
  })
  hasShortfall: boolean;

  @ApiProperty({
    description: 'Shortfall amount (0 if no shortfall)',
    example: 0,
  })
  shortfallAmount: number;

  @ApiProperty({
    description: 'List of plans at risk if there is a shortfall',
    type: [PlanAtRisk],
  })
  plansAtRisk: PlanAtRisk[];
}

/**
 * Summary for expense plans not linked to any account
 */
export class UnassignedPlanSummary {
  @ApiProperty({
    description: 'Number of unassigned plans',
    example: 3,
  })
  count: number;

  @ApiProperty({
    description: 'Total amount of unassigned plans',
    example: 340,
  })
  totalAmount: number;

  @ApiProperty({
    description: 'List of unassigned plans',
    type: [PlanAtRisk],
  })
  plans: PlanAtRisk[];
}

/**
 * Complete coverage summary response
 */
export class CoverageSummaryResponse {
  @ApiProperty({
    description: 'The period for which coverage is calculated',
    type: PeriodRange,
  })
  period: PeriodRange;

  @ApiProperty({
    description:
      'Coverage information for each bank account with upcoming plans',
    type: [AccountCoverage],
  })
  accounts: AccountCoverage[];

  @ApiProperty({
    description: 'Summary of plans not linked to any account',
    type: UnassignedPlanSummary,
  })
  unassignedPlans: UnassignedPlanSummary;

  @ApiProperty({
    description: 'Overall status of coverage',
    enum: ['all_covered', 'has_shortfall', 'no_data'],
    example: 'all_covered',
  })
  overallStatus: 'all_covered' | 'has_shortfall' | 'no_data';

  @ApiProperty({
    description: 'Total shortfall amount across all accounts',
    example: 0,
  })
  totalShortfall: number;

  @ApiProperty({
    description: 'Number of accounts with shortfall',
    example: 0,
  })
  accountsWithShortfall: number;
}
