import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsArray,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ExpensePlanType,
  ExpensePlanPriority,
  ExpensePlanFrequency,
  ContributionSource,
  InitialBalanceSource,
  PaymentAccountType,
  ExpensePlanPurpose,
} from '../entities/expense-plan.entity';

export class CreateExpensePlanDto {
  @ApiProperty({
    description: 'Name of the expense plan',
    example: 'Car Insurance',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Description of what this plan is for',
    example: 'Annual car insurance premium for both vehicles',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Emoji icon for visual identification',
    example: '🚗',
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  icon?: string;

  @ApiProperty({
    description: 'Type of expense plan',
    enum: [
      'fixed_monthly',
      'yearly_fixed',
      'yearly_variable',
      'multi_year',
      'seasonal',
      'emergency_fund',
      'goal',
    ],
    example: 'yearly_fixed',
  })
  @IsEnum([
    'fixed_monthly',
    'yearly_fixed',
    'yearly_variable',
    'multi_year',
    'seasonal',
    'emergency_fund',
    'goal',
  ])
  planType: ExpensePlanType;

  @ApiPropertyOptional({
    description: 'Priority for underfunding scenarios',
    enum: ['essential', 'important', 'discretionary'],
    default: 'important',
  })
  @IsOptional()
  @IsEnum(['essential', 'important', 'discretionary'])
  priority?: ExpensePlanPriority;

  @ApiPropertyOptional({
    description: 'Category ID to link for auto-tracking',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @ApiPropertyOptional({
    description: 'Auto-deduct from balance when category spending occurs',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  autoTrackCategory?: boolean;

  @ApiPropertyOptional({
    description:
      'Purpose of the plan: sinking_fund (accumulate for future expense) or spending_budget (track category spending)',
    enum: ['sinking_fund', 'spending_budget'],
    default: 'sinking_fund',
  })
  @IsOptional()
  @IsEnum(['sinking_fund', 'spending_budget'])
  purpose?: ExpensePlanPurpose;

  @ApiProperty({
    description: 'Total amount needed per cycle',
    example: 1200,
  })
  @IsNumber()
  @Min(0)
  targetAmount: number;

  @ApiProperty({
    description: 'Amount to save per month',
    example: 100,
  })
  @IsNumber()
  @Min(0)
  monthlyContribution: number;

  @ApiPropertyOptional({
    description: 'How the monthly contribution was determined',
    enum: ['calculated', 'manual', 'historical'],
    default: 'calculated',
  })
  @IsOptional()
  @IsEnum(['calculated', 'manual', 'historical'])
  contributionSource?: ContributionSource;

  @ApiProperty({
    description: 'How often the expense occurs',
    enum: [
      'monthly',
      'quarterly',
      'yearly',
      'multi_year',
      'seasonal',
      'one_time',
    ],
    example: 'yearly',
  })
  @IsEnum([
    'monthly',
    'quarterly',
    'yearly',
    'multi_year',
    'seasonal',
    'one_time',
  ])
  frequency: ExpensePlanFrequency;

  @ApiPropertyOptional({
    description: 'Number of years for multi_year frequency',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  frequencyYears?: number;

  @ApiPropertyOptional({
    description: 'Month when expense is due (1-12)',
    example: 6,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  dueMonth?: number;

  @ApiPropertyOptional({
    description: 'Day of month when expense is due',
    example: 15,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(31)
  dueDay?: number;

  @ApiPropertyOptional({
    description: 'Target date for goal-type plans',
    example: '2025-12-25',
  })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({
    description: 'Months when seasonal expense occurs (1-12)',
    example: [11, 12, 1, 2],
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  seasonalMonths?: number[];

  @ApiPropertyOptional({
    description: 'Use algorithm to suggest amounts',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  autoCalculate?: boolean;

  @ApiPropertyOptional({
    description: 'Keep excess for next cycle',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  rolloverSurplus?: boolean;

  @ApiPropertyOptional({
    description: 'How to set initial balance',
    enum: ['zero', 'historical', 'custom'],
    default: 'zero',
  })
  @IsOptional()
  @IsEnum(['zero', 'historical', 'custom'])
  initialBalanceSource?: InitialBalanceSource;

  @ApiPropertyOptional({
    description: 'Custom initial balance amount',
    example: 500,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialBalanceCustom?: number;

  // ─────────────────────────────────────────────────────────────
  // PAYMENT SOURCE (Optional - for coverage tracking)
  // ─────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Type of payment account (for future credit card support)',
    enum: ['bank_account'],
    example: 'bank_account',
  })
  @IsOptional()
  @IsEnum(['bank_account'])
  paymentAccountType?: PaymentAccountType;

  @ApiPropertyOptional({
    description: 'ID of the bank account used for payment',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  paymentAccountId?: number;
}
