import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCategoryDto {
  @ApiProperty({ description: 'Name of the category', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ description: 'Keywords of the category', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiProperty({
    description: 'Exclude from expense analytics',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  excludeFromExpenseAnalytics?: boolean;

  @ApiProperty({ description: 'Analytics exclusion reason', required: false })
  @IsOptional()
  @IsString()
  analyticsExclusionReason?: string;

  @ApiProperty({ description: 'Created at', required: false })
  @IsOptional()
  @IsDate()
  createdAt?: Date;

  @ApiProperty({ description: 'Updated at', required: false })
  @IsOptional()
  @IsDate()
  updatedAt?: Date;

  // 🎯 Budget Management Fields
  @ApiProperty({
    description: 'Budget level for intelligent categorization',
    enum: ['primary', 'secondary', 'optional'],
    required: false,
  })
  @IsOptional()
  @IsEnum(['primary', 'secondary', 'optional'])
  budgetLevel?: 'primary' | 'secondary' | 'optional';

  @ApiProperty({
    description: 'Monthly budget for this category',
    required: false,
  })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  monthlyBudget?: number;

  @ApiProperty({
    description: 'Yearly budget for this category',
    required: false,
  })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  yearlyBudget?: number;

  @ApiProperty({
    description: 'Maximum threshold (for secondary categories)',
    required: false,
  })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  maxThreshold?: number;

  @ApiProperty({ description: 'Warning threshold percentage', required: false })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  warningThreshold?: number;
}
