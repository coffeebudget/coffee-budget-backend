import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePaymentActivityDto {
  @ApiPropertyOptional({
    description: 'ID of the reconciled bank transaction',
    example: 123,
  })
  @IsOptional()
  @IsNumber()
  reconciledTransactionId?: number;

  @ApiPropertyOptional({
    description: 'Reconciliation status',
    example: 'reconciled',
    enum: ['pending', 'reconciled', 'failed', 'manual'],
  })
  @IsOptional()
  @IsEnum(['pending', 'reconciled', 'failed', 'manual'])
  reconciliationStatus?: 'pending' | 'reconciled' | 'failed' | 'manual';

  @ApiPropertyOptional({
    description: 'Confidence score for automated reconciliation (0-100)',
    example: 85.5,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  reconciliationConfidence?: number;
}
