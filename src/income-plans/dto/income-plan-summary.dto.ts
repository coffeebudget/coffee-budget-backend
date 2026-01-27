import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IncomePlanReliability,
  MonthlyAmounts,
} from '../entities/income-plan.entity';

/**
 * Summary for a single income plan with calculated fields
 */
export class IncomePlanSummaryDto {
  @ApiProperty({ description: 'Income plan ID', example: 1 })
  id: number;

  @ApiProperty({
    description: 'Name of the income plan',
    example: 'Stipendio Alessandro',
  })
  name: string;

  @ApiPropertyOptional({ description: 'Icon for display', example: '💼' })
  icon: string | null;

  @ApiProperty({
    description: 'Reliability level',
    enum: ['guaranteed', 'expected', 'uncertain'],
  })
  reliability: IncomePlanReliability;

  @ApiProperty({ description: 'Annual total from all months', example: 51000 })
  annualTotal: number;

  @ApiProperty({ description: 'Average monthly income', example: 4250 })
  monthlyAverage: number;

  @ApiProperty({
    description: 'Expected income for current month',
    example: 4000,
  })
  currentMonthExpected: number;
}

/**
 * Monthly summary of all income plans for budget calculation
 */
export class MonthlySummaryDto {
  @ApiProperty({ description: 'Year being summarized', example: 2025 })
  year: number;

  @ApiProperty({ description: 'Month being summarized (1-12)', example: 1 })
  month: number;

  @ApiProperty({
    description: 'Total guaranteed income for this month',
    example: 5800,
  })
  guaranteedTotal: number;

  @ApiProperty({
    description: 'Total expected income for this month (warning)',
    example: 0,
  })
  expectedTotal: number;

  @ApiProperty({
    description: 'Total uncertain income for this month (excluded from budget)',
    example: 300,
  })
  uncertainTotal: number;

  @ApiProperty({
    description: 'Combined total (guaranteed + expected + uncertain)',
    example: 6100,
  })
  totalIncome: number;

  @ApiProperty({
    description: 'Budget-safe income (guaranteed only)',
    example: 5800,
  })
  budgetSafeIncome: number;

  @ApiProperty({
    description: 'Number of active income plans',
    example: 4,
  })
  planCount: number;

  @ApiProperty({
    description: 'Breakdown by individual income plan',
    type: [IncomePlanSummaryDto],
  })
  plans: IncomePlanSummaryDto[];
}

/**
 * Annual summary for year-over-year planning
 */
export class AnnualSummaryDto {
  @ApiProperty({ description: 'Year being summarized', example: 2025 })
  year: number;

  @ApiProperty({
    description: 'Total annual income across all plans',
    example: 73800,
  })
  totalAnnualIncome: number;

  @ApiProperty({
    description: 'Monthly average across all plans',
    example: 6150,
  })
  monthlyAverage: number;

  @ApiProperty({
    description: 'Monthly breakdown of expected income',
    example: {
      january: 6100,
      february: 6100,
      march: 6100,
      april: 6100,
      may: 6100,
      june: 6100,
      july: 5300,
      august: 5300,
      september: 5300,
      october: 6100,
      november: 6100,
      december: 9100,
    },
  })
  monthlyBreakdown: MonthlyAmounts;

  @ApiProperty({
    description: 'Minimum monthly income (critical month)',
    example: 5300,
  })
  minimumMonth: number;

  @ApiProperty({
    description: 'Maximum monthly income',
    example: 9300,
  })
  maximumMonth: number;

  @ApiProperty({
    description: 'Number of active income plans',
    example: 4,
  })
  planCount: number;

  @ApiProperty({
    description: 'Summary by individual plan',
    type: [IncomePlanSummaryDto],
  })
  plans: IncomePlanSummaryDto[];
}

/**
 * Budget calculation result showing available funds
 */
export class BudgetCalculationDto {
  @ApiProperty({ description: 'Year for budget', example: 2025 })
  year: number;

  @ApiProperty({ description: 'Month for budget (1-12)', example: 1 })
  month: number;

  @ApiProperty({
    description: 'Total guaranteed income',
    example: 5800,
  })
  totalIncome: number;

  @ApiProperty({
    description: 'Total planned expenses (from expense plans)',
    example: 2528,
  })
  totalExpenses: number;

  @ApiProperty({
    description: 'Available for discretionary spending (income - expenses)',
    example: 3272,
  })
  availableForDiscretionary: number;

  @ApiProperty({
    description: 'Income breakdown by reliability',
  })
  incomeByReliability: {
    guaranteed: number;
    expected: number;
    uncertain: number;
  };
}
