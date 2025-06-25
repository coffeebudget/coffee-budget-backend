import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

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
}
