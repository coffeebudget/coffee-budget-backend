import { IsString, IsNumber, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '../../enums/currency.enum';

export class CreateBankAccountDto {
  @ApiProperty({ description: 'Name of the bank account' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Balance of the bank account' })
  @IsNumber()
  balance: number;

  @ApiProperty({ description: 'Currency of the bank account', enum: Currency })
  @IsEnum(Currency)
  currency: Currency;

  @ApiProperty({
    description: 'Type of the bank account',
    enum: ['Checking', 'Savings', 'Deposit', 'Investment', 'Loan'],
  })
  @IsEnum(['Checking', 'Savings', 'Deposit', 'Investment', 'Loan'])
  type: string;

  @ApiProperty({
    description: 'GoCardless account ID for integration',
    required: false,
  })
  @IsOptional()
  @IsString()
  gocardlessAccountId?: string;
}
