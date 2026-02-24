import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, Between, LessThan, In } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import {
  GocardlessConnectionService,
  CreateConnectionData,
} from './gocardless-connection.service';
import {
  GocardlessConnection,
  GocardlessConnectionStatus,
} from './entities/gocardless-connection.entity';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';

describe('GocardlessConnectionService', () => {
  let service: GocardlessConnectionService;
  let repository: Repository<GocardlessConnection>;
  let module: TestingModule;

  const mockConnection: GocardlessConnection = {
    id: 1,
    userId: 1,
    user: null as any,
    requisitionId: 'req-123',
    euaId: 'eua-123',
    institutionId: 'FINECO_IT',
    institutionName: 'Fineco Bank',
    institutionLogo: 'https://example.com/logo.png',
    status: GocardlessConnectionStatus.ACTIVE,
    connectedAt: new Date('2024-01-01'),
    expiresAt: new Date('2024-04-01'),
    accessValidForDays: 90,
    lastSyncAt: null,
    lastSyncError: null,
    linkedAccountIds: ['acc-123', 'acc-456'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        GocardlessConnectionService,
        RepositoryMockFactory.createRepositoryProvider(GocardlessConnection),
      ],
    }).compile();

    service = module.get<GocardlessConnectionService>(
      GocardlessConnectionService,
    );
    repository = module.get(getRepositoryToken(GocardlessConnection));
  });

  afterEach(async () => {
    await module.close();
  });

  describe('createConnection', () => {
    it('should create a new connection with correct expiration date', async () => {
      const createData: CreateConnectionData = {
        userId: 1,
        requisitionId: 'req-123',
        euaId: 'eua-123',
        institutionId: 'FINECO_IT',
        institutionName: 'Fineco Bank',
        institutionLogo: 'https://example.com/logo.png',
        connectedAt: new Date('2024-01-01'),
        accessValidForDays: 90,
        linkedAccountIds: ['acc-123'],
      };

      (repository.create as jest.Mock).mockReturnValue(mockConnection);
      (repository.save as jest.Mock).mockResolvedValue(mockConnection);

      const result = await service.createConnection(createData);

      expect(result).toEqual(mockConnection);
      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('calculateStatus', () => {
    it('should return ACTIVE for connections expiring in more than 14 days', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const status = service.calculateStatus(futureDate);

      expect(status).toBe(GocardlessConnectionStatus.ACTIVE);
    });

    it('should return EXPIRING_SOON for connections expiring within 14 days', () => {
      const nearFutureDate = new Date();
      nearFutureDate.setDate(nearFutureDate.getDate() + 7);

      const status = service.calculateStatus(nearFutureDate);

      expect(status).toBe(GocardlessConnectionStatus.EXPIRING_SOON);
    });

    it('should return EXPIRED for connections past expiration', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const status = service.calculateStatus(pastDate);

      expect(status).toBe(GocardlessConnectionStatus.EXPIRED);
    });

    it('should return EXPIRING_SOON for connections expiring exactly in 14 days', () => {
      const exactDate = new Date();
      exactDate.setDate(exactDate.getDate() + 14);

      const status = service.calculateStatus(exactDate);

      expect(status).toBe(GocardlessConnectionStatus.EXPIRING_SOON);
    });
  });

  describe('isExpirationError', () => {
    it('should detect EUA expired messages', () => {
      expect(service.isExpirationError('EUA has expired')).toBe(true);
      expect(service.isExpirationError('Agreement expired at...')).toBe(true);
      expect(service.isExpirationError('Access expired')).toBe(true);
      expect(service.isExpirationError('Consent expired')).toBe(true);
    });

    it('should detect 401/403 status codes', () => {
      expect(service.isExpirationError('Error 401 unauthorized')).toBe(true);
      expect(service.isExpirationError('403 Forbidden')).toBe(true);
    });

    it('should not detect regular errors as expiration', () => {
      expect(service.isExpirationError('Network timeout')).toBe(false);
      expect(service.isExpirationError('Server error')).toBe(false);
      expect(service.isExpirationError('Invalid request')).toBe(false);
    });
  });

  describe('getConnectionStatusSummary', () => {
    it('should return correct counts and alerts', async () => {
      const activeConnection = {
        ...mockConnection,
        id: 1,
        status: GocardlessConnectionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        linkedAccountIds: ['acc-active-1'], // Different accounts to avoid masking alerts
      };

      const expiringConnection = {
        ...mockConnection,
        id: 2,
        status: GocardlessConnectionStatus.EXPIRING_SOON,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        linkedAccountIds: ['acc-expiring-1'], // Different accounts
      };

      const expiredConnection = {
        ...mockConnection,
        id: 3,
        status: GocardlessConnectionStatus.EXPIRED,
        expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        linkedAccountIds: ['acc-expired-1'], // Different accounts
      };

      (repository.find as jest.Mock).mockResolvedValue([
        activeConnection,
        expiringConnection,
        expiredConnection,
      ]);
      (repository.update as jest.Mock).mockResolvedValue({ affected: 1 });

      const result = await service.getConnectionStatusSummary(1);

      expect(result.totalConnections).toBe(3);
      expect(result.activeConnections).toBe(1);
      expect(result.expiringSoonConnections).toBe(1);
      expect(result.expiredConnections).toBe(1);
      expect(result.alerts.length).toBe(2); // expiring + expired
    });

    it('should sort alerts by urgency (most urgent first)', async () => {
      const expiredConnection = {
        ...mockConnection,
        id: 1,
        status: GocardlessConnectionStatus.EXPIRED,
        expiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      };

      const expiringConnection = {
        ...mockConnection,
        id: 2,
        status: GocardlessConnectionStatus.EXPIRING_SOON,
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      };

      (repository.find as jest.Mock).mockResolvedValue([
        expiringConnection,
        expiredConnection,
      ]);
      (repository.update as jest.Mock).mockResolvedValue({ affected: 1 });

      const result = await service.getConnectionStatusSummary(1);

      expect(result.alerts[0].connectionId).toBe(1); // Expired should be first (most urgent)
      expect(result.alerts[1].connectionId).toBe(2);
    });
  });

  describe('updateExpirationStatuses', () => {
    it('should update ACTIVE to EXPIRING_SOON when within 14 days', async () => {
      (repository.update as jest.Mock)
        .mockResolvedValueOnce({ affected: 2 }) // expiring soon
        .mockResolvedValueOnce({ affected: 0 }); // expired

      const result = await service.updateExpirationStatuses();

      expect(result).toBe(2);
      expect(repository.update).toHaveBeenCalledTimes(2);
    });

    it('should update to EXPIRED when past date', async () => {
      (repository.update as jest.Mock)
        .mockResolvedValueOnce({ affected: 0 }) // expiring soon
        .mockResolvedValueOnce({ affected: 3 }); // expired

      const result = await service.updateExpirationStatuses();

      expect(result).toBe(3);
    });
  });

  describe('findByAccountId', () => {
    it('should find connection by linked account ID', async () => {
      (repository.find as jest.Mock).mockResolvedValue([mockConnection]);

      const result = await service.findByAccountId('acc-123');

      expect(result).toEqual(mockConnection);
      expect(repository.find).toHaveBeenCalledWith({ where: {} });
    });

    it('should filter by userId when provided', async () => {
      (repository.find as jest.Mock).mockResolvedValue([mockConnection]);

      const result = await service.findByAccountId('acc-123', 1);

      expect(result).toEqual(mockConnection);
      expect(repository.find).toHaveBeenCalledWith({ where: { userId: 1 } });
    });

    it('should return null if no connection found', async () => {
      (repository.find as jest.Mock).mockResolvedValue([mockConnection]);

      const result = await service.findByAccountId('non-existent');

      expect(result).toBeNull();
    });

    it('should return null when no connections exist', async () => {
      (repository.find as jest.Mock).mockResolvedValue([]);

      const result = await service.findByAccountId('acc-123');

      expect(result).toBeNull();
    });
  });

  describe('disconnectConnection', () => {
    it('should mark connection as disconnected', async () => {
      (repository.findOne as jest.Mock).mockResolvedValue(mockConnection);
      (repository.update as jest.Mock).mockResolvedValue({ affected: 1 });

      await service.disconnectConnection(1, 1);

      expect(repository.update).toHaveBeenCalledWith(1, {
        status: GocardlessConnectionStatus.DISCONNECTED,
      });
    });

    it('should throw NotFoundException if connection not found', async () => {
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.disconnectConnection(999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateConnectionAfterSync', () => {
    it('should update lastSyncAt on success', async () => {
      (repository.update as jest.Mock).mockResolvedValue({ affected: 1 });

      await service.updateConnectionAfterSync(1, true);

      expect(repository.update).toHaveBeenCalledWith(1, {
        lastSyncAt: expect.any(Date),
        lastSyncError: null,
      });
    });

    it('should set status to EXPIRED on expiration error', async () => {
      (repository.update as jest.Mock).mockResolvedValue({ affected: 1 });

      await service.updateConnectionAfterSync(1, false, 'EUA has expired');

      expect(repository.update).toHaveBeenCalledWith(1, {
        lastSyncAt: expect.any(Date),
        lastSyncError: 'EUA has expired',
        status: GocardlessConnectionStatus.EXPIRED,
      });
    });

    it('should set status to ERROR on non-expiration error', async () => {
      (repository.update as jest.Mock).mockResolvedValue({ affected: 1 });

      await service.updateConnectionAfterSync(1, false, 'Network timeout');

      expect(repository.update).toHaveBeenCalledWith(1, {
        lastSyncAt: expect.any(Date),
        lastSyncError: 'Network timeout',
        status: GocardlessConnectionStatus.ERROR,
      });
    });
  });

  describe('getUserConnections', () => {
    it('should return all connections for a user sorted by expiration', async () => {
      (repository.find as jest.Mock).mockResolvedValue([
        mockConnection,
        { ...mockConnection, id: 2 },
      ]);

      const result = await service.getUserConnections(1);

      expect(result).toHaveLength(2);
      expect(repository.find).toHaveBeenCalledWith({
        where: { userId: 1 },
        order: { expiresAt: 'ASC' },
      });
    });
  });
});
