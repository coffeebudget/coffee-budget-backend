import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DuplicateTransactionChoice } from './duplicate-transaction-choice.dto';

export class CreateTransactionDto {
  @ApiProperty({ description: 'Description of the transaction' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Amount of the transaction' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'ID of the associated category' })
  @IsNotEmpty()
  categoryId: number;

  @ApiProperty({
    enum: ['income', 'expense'],
    description: 'Type of the transaction',
  })
  @IsEnum(['income', 'expense'])
  type: 'income' | 'expense';

  @ApiProperty({
    enum: ['pending', 'executed'],
    description: 'Status of the transaction',
  })
  @IsEnum(['pending', 'executed'])
  status: 'pending' | 'executed';

  @ApiProperty({
    description: 'ID of the associated bank account',
    required: false,
  })
  @IsOptional()
  bankAccountId?: number;

  @ApiProperty({
    description: 'ID of the associated credit card',
    required: false,
  })
  @IsOptional()
  creditCardId?: number;

  @ApiProperty({
    description: 'Array of tag IDs associated with the transaction',
    required: false,
  })
  @IsOptional()
  @IsArray()
  tagIds?: number[];

  @ApiProperty({
    description: 'Execution date of the transaction',
    required: false,
  })
  @IsOptional()
  executionDate?: Date;

  @ApiProperty({
    description: 'Source of the transaction (e.g., manual, CSV, API)',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  source: string;

  @ApiProperty({
    description: 'ID of the associated recurring transaction',
    required: false,
  })
  @IsOptional()
  recurringTransactionId?: number;

  @ApiProperty({
    description: 'Billing date of the transaction',
    required: false,
  })
  @IsOptional()
  billingDate?: Date;

  @ApiProperty({
    description: 'Duplicate choice for the transaction',
    required: false,
  })
  @IsOptional()
  duplicateChoice?: DuplicateTransactionChoice;
}
