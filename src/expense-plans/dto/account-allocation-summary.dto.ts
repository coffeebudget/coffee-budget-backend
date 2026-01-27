import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Individual fixed monthly plan allocation within the account summary.
 * Shows whether the plan is ready for payment and current status.
 */
export class FixedMonthlyPlanAllocation {
  @ApiProperty({ description: 'Plan ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Plan name', example: 'Mortgage' })
  name: string;

  @ApiPropertyOptional({ description: 'Plan icon', example: '🏠' })
  icon: string | null;

  @ApiProperty({
    description: 'Required amount (full payment)',
    example: 1301,
  })
  requiredToday: number;

  @ApiProperty({
    description: 'Current balance in the plan',
    example: 1301,
  })
  currentBalance: number;

  @ApiProperty({
    description: 'Whether current month payment has been made',
    example: true,
  })
  paymentMade: boolean;

  @ApiProperty({
    description: 'Whether ready for next payment',
    example: true,
  })
  readyForNextMonth: boolean;

  @ApiProperty({
    description: 'Payment status: paid, pending, or short',
    example: 'paid',
    enum: ['paid', 'pending', 'short'],
  })
  status: 'paid' | 'pending' | 'short';

  @ApiPropertyOptional({
    description: 'Amount short if not ready',
    example: null,
  })
  amountShort: number | null;
}

/**
 * Individual sinking fund plan allocation within the account summary.
 * Shows expected vs actual savings progress.
 */
export class SinkingFundPlanAllocation {
  @ApiProperty({ description: 'Plan ID', example: 2 })
  id: number;

  @ApiProperty({ description: 'Plan name', example: 'Summer Vacation' })
  name: string;

  @ApiPropertyOptional({ description: 'Plan icon', example: '🏖️' })
  icon: string | null;

  @ApiProperty({
    description: 'Expected funded amount by today (required allocation)',
    example: 1893,
  })
  requiredToday: number;

  @ApiProperty({
    description: 'Current balance in the plan',
    example: 1500,
  })
  currentBalance: number;

  @ApiProperty({
    description: 'Target total amount',
    example: 4000,
  })
  targetAmount: number;

  @ApiProperty({
    description: 'Monthly contribution',
    example: 400,
  })
  monthlyContribution: number;

  @ApiProperty({
    description: 'Progress percentage',
    example: 37.5,
  })
  progressPercent: number;

  @ApiProperty({
    description: 'Funding status relative to schedule',
    example: 'behind',
    enum: ['ahead', 'on_track', 'behind'],
  })
  status: 'ahead' | 'on_track' | 'behind';

  @ApiPropertyOptional({
    description: 'Gap from expected (positive = behind schedule)',
    example: 393,
  })
  gapFromExpected: number | null;

  @ApiPropertyOptional({
    description: 'Next due date',
    example: '2026-07-01',
  })
  nextDueDate: string | null;

  @ApiPropertyOptional({
    description: 'Months until due',
    example: 6,
  })
  monthsUntilDue: number | null;
}

/**
 * Complete account allocation summary showing total required today
 * vs current balance and detailed breakdown by plan type.
 */
export class AccountAllocationSummary {
  @ApiProperty({ description: 'Bank account ID', example: 1 })
  accountId: number;

  @ApiProperty({ description: 'Bank account name', example: 'BNL Main' })
  accountName: string;

  @ApiProperty({
    description: 'Current bank account balance',
    example: 4154.57,
  })
  currentBalance: number;

  @ApiProperty({
    description: 'Total amount that should be allocated today',
    example: 6104,
  })
  totalRequiredToday: number;

  @ApiProperty({
    description: 'Amount short (positive) or surplus (negative)',
    example: 1949.43,
  })
  shortfall: number;

  @ApiProperty({
    description: 'Amount surplus (if any)',
    example: 0,
  })
  surplus: number;

  @ApiProperty({
    description: 'Account health status',
    example: 'shortfall',
    enum: ['healthy', 'tight', 'shortfall'],
  })
  healthStatus: 'healthy' | 'tight' | 'shortfall';

  @ApiProperty({
    description: 'Fixed monthly plans (bills that need full amount ready)',
    type: [FixedMonthlyPlanAllocation],
  })
  fixedMonthlyPlans: FixedMonthlyPlanAllocation[];

  @ApiProperty({
    description: 'Total required for fixed monthly plans',
    example: 2061,
  })
  fixedMonthlyTotal: number;

  @ApiProperty({
    description: 'Sinking fund plans (savings progress)',
    type: [SinkingFundPlanAllocation],
  })
  sinkingFundPlans: SinkingFundPlanAllocation[];

  @ApiProperty({
    description: 'Total expected for sinking funds by today',
    example: 4043,
  })
  sinkingFundTotal: number;

  @ApiProperty({
    description: 'Total monthly contribution across all plans',
    example: 3035.59,
  })
  monthlyContributionTotal: number;

  @ApiPropertyOptional({
    description: 'Suggested catch-up amount to add',
    example: 1949.43,
  })
  suggestedCatchUp: number | null;
}

/**
 * Response containing allocation summaries for all accounts with linked plans.
 */
export class AccountAllocationSummaryResponse {
  @ApiProperty({
    description: 'Account allocation summaries',
    type: [AccountAllocationSummary],
  })
  accounts: AccountAllocationSummary[];

  @ApiProperty({
    description: 'Overall health status across all accounts',
    example: 'shortfall',
    enum: ['healthy', 'tight', 'shortfall'],
  })
  overallStatus: 'healthy' | 'tight' | 'shortfall';

  @ApiProperty({
    description: 'Total shortfall across all accounts',
    example: 1949.43,
  })
  totalShortfall: number;

  @ApiProperty({
    description: 'Number of accounts with shortfall',
    example: 1,
  })
  accountsWithShortfall: number;

  @ApiProperty({
    description: 'Total monthly contribution needed across all accounts',
    example: 3035.59,
  })
  totalMonthlyContribution: number;
}
