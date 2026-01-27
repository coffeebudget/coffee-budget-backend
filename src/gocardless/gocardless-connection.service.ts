import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Between, In } from 'typeorm';
import {
  GocardlessConnection,
  GocardlessConnectionStatus,
} from './entities/gocardless-connection.entity';

export interface ConnectionAlert {
  connectionId: number;
  institutionName: string;
  status: GocardlessConnectionStatus;
  expiresAt: Date;
  daysUntilExpiration: number;
  linkedAccountIds: string[];
}

export interface ConnectionStatusSummary {
  totalConnections: number;
  activeConnections: number;
  expiringSoonConnections: number;
  expiredConnections: number;
  errorConnections: number;
  alerts: ConnectionAlert[];
}

export interface CreateConnectionData {
  userId: number;
  requisitionId: string;
  euaId: string | null;
  institutionId: string;
  institutionName: string | null;
  institutionLogo: string | null;
  connectedAt: Date;
  accessValidForDays: number;
  linkedAccountIds: string[];
}

@Injectable()
export class GocardlessConnectionService {
  private readonly logger = new Logger(GocardlessConnectionService.name);
  private readonly EXPIRATION_WARNING_DAYS = 14;

  constructor(
    @InjectRepository(GocardlessConnection)
    private readonly connectionRepository: Repository<GocardlessConnection>,
  ) {}

  /**
   * Create a new connection record when user completes bank linking
   */
  async createConnection(
    data: CreateConnectionData,
  ): Promise<GocardlessConnection> {
    const expiresAt = this.addDays(data.connectedAt, data.accessValidForDays);

    const connection = this.connectionRepository.create({
      ...data,
      expiresAt,
      status: this.calculateStatus(expiresAt),
      lastSyncAt: null,
      lastSyncError: null,
    });

    const saved = await this.connectionRepository.save(connection);
    this.logger.log(
      `Created GoCardless connection ${saved.id} for user ${data.userId}, expires at ${expiresAt.toISOString()}`,
    );
    return saved;
  }

  /**
   * Update connection after sync attempt
   */
  async updateConnectionAfterSync(
    connectionId: number,
    success: boolean,
    error?: string,
  ): Promise<void> {
    const update: Partial<GocardlessConnection> = {
      lastSyncAt: new Date(),
      lastSyncError: error || null,
    };

    if (!success && error) {
      // Check if error indicates expired EUA
      if (this.isExpirationError(error)) {
        update.status = GocardlessConnectionStatus.EXPIRED;
      } else {
        update.status = GocardlessConnectionStatus.ERROR;
      }
    }

    await this.connectionRepository.update(connectionId, update);
  }

  /**
   * Get connection status summary with alerts for a user
   */
  async getConnectionStatusSummary(
    userId: number,
  ): Promise<ConnectionStatusSummary> {
    const connections = await this.connectionRepository.find({
      where: { userId },
      order: { connectedAt: 'DESC' }, // Most recent first
    });

    // Update status for each connection based on current date
    for (const conn of connections) {
      const newStatus = this.calculateStatus(conn.expiresAt);

      // Update status if changed (except for manually disconnected)
      if (
        conn.status !== newStatus &&
        conn.status !== GocardlessConnectionStatus.DISCONNECTED
      ) {
        await this.connectionRepository.update(conn.id, { status: newStatus });
        conn.status = newStatus;
      }
    }

    // Build a map of accountId -> most recent connection status
    // This ensures we only alert for accounts that don't have an active newer connection
    const accountToActiveConnection = new Map<string, number>();

    // First pass: find accounts with active connections
    for (const conn of connections) {
      if (conn.status === GocardlessConnectionStatus.ACTIVE) {
        for (const accountId of conn.linkedAccountIds) {
          // Only set if not already set (first = most recent due to ordering)
          if (!accountToActiveConnection.has(accountId)) {
            accountToActiveConnection.set(accountId, conn.id);
          }
        }
      }
    }

    // Generate alerts only for connections where accounts don't have a newer active connection
    const alerts: ConnectionAlert[] = [];

    for (const conn of connections) {
      if (
        conn.status === GocardlessConnectionStatus.EXPIRING_SOON ||
        conn.status === GocardlessConnectionStatus.EXPIRED
      ) {
        // Filter out accounts that have been reconnected (have active connection)
        const accountsNeedingAlert = conn.linkedAccountIds.filter(
          (accountId) => !accountToActiveConnection.has(accountId),
        );

        // Only add alert if there are accounts that still need attention
        if (accountsNeedingAlert.length > 0) {
          const daysUntilExpiration = this.getDaysUntilExpiration(
            conn.expiresAt,
          );

          alerts.push({
            connectionId: conn.id,
            institutionName: conn.institutionName || conn.institutionId,
            status: conn.status,
            expiresAt: conn.expiresAt,
            daysUntilExpiration,
            linkedAccountIds: accountsNeedingAlert, // Only accounts that need attention
          });
        }
      }
    }

    // Sort alerts by days until expiration (most urgent first)
    alerts.sort((a, b) => a.daysUntilExpiration - b.daysUntilExpiration);

    return {
      totalConnections: connections.length,
      activeConnections: connections.filter(
        (c) => c.status === GocardlessConnectionStatus.ACTIVE,
      ).length,
      expiringSoonConnections: connections.filter(
        (c) => c.status === GocardlessConnectionStatus.EXPIRING_SOON,
      ).length,
      expiredConnections: connections.filter(
        (c) => c.status === GocardlessConnectionStatus.EXPIRED,
      ).length,
      errorConnections: connections.filter(
        (c) => c.status === GocardlessConnectionStatus.ERROR,
      ).length,
      alerts,
    };
  }

