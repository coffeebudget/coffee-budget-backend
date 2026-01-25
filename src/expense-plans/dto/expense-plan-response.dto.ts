import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type FundingStatus =
  | 'funded'
  | 'almost_ready'
  | 'on_track'
  | 'behind'
  | null;

/**
 * Extended expense plan response with calculated funding status fields.
 * Used for responses that need to show progress toward goals.
 */
export class ExpensePlanWithStatusDto {
  @ApiProperty({ description: 'Expense plan ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Plan name', example: 'Car Insurance' })
  name: string;

  @ApiPropertyOptional({ description: 'Plan description' })
  description: string | null;

  @ApiPropertyOptional({ description: 'Plan icon emoji', example: '🚗' })
  icon: string | null;

  @ApiProperty({ description: 'Plan type', example: 'yearly_fixed' })
  planType: string;

  @ApiProperty({ description: 'Plan priority', example: 'essential' })
  priority: string;

  @ApiProperty({ description: 'Plan purpose', example: 'sinking_fund' })
  purpose: string;

  @ApiProperty({ description: 'Target amount', example: 600 })
  targetAmount: number;

  @ApiProperty({ description: 'Current accumulated balance', example: 300 })
  currentBalance: number;

  @ApiProperty({ description: 'Monthly contribution amount', example: 50 })
  monthlyContribution: number;

  @ApiProperty({ description: 'Plan frequency', example: 'yearly' })
  frequency: string;

  @ApiPropertyOptional({ description: 'Next due date' })
  nextDueDate: Date | null;

  @ApiProperty({ description: 'Plan status', example: 'active' })
  status: string;

  @ApiPropertyOptional({ description: 'Linked category ID' })
  categoryId: number | null;

  @ApiPropertyOptional({ description: 'Payment account ID' })
  paymentAccountId: number | null;

  @ApiPropertyOptional({ description: 'Payment account type' })
  paymentAccountType: string | null;

  // ─────────────────────────────────────────────────────────────
  // CALCULATED FUNDING STATUS FIELDS
  // ─────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Funding status: funded, almost_ready, on_track, behind, or null if not applicable',
    example: 'on_track',
    enum: ['funded', 'almost_ready', 'on_track', 'behind', null],
  })
  fundingStatus: FundingStatus;

  @ApiPropertyOptional({
    description: 'Months until next due date',
    example: 5.2,
  })
  monthsUntilDue: number | null;

  @ApiPropertyOptional({
    description: 'Amount still needed to reach target',
    example: 300,
  })
  amountNeeded: number | null;

  @ApiPropertyOptional({
    description: 'Required monthly contribution to reach target on time',
    example: 57.69,
  })
  requiredMonthlyContribution: number | null;

  @ApiPropertyOptional({
    description: 'Progress percentage toward target',
    example: 50,
  })
  progressPercent: number;

  @ApiPropertyOptional({
    description:
      'Expected funded amount by now based on plan creation date and monthly contribution',
    example: 1600,
  })
  expectedFundedByNow: number | null;

  @ApiPropertyOptional({
    description:
      'Funding gap from expected: expectedFundedByNow - currentBalance. Positive means behind schedule.',
    example: 1600,
  })
  fundingGapFromExpected: number | null;

  @ApiPropertyOptional({
    description: 'Plan creation date (used to calculate expected funding)',
  })
  createdAt: Date | null;
}

/**
 * Plan needing attention in the long-term status summary.
 * Must be defined before LongTermStatusSummary to avoid circular reference.
 */
export class PlanNeedingAttention {
  @ApiProperty({ description: 'Plan ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Plan name', example: 'Car Insurance' })
  name: string;

  @ApiPropertyOptional({ description: 'Plan icon', example: '🚗' })
  icon: string | null;

  @ApiProperty({
    description: 'Funding status',
    example: 'behind',
    enum: ['behind', 'almost_ready'],
  })
  status: 'behind' | 'almost_ready';

  @ApiProperty({ description: 'Amount needed to reach target', example: 300 })
  amountNeeded: number;

  @ApiProperty({ description: 'Months until due date', example: 2.5 })
  monthsUntilDue: number;

  @ApiPropertyOptional({ description: 'Next due date' })
  nextDueDate: string | null;

  @ApiProperty({
    description: 'Required monthly contribution',
    example: 120,
  })
  requiredMonthly: number;

  @ApiProperty({
    description: 'Current monthly contribution',
    example: 50,
  })
  currentMonthly: number;

  @ApiProperty({
    description: 'Shortfall per month (required - current)',
    example: 70,
  })
  shortfallPerMonth: number;

  @ApiPropertyOptional({
    description: 'Expected funded amount by now',
    example: 1600,
  })
  expectedFundedByNow: number | null;

  @ApiPropertyOptional({
    description: 'Current balance',
    example: 0,
  })
  currentBalance: number;

  @ApiPropertyOptional({
    description: 'Funding gap from expected (positive means behind)',
    example: 1600,
  })
  fundingGapFromExpected: number | null;
}

/**
 * Long-term sinking fund status summary for coverage section integration
 */
export class LongTermStatusSummary {
  @ApiProperty({ description: 'Total number of sinking funds', example: 5 })
  totalSinkingFunds: number;

  @ApiProperty({ description: 'Number of plans on track', example: 3 })
  onTrackCount: number;

  @ApiProperty({
    description: 'Number of plans behind schedule',
    example: 1,
  })
  behindScheduleCount: number;

  @ApiProperty({ description: 'Number of fully funded plans', example: 1 })
  fundedCount: number;

  @ApiProperty({ description: 'Number of plans almost ready', example: 0 })
  almostReadyCount: number;

  @ApiProperty({
    description: 'Total amount still needed across all plans',
    example: 1250,
  })
  totalAmountNeeded: number;

  @ApiProperty({
    description: 'Plans that need attention (behind or almost due)',
    type: [PlanNeedingAttention],
  })
  plansNeedingAttention: PlanNeedingAttention[];
}
