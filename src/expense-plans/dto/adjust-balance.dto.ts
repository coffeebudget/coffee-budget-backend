import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdjustBalanceDto {
  @ApiProperty({
    description: 'New balance amount to set',
    example: 500,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  newBalance: number;

  @ApiPropertyOptional({
    description: 'Reason for the balance adjustment',
    example: 'Correction for missed tracking',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
