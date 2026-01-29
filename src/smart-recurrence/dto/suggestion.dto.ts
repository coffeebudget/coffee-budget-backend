import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsEnum,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { ExpenseType } from '../interfaces/classification.interface';
import { FrequencyType } from '../interfaces/frequency.interface';
import {
  SuggestionStatus,
  SuggestionSource,
} from '../entities/expense-plan-suggestion.entity';
import { ExpensePlanPurpose } from '../../expense-plans/entities/expense-plan.entity';

// ─────────────────────────────────────────────────────────────
// REQUEST DTOs
// ─────────────────────────────────────────────────────────────

export class GenerateSuggestionsDto {
  @ApiPropertyOptional({
    description: 'Number of months to analyze for patterns',
    default: 12,
    minimum: 3,
    maximum: 24,
  })
  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(24)
  monthsToAnalyze?: number;

  @ApiPropertyOptional({
    description: 'Minimum occurrences required to detect a pattern',
    default: 2,
    minimum: 2,
    maximum: 12,
  })
  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(12)
  minOccurrences?: number;

  @ApiPropertyOptional({
    description: 'Minimum confidence score for pattern detection (0-100)',
    default: 60,
    minimum: 30,
    maximum: 95,
  })
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(95)
  minConfidence?: number;

  @ApiPropertyOptional({
    description: 'Similarity threshold for grouping transactions (0-100)',
    default: 60,
    minimum: 40,
    maximum: 90,
  })
  @IsOptional()
  @IsNumber()
  @Min(40)
  @Max(90)
  similarityThreshold?: number;

