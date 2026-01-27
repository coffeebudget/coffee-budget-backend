import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IncomePlanReliability,
  IncomePlanStatus,
} from '../entities/income-plan.entity';

export class CreateIncomePlanDto {
  @ApiProperty({
    description: 'Name of the income plan',
    example: 'Stipendio Alessandro',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Description of this income source',
    example: 'Monthly salary with 13th month bonus in December',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Emoji icon for visual identification',
    example: '💼',
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  icon?: string;

  @ApiPropertyOptional({
    description:
      'Reliability level: guaranteed (in budget), expected (warning), uncertain (excluded)',
    enum: ['guaranteed', 'expected', 'uncertain'],
    default: 'guaranteed',
  })
  @IsOptional()
  @IsEnum(['guaranteed', 'expected', 'uncertain'])
  reliability?: IncomePlanReliability;

  @ApiPropertyOptional({
    description: 'Category ID to link for auto-suggest matching',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  categoryId?: number;

  // ─────────────────────────────────────────────────────────────
  // MONTHLY CALENDAR (12 amounts)
  // ─────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Expected income for January',
    example: 4000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  january?: number;

  @ApiPropertyOptional({
    description: 'Expected income for February',
    example: 4000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  february?: number;

  @ApiPropertyOptional({
    description: 'Expected income for March',
    example: 4000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  march?: number;

  @ApiPropertyOptional({
    description: 'Expected income for April',
    example: 4000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  april?: number;

  @ApiPropertyOptional({
    description: 'Expected income for May',
    example: 4000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  may?: number;

  @ApiPropertyOptional({
    description: 'Expected income for June',
    example: 4000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  june?: number;

  @ApiPropertyOptional({
    description: 'Expected income for July',
    example: 4000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  july?: number;

  @ApiPropertyOptional({
    description: 'Expected income for August',
    example: 4000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  august?: number;

  @ApiPropertyOptional({
    description: 'Expected income for September',
    example: 4000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  september?: number;

  @ApiPropertyOptional({
    description: 'Expected income for October',
    example: 4000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  october?: number;

  @ApiPropertyOptional({
    description: 'Expected income for November',
    example: 4000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  november?: number;

  @ApiPropertyOptional({
    description: 'Expected income for December (may include bonuses)',
    example: 7000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  december?: number;

  // ─────────────────────────────────────────────────────────────
  // PAYMENT DESTINATION
  // ─────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'ID of the bank account where income is received',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  paymentAccountId?: number;

  // ─────────────────────────────────────────────────────────────
  // TIMING
  // ─────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Expected day of month when income is received (1-31)',
    example: 27,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(31)
  expectedDay?: number;

  // ─────────────────────────────────────────────────────────────
  // STATUS
  // ─────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Status of the income plan',
    enum: ['active', 'paused', 'archived'],
    default: 'active',
  })
  @IsOptional()
  @IsEnum(['active', 'paused', 'archived'])
  status?: IncomePlanStatus;
}
