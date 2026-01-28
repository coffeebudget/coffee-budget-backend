import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Status indicating how comfortable the user's budget position is
 */
export type FreeToSpendStatus = 'comfortable' | 'moderate' | 'tight' | 'overspent';

/**
 * Individual income source breakdown
 */
export class IncomeSourceDto {
  @ApiProperty({
    description: 'Name of the income source',
    example: 'Stipendio Alessandro',
  })
  source: string;

  @ApiProperty({
    description: 'Amount from this source',
    example: 4000,
  })
  amount: number;

  @ApiPropertyOptional({
    description: 'Reliability level of this income',
    enum: ['guaranteed', 'expected', 'uncertain'],
    example: 'guaranteed',
  })
  reliability?: string;
}

/**
 * Complete income breakdown for the month
 */
export class IncomeBreakdownDto {
  @ApiProperty({
    description: 'Total income (guaranteed + expected + uncertain)',
    example: 6100,
  })
  total: number;

  @ApiProperty({
    description: 'Guaranteed income (most reliable)',
    example: 5800,
  })
  guaranteed: number;

  @ApiProperty({
    description: 'Expected income (semi-reliable)',
    example: 300,
  })
  expected: number;

  @ApiProperty({
    description: 'Uncertain income (excluded from budget)',
    example: 0,
  })
  uncertain: number;

  @ApiProperty({
    description: 'Breakdown by individual income source',
    type: [IncomeSourceDto],
  })
  breakdown: IncomeSourceDto[];
}

/**
 * Individual obligation item (expense plan obligation)
 */
export class ObligationItemDto {
  @ApiProperty({
    description: 'Expense plan ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Name of the obligation',
    example: 'Rent',
  })
  name: string;

  @ApiProperty({
    description: 'Amount due this period',
    example: 1200,
  })
  amount: number;

  @ApiProperty({
    description: 'Type of obligation',
    enum: ['bills', 'savings', 'budgets'],
    example: 'bills',
  })
  type: 'bills' | 'savings' | 'budgets';

  @ApiProperty({
    description: 'Whether this obligation has been paid',
    example: false,
  })
  isPaid: boolean;

  @ApiPropertyOptional({
    description: 'Icon for the expense plan',
    example: '🏠',
  })
  icon?: string | null;
}

/**
 * Obligations breakdown by type
 */
export class ObligationsByTypeDto {
  @ApiProperty({
    description: 'Total for fixed bills (rent, utilities, subscriptions)',
    example: 1500,
  })
  bills: number;

  @ApiProperty({
    description: 'Total for savings goals (sinking funds, emergency fund)',
    example: 400,
  })
  savings: number;

  @ApiProperty({
    description: 'Total for spending budgets (groceries, transport)',
    example: 600,
  })
  budgets: number;
}

/**
 * Complete obligations breakdown
 */
export class ObligationsBreakdownDto {
  @ApiProperty({
    description: 'Total obligations for the month',
    example: 2500,
  })
  total: number;

  @ApiProperty({
    description: 'Amount committed but not yet paid',
    example: 1800,
  })
  committed: number;

  @ApiProperty({
    description: 'Amount already paid this month',
    example: 700,
  })
  alreadyPaid: number;

  @ApiProperty({
    description: 'Breakdown by obligation type',
    type: ObligationsByTypeDto,
  })
  byType: ObligationsByTypeDto;

  @ApiProperty({
    description: 'Individual obligation items',
    type: [ObligationItemDto],
  })
  items: ObligationItemDto[];
}

/**
 * Category spending for discretionary breakdown
 */
export class CategorySpendingDto {
  @ApiProperty({
    description: 'Category name',
    example: 'Dining Out',
  })
  category: string;

  @ApiProperty({
    description: 'Amount spent in this category',
    example: 150,
  })
  amount: number;
}

/**
 * Discretionary spending breakdown
 */
export class DiscretionarySpendingDto {
  @ApiProperty({
    description: 'Total discretionary spending this month',
    example: 450,
  })
  total: number;

  @ApiProperty({
    description: 'Number of discretionary transactions',
    example: 23,
  })
  transactionCount: number;

  @ApiProperty({
    description: 'Top spending categories',
    type: [CategorySpendingDto],
  })
  topCategories: CategorySpendingDto[];
}

/**
 * Main Free to Spend response
 */
export class FreeToSpendResponseDto {
  @ApiProperty({
    description: 'Month in YYYY-MM format',
    example: '2026-01',
  })
  month: string;

  @ApiProperty({
    description: 'Amount free to spend guilt-free',
    example: 1250,
  })
  freeToSpend: number;

  @ApiProperty({
    description: 'Status based on remaining budget percentage',
    enum: ['comfortable', 'moderate', 'tight', 'overspent'],
    example: 'comfortable',
  })
  status: FreeToSpendStatus;

  @ApiProperty({
    description: 'Income breakdown',
    type: IncomeBreakdownDto,
  })
  income: IncomeBreakdownDto;

  @ApiProperty({
    description: 'Obligations breakdown',
    type: ObligationsBreakdownDto,
  })
  obligations: ObligationsBreakdownDto;

  @ApiProperty({
    description: 'Discretionary spending breakdown',
    type: DiscretionarySpendingDto,
  })
  discretionarySpending: DiscretionarySpendingDto;

  @ApiProperty({
    description: 'Timestamp when this was calculated',
    example: '2026-01-28T10:30:00Z',
  })
  lastUpdated: string;
}
