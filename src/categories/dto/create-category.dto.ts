import { IsArray, IsBoolean, IsDate, IsOptional, IsString } from "class-validator";
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

  @ApiProperty({ description: 'Exclude from expense analytics', required: false })
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

