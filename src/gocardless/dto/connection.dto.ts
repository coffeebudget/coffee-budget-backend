import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional } from 'class-validator';
import { GocardlessConnectionStatus } from '../entities/gocardless-connection.entity';

/**
 * DTO for completing a GoCardless connection after OAuth callback
 * This creates a GocardlessConnection record for tracking expiration
 */
export class CompleteConnectionDto {
  @ApiProperty({
    description: 'GoCardless requisition ID from OAuth callback',
    example: 'REQUISITION_ABC123',
  })
  @IsString()
  requisitionId: string;

  @ApiProperty({
    description: 'GoCardless institution ID',
    example: 'SANDBOXFINANCE_SFIN0000',
  })
  @IsString()
  institutionId: string;

  @ApiProperty({
    description: 'Array of GoCardless account IDs that were authorized',
    example: ['account-uuid-1', 'account-uuid-2'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  linkedAccountIds: string[];

  @ApiProperty({
    description: 'Optional institution name for display',
    required: false,
  })
  @IsOptional()
  @IsString()
  institutionName?: string;

  @ApiProperty({
    description: 'Optional institution logo URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  institutionLogo?: string;
}

export class ConnectionAlertDto {
  @ApiProperty({ description: 'Connection ID' })
  connectionId: number;

  @ApiProperty({ description: 'Name of the financial institution' })
  institutionName: string;

  @ApiProperty({
    enum: GocardlessConnectionStatus,
    description: 'Current connection status',
  })
  status: GocardlessConnectionStatus;

  @ApiProperty({ description: 'When the connection expires' })
  expiresAt: Date;

  @ApiProperty({
    description: 'Days until expiration (negative if already expired)',
  })
  daysUntilExpiration: number;

  @ApiProperty({
    type: [String],
    description: 'GoCardless account IDs linked to this connection',
  })
  linkedAccountIds: string[];
}

export class ConnectionStatusSummaryDto {
  @ApiProperty({ description: 'Total number of connections' })
  totalConnections: number;

  @ApiProperty({ description: 'Number of active connections' })
  activeConnections: number;

  @ApiProperty({
    description: 'Number of connections expiring within 14 days',
  })
  expiringSoonConnections: number;

  @ApiProperty({ description: 'Number of expired connections' })
  expiredConnections: number;

  @ApiProperty({ description: 'Number of connections with errors' })
  errorConnections: number;

  @ApiProperty({
    type: [ConnectionAlertDto],
    description: 'Alerts for expiring or expired connections',
  })
  alerts: ConnectionAlertDto[];
}

export class GocardlessConnectionDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  userId: number;

  @ApiProperty()
  requisitionId: string;

  @ApiProperty({ nullable: true })
  euaId: string | null;

  @ApiProperty()
  institutionId: string;

  @ApiProperty({ nullable: true })
  institutionName: string | null;

  @ApiProperty({ nullable: true })
  institutionLogo: string | null;

  @ApiProperty({ enum: GocardlessConnectionStatus })
  status: GocardlessConnectionStatus;

  @ApiProperty()
  connectedAt: Date;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty()
  accessValidForDays: number;

  @ApiProperty({ nullable: true })
  lastSyncAt: Date | null;

  @ApiProperty({ nullable: true })
  lastSyncError: string | null;

  @ApiProperty({ type: [String] })
  linkedAccountIds: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
