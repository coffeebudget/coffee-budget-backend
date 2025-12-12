import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentAccountDto {
  @ApiProperty({
    description: 'Payment service provider identifier',
    example: 'paypal',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  provider: string;

  @ApiPropertyOptional({
    description: 'User-friendly display name for the payment account',
    example: 'My PayPal Business Account',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Provider-specific configuration as JSON object',
    example: {
      email: 'business@example.com',
      currency: 'EUR',
      accountType: 'business',
    },
  })
  @IsOptional()
  @IsObject()
  providerConfig?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'ID of the bank account where funds are settled',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  linkedBankAccountId?: number;

  @ApiPropertyOptional({
    description: 'Whether the payment account is active',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
