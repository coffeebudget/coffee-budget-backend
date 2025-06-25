import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDateString,
  IsArray,
  IsBoolean,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRecurringTransactionDto {
  @ApiProperty({
    description: 'Name of the recurring transaction',
    example: 'Monthly Rent',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Description of the recurring transaction',
    required: false,
    example: 'Monthly apartment rent payment',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Amount of the transaction',
    example: 1000.0,
  })
  @IsNumber()
  amount: number;

  @ApiProperty({
    enum: ['SCHEDULED', 'PAUSED', 'COMPLETED', 'CANCELLED'],
    description: 'Current status of the recurring transaction',
    example: 'SCHEDULED',
  })
  @IsEnum(['SCHEDULED', 'PAUSED', 'COMPLETED', 'CANCELLED'])
  status: 'SCHEDULED' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

  @ApiProperty({ enum: ['expense', 'income'] })
  @IsEnum(['expense', 'income'])
  type: 'expense' | 'income';

  @ApiProperty({ description: 'Frequency interval' })
  @IsNumber()
  frequencyEveryN: number;

  @ApiProperty({ enum: ['daily', 'weekly', 'monthly', 'yearly'] })
  @IsEnum(['daily', 'weekly', 'monthly', 'yearly'])
  frequencyType: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @ApiProperty({ description: 'Number of occurrences', required: false })
  @IsOptional()
  @IsNumber()
  occurrences?: number;

  @ApiProperty({ description: 'Start date of the recurring transaction' })
  @IsDateString()
  startDate: Date;

  @ApiProperty({
    description: 'End date of the recurring transaction',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: Date;

  @ApiProperty({ description: 'Category ID' })
  @IsNumber()
  @IsOptional()
  categoryId?: number;

  @ApiProperty({ description: 'Array of tag IDs', required: false })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  tagIds?: number[];

  @IsNumber()
  userId: number;

  @ApiProperty({ description: 'Bank Account ID', required: false })
  @IsOptional()
  @IsNumber()
  bankAccountId?: number;

  @ApiProperty({ description: 'Credit Card ID', required: false })
  @IsNumber()
  @IsOptional()
  creditCardId?: number;

  @ApiProperty({ description: 'User confirmed', required: false })
  @IsBoolean()
  @IsOptional()
  userConfirmed?: boolean;

  @ApiProperty({
    description: 'Source of the transaction (e.g., manual, CSV, API)',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  source?: 'MANUAL' | 'PATTERN_DETECTOR';
}
