import {
  IsArray,
  IsBoolean,
  IsDate,
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ description: 'Name of the category', required: true })
  @IsString()
  name: string;

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

  // 🎯 Budget Management Fields
  @ApiProperty({ 
    description: 'Budget level for intelligent categorization',
    enum: ['primary', 'secondary', 'optional'],
    required: false,
    default: 'optional'
  })
  @IsOptional()
  @IsEnum(['primary', 'secondary', 'optional'])
  budgetLevel?: 'primary' | 'secondary' | 'optional';

  @ApiProperty({ description: 'Monthly budget for this category', required: false })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  monthlyBudget?: number;

  @ApiProperty({ description: 'Yearly budget for this category', required: false })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  yearlyBudget?: number;

  @ApiProperty({ description: 'Maximum threshold (for secondary categories)', required: false })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  maxThreshold?: number;

  @ApiProperty({ description: 'Warning threshold (percentage of budget)', required: false })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  warningThreshold?: number;
}
