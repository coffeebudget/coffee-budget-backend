import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsNumber } from 'class-validator';

export class CreateAccessTokenDto {
  @ApiProperty()
  @IsString()
  secret_id: string;

  @ApiProperty()
  @IsString()
  secret_key: string;
}

export class AccessTokenResponseDto {
  @ApiProperty()
  access: string;

  @ApiProperty()
  access_expires: number;

  @ApiProperty()
  refresh: string;

  @ApiProperty()
  refresh_expires: number;
}

export class InstitutionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  bic: string;

  @ApiProperty()
  transaction_total_days: string;

  @ApiProperty()
  countries: string[];

  @ApiProperty()
  logo: string;

  @ApiProperty()
  max_access_valid_for_days: string;
}

export class CreateEndUserAgreementDto {
  @ApiProperty()
  @IsString()
  institution_id: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  max_historical_days?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  access_valid_for_days?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  access_scope?: string[];
}

export class EndUserAgreementResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  created: string;

  @ApiProperty()
  max_historical_days: number;

  @ApiProperty()
  access_valid_for_days: number;

  @ApiProperty()
  access_scope: string[];

  @ApiProperty()
  accepted: string;

  @ApiProperty()
  institution_id: string;
}

export class CreateRequisitionDto {
  @ApiProperty()
  @IsString()
  redirect: string;

  @ApiProperty()
  @IsString()
  institution_id: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  agreement?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  user_language?: string;
}

export class RequisitionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  created: string;

  @ApiProperty()
  redirect: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  institution_id: string;

  @ApiProperty()
  agreement: string;

  @ApiProperty()
  reference: string;

  @ApiProperty()
  accounts: string[];

  @ApiProperty()
  user_language: string;

  @ApiProperty()
  link: string;

  @ApiProperty()
  ssn: string;

  @ApiProperty()
  account_selection: boolean;

  @ApiProperty()
  redirect_immediate: boolean;
}

export class TransactionAmountDto {
  @ApiProperty()
  currency: string;

  @ApiProperty()
  amount: string;
}

export class DebtorAccountDto {
  @ApiProperty()
  iban: string;
}

export class TransactionDto {
  @ApiProperty()
  transactionId: string;

  @ApiProperty({ required: false })
  debtorName?: string;

  @ApiProperty({ required: false })
  debtorAccount?: DebtorAccountDto;

  @ApiProperty({ required: false })
  creditorName?: string;

  @ApiProperty()
  transactionAmount: TransactionAmountDto;

  @ApiProperty()
  bookingDate: string;

  @ApiProperty()
  valueDate: string;

  @ApiProperty({ required: false })
  remittanceInformationUnstructured?: string;

  @ApiProperty({ required: false })
  remittanceInformationStructured?: string;

  @ApiProperty({ required: false })
  remittanceInformationUnstructuredArray?: string[];

  @ApiProperty({ required: false })
  additionalInformation?: string;

  @ApiProperty({ required: false })
  endToEndId?: string;

  @ApiProperty({ required: false })
  merchantCategoryCode?: string;

  @ApiProperty({ required: false })
  bankTransactionCode?: string;

  @ApiProperty({ required: false })
  proprietaryBankTransactionCode?: string;

  @ApiProperty({ required: false })
  creditorAccount?: DebtorAccountDto;

  @ApiProperty({ required: false })
  purposeCode?: string;

  @ApiProperty({ required: false })
  mandateId?: string;

  @ApiProperty({ required: false })
  entryReference?: string;
}

export class TransactionsResponseDto {
  @ApiProperty()
  transactions: {
    booked: TransactionDto[];
    pending: TransactionDto[];
  };
}

export class AccountDetailsDto {
  @ApiProperty()
  resourceId: string;

  @ApiProperty()
  iban: string;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  ownerName: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  product: string;

  @ApiProperty()
  cashAccountType: string;
}

export class BalanceDto {
  @ApiProperty()
  balanceAmount: TransactionAmountDto;

  @ApiProperty()
  balanceType: string;

  @ApiProperty()
  referenceDate: string;
}

export class AccountBalancesDto {
  @ApiProperty()
  balances: BalanceDto[];
}
