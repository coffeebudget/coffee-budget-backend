import {
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkFundItemDto {
  @ApiProperty({
    description: 'Expense plan ID to fund',
    example: 1,
  })
  @IsNumber()
  planId: number;

  @ApiProperty({
    description: 'Amount to contribute',
    example: 100,
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    description: 'Optional note for the contribution',
    example: 'Monthly savings',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class BulkFundDto {
  @ApiProperty({
    description: 'Array of plans to fund with amounts',
    type: [BulkFundItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkFundItemDto)
  items: BulkFundItemDto[];
}

export class LinkTransactionDto {
  @ApiProperty({
    description: 'Transaction ID to link',
    example: 100,
  })
  @IsNumber()
  transactionId: number;
}
