import { PartialType } from '@nestjs/mapped-types';
import { CreateBankAccountDto } from './create-bank-account.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '../../enums/currency.enum';

export class UpdateBankAccountDto extends PartialType(CreateBankAccountDto) {
  @ApiProperty({ description: 'Name of the bank account', required: false })
  name?: string;

  @ApiProperty({ description: 'Balance of the bank account', required: false })
  balance?: number;

  @ApiProperty({ description: 'Currency of the bank account', required: false, enum: Currency })
  currency?: Currency;

  @ApiProperty({ description: 'Type of the bank account', enum: ['Checking', 'Savings', 'Deposit', 'Investment', 'Loan'], required: false })
  type?: string;
}
