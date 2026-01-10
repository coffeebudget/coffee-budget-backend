import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsDateString,
} from 'class-validator';

export class GocardlessImportDto {
  @ApiProperty({
    description: 'GoCardless account ID to import transactions from',
    example: 'account-id-from-gocardless',
  })
  @IsString()
  accountId: string;

  @ApiProperty({
    description: 'Optional bank account ID to associate transactions with',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  bankAccountId?: number;

  @ApiProperty({
    description: 'Optional credit card ID to associate transactions with',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  creditCardId?: number;

  @ApiProperty({
    description: 'Skip duplicate checking and force import all transactions',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  skipDuplicateCheck?: boolean;

  @ApiProperty({
    description:
      'Create pending duplicates for manual review instead of skipping',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  createPendingForDuplicates?: boolean;

  @ApiProperty({
    description: 'Start date for transaction import (YYYY-MM-DD format)',
    required: false,
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiProperty({
    description: 'End date for transaction import (YYYY-MM-DD format)',
    required: false,
    example: '2024-12-31',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
