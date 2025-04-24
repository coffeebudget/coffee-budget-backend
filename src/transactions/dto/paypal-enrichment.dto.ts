import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PayPalEnrichmentDto {
  @ApiProperty({
    description: 'The PayPal CSV content',
    example: 'CSV data as string'
  })
  @IsString()
  csvData: string;

  @ApiProperty({
    description: 'Date range (in days) to look for matching transactions',
    example: 5,
    required: false
  })
  @IsNumber()
  @IsOptional()
  dateRangeForMatching?: number;
} 