  /**
   * Get all connections that need status updates (for daily cron)
   * Updates statuses based on current date without making API calls
   */
  async updateExpirationStatuses(): Promise<number> {
    const now = new Date();
    const warningDate = this.addDays(now, this.EXPIRATION_WARNING_DAYS);

    // Update connections that should be marked as expiring soon
    const expiringSoonResult = await this.connectionRepository.update(
      {
        status: GocardlessConnectionStatus.ACTIVE,
        expiresAt: Between(now, warningDate),
      },
      { status: GocardlessConnectionStatus.EXPIRING_SOON },
    );

    // Update connections that have expired
    const expiredResult = await this.connectionRepository.update(
      {
        status: In([
          GocardlessConnectionStatus.ACTIVE,
          GocardlessConnectionStatus.EXPIRING_SOON,
        ]),
        expiresAt: LessThan(now),
      },
      { status: GocardlessConnectionStatus.EXPIRED },
    );

    const totalUpdated =
      (expiringSoonResult.affected || 0) + (expiredResult.affected || 0);

    if (totalUpdated > 0) {
      this.logger.log(
        `Updated ${totalUpdated} connection statuses (${expiringSoonResult.affected} expiring soon, ${expiredResult.affected} expired)`,
      );
    }

    return totalUpdated;
  }

  /**
   * Find connection by gocardlessAccountId
   */
  async findByAccountId(
    gocardlessAccountId: string,
  ): Promise<GocardlessConnection | null> {
    // Query using JSONB contains operator
    const connection = await this.connectionRepository
      .createQueryBuilder('conn')
      .where(`conn."linkedAccountIds" @> :accountId::jsonb`, {
        accountId: JSON.stringify([gocardlessAccountId]),
      })
      .getOne();

    return connection;
  }

  /**
   * Find connection by requisitionId
   */
  async findByRequisitionId(
    requisitionId: string,
  ): Promise<GocardlessConnection | null> {
    return this.connectionRepository.findOne({
      where: { requisitionId },
    });
  }

  /**
   * Get all connections for a user
   */
  async getUserConnections(userId: number): Promise<GocardlessConnection[]> {
    return this.connectionRepository.find({
      where: { userId },
      order: { expiresAt: 'ASC' },
    });
  }

  /**
   * Mark connection as disconnected (user removed or revoked)
   */
  async disconnectConnection(
    connectionId: number,
    userId: number,
  ): Promise<void> {
    const connection = await this.connectionRepository.findOne({
      where: { id: connectionId, userId },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    await this.connectionRepository.update(connectionId, {
      status: GocardlessConnectionStatus.DISCONNECTED,
    });

    this.logger.log(
      `Disconnected GoCardless connection ${connectionId} for user ${userId}`,
    );
  }

  /**
   * Add linked account IDs to an existing connection
   */
  async addLinkedAccountIds(
    connectionId: number,
    accountIds: string[],
  ): Promise<void> {
    const connection = await this.connectionRepository.findOne({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    const existingIds = new Set(connection.linkedAccountIds);
    accountIds.forEach((id) => existingIds.add(id));

    await this.connectionRepository.update(connectionId, {
      linkedAccountIds: Array.from(existingIds),
    });
  }

  /**
   * Calculate connection status based on expiration date
   */
  calculateStatus(expiresAt: Date): GocardlessConnectionStatus {
    const now = new Date();
    const warningDate = this.addDays(now, this.EXPIRATION_WARNING_DAYS);

    if (expiresAt < now) {
      return GocardlessConnectionStatus.EXPIRED;
    } else if (expiresAt <= warningDate) {
      return GocardlessConnectionStatus.EXPIRING_SOON;
    } else {
      return GocardlessConnectionStatus.ACTIVE;
    }
  }

  /**
   * Check if an error message indicates EUA expiration
   */
  isExpirationError(error: string): boolean {
    const expirationPatterns = [
      'access expired',
      'agreement expired',
      'eua expired',
      'eua_expired',
      'consent expired',
      'has expired',
      '401',
      '403',
    ];

    const lowerError = error.toLowerCase();
    return expirationPatterns.some((pattern) => lowerError.includes(pattern));
  }

  /**
   * Get days until expiration (negative if already expired)
   */
  private getDaysUntilExpiration(expiresAt: Date): number {
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Add days to a date
   */
  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
