import { IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AcceptAdjustmentDto {
  @ApiPropertyOptional({
    description:
      'Custom amount to use instead of the suggested value. If not provided, the suggested value will be used.',
    example: 130.0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  customAmount?: number;
}

export class AdjustmentInfoDto {
  @ApiProperty({
    description: 'The suggested new monthly contribution amount',
    example: 125.54,
  })
  suggestedAmount: number;

  @ApiProperty({
    description: 'The current monthly contribution amount',
    example: 106.94,
  })
  currentAmount: number;

  @ApiProperty({
    description:
      'The percentage change (positive = increase, negative = decrease)',
    example: 17.4,
  })
  percentChange: number;

  @ApiProperty({
    description: 'The reason for the suggested adjustment',
    enum: ['spending_increased', 'spending_decreased'],
    example: 'spending_increased',
  })
  reason: 'spending_increased' | 'spending_decreased';

  @ApiProperty({
    description: 'When the adjustment was suggested',
    example: '2026-01-15T10:00:00.000Z',
  })
  suggestedAt: Date;
}

export class ReviewSummaryDto {
  @ApiProperty({
    description: 'Number of plans reviewed',
    example: 10,
  })
  plansReviewed: number;

  @ApiProperty({
    description: 'Number of plans with new adjustment suggestions',
    example: 2,
  })
  newSuggestions: number;

  @ApiProperty({
    description: 'Number of plans where old suggestions were cleared',
    example: 1,
  })
  clearedSuggestions: number;
}
