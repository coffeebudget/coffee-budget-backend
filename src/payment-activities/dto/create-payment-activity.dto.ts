import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsObject,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentActivityDto {
  @ApiProperty({
    description: 'ID of the payment account this activity belongs to',
    example: 1,
  })
  @IsNumber()
  paymentAccountId: number;

  @ApiProperty({
    description: 'Unique identifier from the payment provider',
    example: 'PAYID-12345-ABC',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  externalId: string;

  @ApiPropertyOptional({
    description: 'Merchant or business name',
    example: 'Netflix',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  merchantName?: string;

  @ApiPropertyOptional({
    description: 'Merchant business category',
    example: 'Streaming Services',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  merchantCategory?: string;

  @ApiPropertyOptional({
    description: 'ISO 18245 Merchant Category Code (MCC)',
    example: '5815',
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  merchantCategoryCode?: string;

  @ApiProperty({
    description: 'Transaction amount (negative for expenses, positive for income)',
    example: -15.99,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  amount: number;

  @ApiProperty({
    description: 'Date the payment was executed (ISO 8601)',
    example: '2024-01-15',
  })
  @IsDateString()
  executionDate: string;

  @ApiProperty({
    description: 'Complete raw data from payment provider as JSON object',
    example: {
      transactionId: 'PAYID-12345-ABC',
      payerEmail: 'customer@example.com',
      currency: 'EUR',
      status: 'completed',
    },
  })
  @IsObject()
  rawData: Record<string, any>;
}
