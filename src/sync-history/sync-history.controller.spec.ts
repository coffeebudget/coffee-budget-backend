import { Test, TestingModule } from '@nestjs/testing';
import { SyncHistoryController } from './sync-history.controller';
import { SyncHistoryService } from './sync-history.service';
import { SyncStatus } from './entities/sync-report.entity';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('SyncHistoryController', () => {
  let controller: SyncHistoryController;
  let service: SyncHistoryService;

  const mockUser = {
    id: 1,
    auth0Id: 'auth0|123456',
    email: 'test@example.com',
  };

  const mockSyncReports = [
    {
      id: 1,
      status: SyncStatus.SUCCESS,
      syncStartedAt: new Date('2025-11-11T09:00:00Z'),
      syncCompletedAt: new Date('2025-11-11T09:15:00Z'),
      totalAccounts: 3,
      successfulAccounts: 3,
      failedAccounts: 0,
      totalNewTransactions: 45,
      totalDuplicates: 15,
      totalPendingDuplicates: 3,
      syncType: 'automatic',
      errorMessage: null,
    },
    {
      id: 2,
      status: SyncStatus.PARTIAL,
      syncStartedAt: new Date('2025-11-10T09:00:00Z'),
      syncCompletedAt: new Date('2025-11-10T09:15:00Z'),
      totalAccounts: 3,
      successfulAccounts: 2,
      failedAccounts: 1,
      totalNewTransactions: 30,
      totalDuplicates: 10,
      totalPendingDuplicates: 2,
      syncType: 'automatic',
      errorMessage: null,
    },
  ];

  const mockPaginatedResponse = {
    data: mockSyncReports,
    total: 50,
    page: 1,
    limit: 10,
    totalPages: 5,
  };

  const mockStatistics = {
    totalSyncs: 30,
    successfulSyncs: 28,
    failedSyncs: 1,
    successRate: 93.33,
    totalNewTransactions: 450,
    totalDuplicates: 120,
    averageTransactionsPerSync: 15,
  };

  const mockDetailedSyncReport = {
    ...mockSyncReports[0],
    accountResults: [
      {
        accountId: 'acc123',
        accountName: 'Fineco',
        accountType: 'bank_account',
        success: true,
        newTransactions: 15,
        duplicates: 5,
        pendingDuplicates: 1,
      },
    ],
    importLogs: [
      {
        id: 1,
        status: 'completed',
        totalRecords: 15,
        successfulRecords: 15,
        failedRecords: 0,
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncHistoryController],
      providers: [
        {
          provide: SyncHistoryService,
          useValue: {
            getUserSyncHistory: jest.fn(),
            getSyncStatistics: jest.fn(),
            getSyncReportById: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SyncHistoryController>(SyncHistoryController);
    service = module.get<SyncHistoryService>(SyncHistoryService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /sync-history', () => {
    it('should return paginated sync history for authenticated user', async () => {
      // Arrange
      (service.getUserSyncHistory as jest.Mock).mockResolvedValue(
        mockPaginatedResponse,
      );

      // Act
      const result = await controller.getSyncHistory(mockUser, 1, 10);

      // Assert
      expect(result).toEqual(mockPaginatedResponse);
      expect(service.getUserSyncHistory).toHaveBeenCalledWith(1, {
        page: 1,
        limit: 10,
      });
    });

    it('should handle pagination with custom page and limit', async () => {
      // Arrange
      const customResponse = {
        ...mockPaginatedResponse,
        page: 2,
        limit: 20,
      };
      (service.getUserSyncHistory as jest.Mock).mockResolvedValue(
        customResponse,
      );

      // Act
      const result = await controller.getSyncHistory(mockUser, 2, 20);

      // Assert
      expect(result).toEqual(customResponse);
      expect(service.getUserSyncHistory).toHaveBeenCalledWith(1, {
        page: 2,
        limit: 20,
      });
    });

    it('should filter by status when provided', async () => {
      // Arrange
      (service.getUserSyncHistory as jest.Mock).mockResolvedValue(
        mockPaginatedResponse,
      );

      // Act
      const result = await controller.getSyncHistory(
        mockUser,
        1,
        10,
        SyncStatus.SUCCESS,
      );

      // Assert
      expect(result).toEqual(mockPaginatedResponse);
      expect(service.getUserSyncHistory).toHaveBeenCalledWith(1, {
        page: 1,
        limit: 10,
        status: SyncStatus.SUCCESS,
      });
    });

    it('should use default values when page and limit not provided', async () => {
      // Arrange
      (service.getUserSyncHistory as jest.Mock).mockResolvedValue(
        mockPaginatedResponse,
      );

      // Act
      const result = await controller.getSyncHistory(mockUser);

      // Assert
      expect(result).toEqual(mockPaginatedResponse);
      expect(service.getUserSyncHistory).toHaveBeenCalledWith(1, {
        page: 1,
        limit: 10,
      });
    });
  });

  describe('GET /sync-history/statistics', () => {
    it('should return sync statistics for authenticated user', async () => {
      // Arrange
      (service.getSyncStatistics as jest.Mock).mockResolvedValue(
        mockStatistics,
      );

      // Act
      const result = await controller.getSyncStatistics(mockUser);

      // Assert
      expect(result).toEqual(mockStatistics);
      expect(service.getSyncStatistics).toHaveBeenCalledWith(1, 30, undefined);
    });

    it('should use custom days parameter when provided', async () => {
      // Arrange
      (service.getSyncStatistics as jest.Mock).mockResolvedValue(
        mockStatistics,
      );

      // Act
      const result = await controller.getSyncStatistics(mockUser, 7);

      // Assert
      expect(result).toEqual(mockStatistics);
      expect(service.getSyncStatistics).toHaveBeenCalledWith(1, 7, undefined);
    });

    it('should use default 30 days when not provided', async () => {
      // Arrange
      (service.getSyncStatistics as jest.Mock).mockResolvedValue(
        mockStatistics,
      );

      // Act
      const result = await controller.getSyncStatistics(mockUser);

      // Assert
      expect(result).toEqual(mockStatistics);
      expect(service.getSyncStatistics).toHaveBeenCalledWith(1, 30, undefined);
    });
  });

  describe('GET /sync-history/:id', () => {
    it('should return sync report by id for authenticated user', async () => {
      // Arrange
      (service.getSyncReportById as jest.Mock).mockResolvedValue(
        mockDetailedSyncReport,
      );

      // Act
      const result = await controller.getSyncReportById(mockUser, 1);

      // Assert
      expect(result).toEqual(mockDetailedSyncReport);
      expect(service.getSyncReportById).toHaveBeenCalledWith(1, 1);
    });

    it('should throw NotFoundException when sync report not found', async () => {
      // Arrange
      (service.getSyncReportById as jest.Mock).mockRejectedValue(
        new NotFoundException('Sync report not found'),
      );

      // Act & Assert
      await expect(controller.getSyncReportById(mockUser, 999)).rejects.toThrow(
        NotFoundException,
      );
      expect(service.getSyncReportById).toHaveBeenCalledWith(999, 1);
    });

    it('should throw ForbiddenException when user does not own sync report', async () => {
      // Arrange
      (service.getSyncReportById as jest.Mock).mockRejectedValue(
        new ForbiddenException('Access denied'),
      );

      // Act & Assert
      await expect(controller.getSyncReportById(mockUser, 1)).rejects.toThrow(
        ForbiddenException,
      );
      expect(service.getSyncReportById).toHaveBeenCalledWith(1, 1);
    });
  });
});
