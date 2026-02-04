import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsDate,
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
}
