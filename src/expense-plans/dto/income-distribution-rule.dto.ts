import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsIn,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DistributionStrategy } from '../entities/income-distribution-rule.entity';

export class CreateIncomeDistributionRuleDto {
  @ApiProperty({
    description: 'Name for the income distribution rule',
    example: 'Monthly Salary',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Expected income amount to match',
    example: 3000,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedAmount?: number;

  @ApiPropertyOptional({
    description: 'Percentage tolerance for amount matching (default: 10%)',
    example: 10,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  amountTolerance?: number;

  @ApiPropertyOptional({
    description: 'Description pattern to match (pipe-separated keywords)',
    example: 'SALARY|PAYROLL|STIPEND',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descriptionPattern?: string;

  @ApiPropertyOptional({
    description: 'Category ID to match',
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @ApiPropertyOptional({
    description: 'Bank account ID to match',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  bankAccountId?: number;

  @ApiPropertyOptional({
    description: 'Whether to automatically distribute when matched',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  autoDistribute?: boolean;

  @ApiPropertyOptional({
    description: 'Distribution strategy to use',
    enum: ['priority', 'proportional', 'fixed'],
    example: 'priority',
    default: 'priority',
  })
  @IsOptional()
  @IsIn(['priority', 'proportional', 'fixed'])
  distributionStrategy?: DistributionStrategy;
}

export class UpdateIncomeDistributionRuleDto {
  @ApiPropertyOptional({
    description: 'Name for the income distribution rule',
    example: 'Monthly Salary',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Expected income amount to match (set null to remove)',
    example: 3000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedAmount?: number | null;

  @ApiPropertyOptional({
    description: 'Percentage tolerance for amount matching',
    example: 10,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  amountTolerance?: number;

  @ApiPropertyOptional({
    description: 'Description pattern to match (pipe-separated keywords)',
    example: 'SALARY|PAYROLL',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descriptionPattern?: string | null;

  @ApiPropertyOptional({
    description: 'Category ID to match (set null to remove)',
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  categoryId?: number | null;

  @ApiPropertyOptional({
    description: 'Bank account ID to match (set null to remove)',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  bankAccountId?: number | null;

  @ApiPropertyOptional({
    description: 'Whether to automatically distribute when matched',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  autoDistribute?: boolean;

  @ApiPropertyOptional({
    description: 'Distribution strategy to use',
    enum: ['priority', 'proportional', 'fixed'],
    example: 'priority',
  })
  @IsOptional()
  @IsIn(['priority', 'proportional', 'fixed'])
  distributionStrategy?: DistributionStrategy;

  @ApiPropertyOptional({
    description: 'Whether the rule is active',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ManualDistributionDto {
  @ApiProperty({
    description: 'Amount to distribute to expense plans',
    example: 3000,
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    description: 'Distribution strategy to use',
    enum: ['priority', 'proportional', 'fixed'],
    example: 'priority',
    default: 'priority',
  })
  @IsOptional()
  @IsIn(['priority', 'proportional', 'fixed'])
  strategy?: DistributionStrategy;

  @ApiPropertyOptional({
    description: 'Optional note for the distribution',
    example: 'Monthly income allocation',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
