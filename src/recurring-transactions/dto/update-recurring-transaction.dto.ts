import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDateString,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { CreateRecurringTransactionDto } from './create-recurring-transaction.dto';

export class UpdateRecurringTransactionDto extends PartialType(
  CreateRecurringTransactionDto,
) {
  @ApiProperty({
    description: 'Name of the recurring transaction',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Description of the recurring transaction',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Amount of the transaction', required: false })
  @IsNumber()
  @IsOptional()
  amount?: number;

  @ApiProperty({
    enum: ['SCHEDULED', 'PAUSED', 'COMPLETED', 'CANCELLED'],
    required: false,
  })
  @IsEnum(['SCHEDULED', 'PAUSED', 'COMPLETED', 'CANCELLED'])
  @IsOptional()
  status?: 'SCHEDULED' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

  @ApiProperty({ enum: ['expense', 'income'], required: false })
  @IsEnum(['expense', 'income'])
  @IsOptional()
  type?: 'expense' | 'income';

  @ApiProperty({ description: 'Frequency interval', required: false })
  @IsNumber()
  @IsOptional()
  frequencyEveryN?: number;

  @ApiProperty({
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    required: false,
  })
  @IsEnum(['daily', 'weekly', 'monthly', 'yearly'])
  @IsOptional()
  frequencyType?: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @ApiProperty({ description: 'Number of occurrences', required: false })
  @IsOptional()
  @IsNumber()
  occurrences?: number;

  @ApiProperty({
    description: 'Start date of the recurring transaction',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: Date;

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

  @ApiProperty({ description: 'Bank Account ID', required: false })
  @IsOptional()
  @IsNumber()
  bankAccountId?: number;

  @ApiProperty({ description: 'Credit Card ID', required: false })
  @IsNumber()
  @IsOptional()
  creditCardId?: number;

  @IsNumber()
  userId: number;

  @ApiProperty({ description: 'Apply to past', required: false })
  @IsOptional()
  applyToPast?: boolean;

  @ApiProperty({ description: 'User confirmed', required: false })
  @IsBoolean()
  @IsOptional()
  userConfirmed?: boolean;

  @ApiProperty({
    description: 'Source of the recurringtransaction',
    required: false,
  })
  @IsString()
  @IsOptional()
  source?: 'MANUAL' | 'PATTERN_DETECTOR';
}
