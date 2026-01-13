import { ApiProperty } from '@nestjs/swagger';
import { GocardlessConnectionStatus } from '../entities/gocardless-connection.entity';

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
