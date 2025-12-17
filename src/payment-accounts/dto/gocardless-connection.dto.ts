import { IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for initiating a GoCardless connection for a payment account
 */
export class GocardlessConnectionRequestDto {
  @ApiProperty({
    description: 'Payment account ID to connect to GoCardless',
    example: 1,
  })
  @IsNumber()
  paymentAccountId: number;

  @ApiProperty({
    description: 'GoCardless institution ID (e.g., PAYPAL_PSEUDE, KLARNA)',
    example: 'PAYPAL_PSEUDE',
  })
  @IsString()
  institutionId: string;

  @ApiProperty({
    description: 'Redirect URL after OAuth completion',
    example: 'http://localhost:3000/payment-accounts/gocardless-callback',
  })
  @IsString()
  redirectUrl: string;
}

/**
 * DTO for completing a GoCardless connection after OAuth callback
 */
export class GocardlessCallbackDto {
  @ApiProperty({
    description: 'Payment account ID that was connected',
    example: 1,
  })
  @IsNumber()
  paymentAccountId: number;

  @ApiProperty({
    description: 'GoCardless requisition ID from OAuth callback',
    example: 'req_abc123xyz789',
  })
  @IsString()
  requisitionId: string;
}
