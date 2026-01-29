import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO for linking a transaction to an expense plan
 */
export class LinkTransactionDto {
  @ApiProperty({
    description: 'ID of the transaction to link',
    example: 123,
  })
  @IsInt()
  transactionId: number;

  @ApiPropertyOptional({
    description: 'Optional note about this payment',
    example: 'January electricity bill',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

/**
 * Response DTO for an expense plan payment
 */
export class ExpensePlanPaymentResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 42 })
  expensePlanId: number;

  @ApiProperty({ example: 2025 })
  year: number;

  @ApiProperty({ example: 1 })
  month: number;

  @ApiProperty({ example: '2025-01' })
  period: string;

  @ApiProperty({ example: 127.38 })
  amount: number;

  @ApiProperty({ example: '2025-01-15' })
  paymentDate: string;

  @ApiProperty({ enum: ['auto_linked', 'manual', 'unlinked'] })
  paymentType: string;

  @ApiPropertyOptional({ example: 123 })
  transactionId: number | null;

  transaction: {
    id: number;
    description: string;
    amount: number;
    executionDate: string | null;
  } | null;

  @ApiPropertyOptional({ example: 'January electricity bill' })
  notes: string | null;

  @ApiProperty({ example: '2025-01-15T10:30:00.000Z' })
  createdAt: string;
}

/**
 * Query params for filtering payments
 */
export class PaymentsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by year',
    example: 2025,
  })
  @IsOptional()
  @IsInt()
  year?: number;

  @ApiPropertyOptional({
    description: 'Filter by month (1-12)',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  month?: number;
}
