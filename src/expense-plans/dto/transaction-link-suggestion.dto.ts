import {
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TransactionLinkSuggestionStatus,
  SuggestedTransactionType,
} from '../entities/transaction-link-suggestion.entity';

export class TransactionLinkSuggestionResponseDto {
  @ApiProperty({ description: 'Suggestion ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Transaction ID', example: 123 })
  transactionId: number;

  @ApiProperty({
    description: 'Transaction description',
    example: 'Asilo Nido Milano',
  })
  transactionDescription: string;

  @ApiProperty({ description: 'Transaction amount', example: -300 })
  transactionAmount: number;

  @ApiProperty({
    description: 'Transaction date',
    example: '2026-01-24T00:00:00.000Z',
  })
  transactionDate: string;

  @ApiProperty({ description: 'Expense plan ID', example: 5 })
  expensePlanId: number;

  @ApiProperty({ description: 'Expense plan name', example: 'Asilo Figlio' })
  expensePlanName: string;

  @ApiProperty({
    description: 'Expense plan icon',
    example: null,
    nullable: true,
  })
  expensePlanIcon: string | null;

  @ApiProperty({
    description: 'Suggested transaction type (withdrawal or contribution)',
    example: 'withdrawal',
    enum: ['withdrawal', 'contribution'],
  })
  suggestedType: SuggestedTransactionType;

  @ApiProperty({
    description: 'Suggestion status',
    example: 'pending',
    enum: ['pending', 'approved', 'rejected', 'invalidated'],
  })
  status: TransactionLinkSuggestionStatus;

  @ApiProperty({
    description: 'When the suggestion was created',
    example: '2026-01-24T10:00:00.000Z',
  })
  createdAt: string;
}

export class ApproveLinkSuggestionDto {
  @ApiPropertyOptional({
    description:
      'Custom amount to use instead of transaction amount (absolute value)',
    example: 250,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  customAmount?: number;
}

export class RejectLinkSuggestionDto {
  @ApiPropertyOptional({
    description: 'Reason for rejecting the suggestion',
    example: 'Already tracked elsewhere',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description:
      'If true, no more suggestions will be created for this expense plan',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  neverAskForPlan?: boolean;
}

export class BulkApproveSuggestionsDto {
  @ApiProperty({
    description: 'Array of suggestion IDs to approve',
    example: [1, 2, 3],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  ids: number[];
}

export class BulkRejectSuggestionsDto {
  @ApiProperty({
    description: 'Array of suggestion IDs to reject',
    example: [1, 2, 3],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  ids: number[];

  @ApiPropertyOptional({
    description: 'Reason for rejecting all suggestions',
    example: 'Bulk rejection',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SuggestionCountsDto {
  @ApiProperty({ description: 'Number of pending suggestions', example: 3 })
  pending: number;

  @ApiProperty({ description: 'Total number of suggestions', example: 10 })
  total: number;
}

export class LinkApprovalResultDto {
  @ApiProperty({ description: 'Whether the approval was successful' })
  success: boolean;
}

export class BulkApprovalResultDto {
  @ApiProperty({ description: 'Number of successfully approved suggestions' })
  approvedCount: number;

  @ApiProperty({ description: 'Number of failed approvals' })
  failedCount: number;

  @ApiProperty({
    description: 'IDs of suggestions that failed to approve',
    type: [Number],
  })
  failedIds: number[];
}

export class BulkRejectionResultDto {
  @ApiProperty({ description: 'Number of successfully rejected suggestions' })
  rejectedCount: number;

  @ApiProperty({ description: 'Number of failed rejections' })
  failedCount: number;

  @ApiProperty({
    description: 'IDs of suggestions that failed to reject',
    type: [Number],
  })
  failedIds: number[];
}
