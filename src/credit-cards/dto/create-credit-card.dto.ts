import { IsString, IsNumber, IsInt, Min, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCreditCardDto {
  @ApiProperty({ description: 'Name of the credit card' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Credit limit of the card' })
  @IsNumber()
  @Min(0)
  creditLimit: number;

  @ApiProperty({ description: 'Available credit on the card' })
  @IsNumber()
  availableCredit: number;

  @ApiProperty({ description: 'Current balance on the card' })
  @IsNumber()
  currentBalance: number;

  @ApiProperty({ description: 'Billing day of the month' })
  @IsInt()
  @Min(1)
  billingDay: number;

  @ApiProperty({ description: 'Interest rate of the card' })
  @IsNumber()
  interestRate: number;

  @ApiProperty({
    description: 'ID of the associated bank account',
    required: false,
  })
  @IsOptional()
  @IsInt()
  bankAccountId?: number;

  @ApiProperty({
    description: 'GoCardless account ID for integration',
    required: false,
  })
  @IsOptional()
  @IsString()
  gocardlessAccountId?: string;
}