  @ApiPropertyOptional({
    description: 'Force regeneration even if recent suggestions exist',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forceRegenerate?: boolean;
}

export class ApproveSuggestionDto {
  @ApiPropertyOptional({
    description:
      'Custom name for the expense plan (uses suggestion name if not provided)',
  })
  @IsOptional()
  @IsString()
  customName?: string;

  @ApiPropertyOptional({
    description:
      'Custom monthly contribution (uses suggested amount if not provided)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  customMonthlyContribution?: number;

  @ApiPropertyOptional({
    description:
      'Category ID to assign (uses detected category if not provided)',
  })
  @IsOptional()
  @IsNumber()
  categoryId?: number;
}

export class RejectSuggestionDto {
  @ApiPropertyOptional({
    description: 'Reason for rejecting the suggestion',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BulkActionDto {
  @ApiProperty({
    description: 'Array of suggestion IDs to process',
    type: [Number],
  })
  suggestionIds: number[];
}

// ─────────────────────────────────────────────────────────────
// RESPONSE DTOs
// ─────────────────────────────────────────────────────────────

export class SuggestionResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  suggestedName: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  merchantName: string | null;

  @ApiProperty()
  representativeDescription: string;

  @ApiPropertyOptional()
  categoryId: number | null;

  @ApiPropertyOptional()
  categoryName: string | null;

  @ApiProperty()
  averageAmount: number;

  @ApiProperty()
  monthlyContribution: number;

  @ApiProperty()
  yearlyTotal: number;

  @ApiProperty({ enum: ExpenseType })
  expenseType: ExpenseType;

  @ApiProperty()
  isEssential: boolean;

  @ApiProperty({ enum: FrequencyType })
  frequencyType: FrequencyType;

  @ApiProperty()
  intervalDays: number;

  @ApiProperty()
  patternConfidence: number;

  @ApiProperty()
  classificationConfidence: number;

  @ApiProperty()
  overallConfidence: number;

  @ApiPropertyOptional()
  classificationReasoning: string | null;

  @ApiProperty()
  occurrenceCount: number;

  @ApiProperty()
  firstOccurrence: Date;

  @ApiProperty()
  lastOccurrence: Date;

  @ApiProperty()
  nextExpectedDate: Date;

  @ApiPropertyOptional({
    enum: ['sinking_fund', 'spending_budget'],
    description:
      'Suggested purpose: sinking_fund (accumulate for future expense) or spending_budget (track category spending)',
  })
  suggestedPurpose: ExpensePlanPurpose | null;

  @ApiProperty({
    enum: ['pattern', 'category_average'],
    description:
      'Source of the suggestion: pattern (detected from recurring transactions) or category_average (fallback using monthly average)',
  })
  suggestionSource: SuggestionSource;

  @ApiPropertyOptional({
    description:
      'Monthly average spending for the category (used for discrepancy comparison)',
  })
  categoryMonthlyAverage: number | null;

  @ApiPropertyOptional({
    description:
      'Percentage difference between pattern amount and category average',
  })
  discrepancyPercentage: number | null;

  @ApiProperty({
    description:
      'Whether there is a significant discrepancy between pattern and category average',
  })
  hasDiscrepancyWarning: boolean;

  @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'expired'] })
  status: SuggestionStatus;

  @ApiProperty()
  createdAt: Date;

  // v4: Template detection (PRD-006)
  @ApiPropertyOptional({
    description: 'Suggested expense plan template ID',
    example: 'monthly-bill',
  })
  suggestedTemplate: string | null;

  @ApiPropertyOptional({
    description: 'Confidence score for template suggestion (0-100)',
    minimum: 0,
    maximum: 100,
  })
  templateConfidence: number | null;

  @ApiPropertyOptional({
    description: 'Reasons explaining why this template was suggested',
    type: [String],
    example: ['Monthly payments detected', 'Very consistent amounts'],
  })
  templateReasons: string[] | null;

  @ApiPropertyOptional({
    description: 'Pre-filled configuration for the suggested template',
    example: { dueDay: 15, autoTrackCategory: true },
  })
  suggestedConfig: {
    dueDay?: number;
    dueMonth?: number;
    paymentSchedule?: { month: number; estimatedAmount: number }[];
    spendingWindows?: number[];
    autoTrackCategory?: boolean;
    paymentAccountId?: number;
  } | null;
}

export class GenerateSuggestionsResponseDto {
  @ApiProperty({ type: [SuggestionResponseDto] })
  suggestions: SuggestionResponseDto[];

  @ApiProperty()
  totalFound: number;

  @ApiProperty()
  newSuggestions: number;

  @ApiProperty()
  existingSuggestions: number;

  @ApiProperty({
    description: 'Number of pending suggestions cleared before regenerating',
  })
  clearedCount: number;

  @ApiProperty()
  processingTimeMs: number;

  @ApiProperty({
    description: 'Summary of suggestions by expense type',
    example: {
      byExpenseType: { subscription: 3, utility: 2 },
      totalMonthlyContribution: 250.5,
      essentialCount: 5,
      discretionaryCount: 3,
    },
  })
  summary: {
    byExpenseType: Record<string, number>;
    totalMonthlyContribution: number;
    essentialCount: number;
    discretionaryCount: number;
  };
}

export class SuggestionListResponseDto {
  @ApiProperty({ type: [SuggestionResponseDto] })
  suggestions: SuggestionResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  pending: number;

  @ApiProperty()
  approved: number;

  @ApiProperty()
  rejected: number;
}

export class ApprovalResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  suggestionId: number;

  @ApiPropertyOptional()
  expensePlanId?: number;

  @ApiPropertyOptional()
  message?: string;
}

export class BulkActionResultDto {
  @ApiProperty()
  processed: number;

  @ApiProperty()
  successful: number;

  @ApiProperty()
  failed: number;

  @ApiProperty({ type: [ApprovalResultDto] })
  results: ApprovalResultDto[];
}

export class ApiUsageStatsDto {
  @ApiProperty()
  dailyApiCalls: number;

  @ApiProperty()
  maxDailyApiCalls: number;

  @ApiProperty()
  remainingCalls: number;

  @ApiProperty()
  cacheSize: number;
}
