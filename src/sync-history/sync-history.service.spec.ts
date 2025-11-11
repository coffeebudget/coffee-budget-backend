import { Test, TestingModule } from '@nestjs/testing';
import { Repository, In } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SyncHistoryService } from './sync-history.service';
import { SyncReport, SyncStatus } from './entities/sync-report.entity';
import { User } from '../users/user.entity';
import { ImportLog, ImportStatus } from '../transactions/entities/import-log.entity';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';

describe('SyncHistoryService', () => {
  let service: SyncHistoryService;
  let syncReportRepository: Repository<SyncReport>;
  let importLogRepository: Repository<ImportLog>;
  let userRepository: Repository<User>;
  let module: TestingModule;

  const mockUser: User = {
    id: 1,
    auth0Id: 'auth0|123456',
    email: 'test@example.com',
    isDemoUser: false,
    demoExpiryDate: new Date('2024-12-31'),
    demoActivatedAt: new Date('2024-01-01'),
    bankAccounts: [],
    creditCards: [],
    transactions: [],
    tags: [],
    categories: [],
    recurringTransactions: [],
  };

  const mockImportLogs: ImportLog[] = [
    {
      id: 1,
      user: mockUser,
      status: ImportStatus.COMPLETED,
      source: 'gocardless',
      format: 'gocardless_api',
      fileName: 'GoCardless Account abc123',
      totalRecords: 20,
      processedRecords: 20,
      successfulRecords: 15,
      failedRecords: 0,
      summary: 'Imported 15 transactions, skipped 5 duplicates',
      logs: 'Started import...',
      metadata: { accountId: 'abc123' },
      startTime: new Date('2025-11-11T09:00:00Z'),
      endTime: new Date('2025-11-11T09:05:00Z'),
      createdAt: new Date('2025-11-11T09:00:00Z'),
      updatedAt: new Date('2025-11-11T09:05:00Z'),
    },
    {
      id: 2,
      user: mockUser,
      status: ImportStatus.COMPLETED,
      source: 'gocardless',
      format: 'gocardless_api',
      fileName: 'GoCardless Account def456',
      totalRecords: 30,
      processedRecords: 30,
      successfulRecords: 20,
      failedRecords: 0,
      summary: 'Imported 20 transactions, skipped 10 duplicates',
      logs: 'Started import...',
      metadata: { accountId: 'def456' },
      startTime: new Date('2025-11-11T09:05:00Z'),
      endTime: new Date('2025-11-11T09:10:00Z'),
      createdAt: new Date('2025-11-11T09:05:00Z'),
      updatedAt: new Date('2025-11-11T09:10:00Z'),
    },
    {
      id: 3,
      user: mockUser,
      status: ImportStatus.COMPLETED,
      source: 'gocardless',
      format: 'gocardless_api',
      fileName: 'GoCardless Account ghi789',
      totalRecords: 15,
      processedRecords: 15,
      successfulRecords: 10,
      failedRecords: 0,
      summary: 'Imported 10 transactions, skipped 5 duplicates',
      logs: 'Started import...',
      metadata: { accountId: 'ghi789' },
      startTime: new Date('2025-11-11T09:10:00Z'),
      endTime: new Date('2025-11-11T09:15:00Z'),
      createdAt: new Date('2025-11-11T09:10:00Z'),
      updatedAt: new Date('2025-11-11T09:15:00Z'),
    },
  ];

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        SyncHistoryService,
        RepositoryMockFactory.createRepositoryProvider(SyncReport),
        RepositoryMockFactory.createRepositoryProvider(ImportLog),
        RepositoryMockFactory.createRepositoryProvider(User),
      ],
    }).compile();

    service = module.get<SyncHistoryService>(SyncHistoryService);
    syncReportRepository = module.get(getRepositoryToken(SyncReport));
    importLogRepository = module.get(getRepositoryToken(ImportLog));
    userRepository = module.get(getRepositoryToken(User));
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSyncReport', () => {
    it('should create a sync report with success status when all accounts succeed', async () => {
      // Arrange
      const userId = 1;
      const syncStartTime = new Date('2025-11-11T09:00:00Z');
      const importResult = {
        summary: {
          totalAccounts: 3,
          successfulImports: 3,
          failedImports: 0,
          totalNewTransactions: 45,
          totalDuplicates: 20,
          totalPendingDuplicates: 5,
        },
        importResults: [
          {
            accountId: 'abc123',
            accountName: 'Fineco',
            accountType: 'bank_account',
            success: true,
            newTransactions: 15,
            duplicates: 5,
            pendingDuplicates: 2,
            importLogId: 1,
          },
          {
            accountId: 'def456',
            accountName: 'UniCredit',
            accountType: 'bank_account',
            success: true,
            newTransactions: 20,
            duplicates: 10,
            pendingDuplicates: 2,
            importLogId: 2,
          },
          {
            accountId: 'ghi789',
            accountName: 'Visa',
            accountType: 'credit_card',
            success: true,
            newTransactions: 10,
            duplicates: 5,
            pendingDuplicates: 1,
            importLogId: 3,
          },
        ],
      };

      const mockSyncReport: SyncReport = {
        id: 1,
        user: mockUser,
        status: SyncStatus.SUCCESS,
        syncStartedAt: syncStartTime,
        syncCompletedAt: new Date('2025-11-11T09:15:00Z'),
        totalAccounts: 3,
        successfulAccounts: 3,
        failedAccounts: 0,
        totalNewTransactions: 45,
        totalDuplicates: 20,
        totalPendingDuplicates: 5,
        importLogs: mockImportLogs,
        syncType: 'automatic',
        accountResults: importResult.importResults,
        errorMessage: null,
        createdAt: new Date('2025-11-11T09:15:00Z'),
        updatedAt: new Date('2025-11-11T09:15:00Z'),
      };

      (userRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (importLogRepository.find as jest.Mock).mockResolvedValue(mockImportLogs);
      (syncReportRepository.create as jest.Mock).mockReturnValue(
        mockSyncReport,
      );
      (syncReportRepository.save as jest.Mock).mockResolvedValue(
        mockSyncReport,
      );

      // Act
      const result = await service.createSyncReport(
        userId,
        importResult,
        syncStartTime,
      );

      // Assert
      expect(result).toEqual(mockSyncReport);
      expect(result.status).toBe(SyncStatus.SUCCESS);
      expect(result.totalAccounts).toBe(3);
      expect(result.successfulAccounts).toBe(3);
      expect(result.failedAccounts).toBe(0);
      expect(result.totalNewTransactions).toBe(45);
      expect(result.totalDuplicates).toBe(20);
      expect(result.totalPendingDuplicates).toBe(5);
      expect(result.syncType).toBe('automatic');
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(syncReportRepository.save).toHaveBeenCalled();
    });

    it('should create a sync report with partial status when some accounts fail', async () => {
      // Arrange
      const userId = 1;
      const syncStartTime = new Date('2025-11-11T09:00:00Z');
      const importResult = {
        summary: {
          totalAccounts: 3,
          successfulImports: 2,
          failedImports: 1,
          totalNewTransactions: 35,
          totalDuplicates: 15,
          totalPendingDuplicates: 3,
        },
        importResults: [
          {
            accountId: 'abc123',
            accountName: 'Fineco',
            accountType: 'bank_account',
            success: true,
            newTransactions: 15,
            duplicates: 5,
            pendingDuplicates: 2,
            importLogId: 1,
          },
          {
            accountId: 'def456',
            accountName: 'UniCredit',
            accountType: 'bank_account',
            success: true,
            newTransactions: 20,
            duplicates: 10,
            pendingDuplicates: 1,
            importLogId: 2,
          },
          {
            accountId: 'ghi789',
            accountName: 'Visa',
            accountType: 'credit_card',
            success: false,
            error: 'GoCardless API error',
            newTransactions: 0,
            duplicates: 0,
            pendingDuplicates: 0,
            importLogId: 3,
          },
        ],
      };

      const mockSyncReport: SyncReport = {
        id: 1,
        user: mockUser,
        status: SyncStatus.PARTIAL,
        syncStartedAt: syncStartTime,
        syncCompletedAt: new Date('2025-11-11T09:15:00Z'),
        totalAccounts: 3,
        successfulAccounts: 2,
        failedAccounts: 1,
        totalNewTransactions: 35,
        totalDuplicates: 15,
        totalPendingDuplicates: 3,
        importLogs: mockImportLogs,
        syncType: 'automatic',
        accountResults: importResult.importResults,
        errorMessage: null,
        createdAt: new Date('2025-11-11T09:15:00Z'),
        updatedAt: new Date('2025-11-11T09:15:00Z'),
      };

      (userRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (importLogRepository.find as jest.Mock).mockResolvedValue(mockImportLogs);
      (syncReportRepository.create as jest.Mock).mockReturnValue(
        mockSyncReport,
      );
      (syncReportRepository.save as jest.Mock).mockResolvedValue(
        mockSyncReport,
      );

      // Act
      const result = await service.createSyncReport(
        userId,
        importResult,
        syncStartTime,
      );

      // Assert
      expect(result.status).toBe(SyncStatus.PARTIAL);
      expect(result.successfulAccounts).toBe(2);
      expect(result.failedAccounts).toBe(1);
    });

    it('should create a sync report with failed status when all accounts fail', async () => {
      // Arrange
      const userId = 1;
      const syncStartTime = new Date('2025-11-11T09:00:00Z');
      const importResult = {
        summary: {
          totalAccounts: 3,
          successfulImports: 0,
          failedImports: 3,
          totalNewTransactions: 0,
          totalDuplicates: 0,
          totalPendingDuplicates: 0,
        },
        importResults: [
          {
            accountId: 'abc123',
            accountName: 'Fineco',
            accountType: 'bank_account',
            success: false,
            error: 'GoCardless API error',
            newTransactions: 0,
            duplicates: 0,
            pendingDuplicates: 0,
            importLogId: 1,
          },
          {
            accountId: 'def456',
            accountName: 'UniCredit',
            accountType: 'bank_account',
            success: false,
            error: 'Connection timeout',
            newTransactions: 0,
            duplicates: 0,
            pendingDuplicates: 0,
            importLogId: 2,
          },
          {
            accountId: 'ghi789',
            accountName: 'Visa',
            accountType: 'credit_card',
            success: false,
            error: 'Authentication failed',
            newTransactions: 0,
            duplicates: 0,
            pendingDuplicates: 0,
            importLogId: 3,
          },
        ],
      };

      const mockSyncReport: SyncReport = {
        id: 1,
        user: mockUser,
        status: SyncStatus.FAILED,
        syncStartedAt: syncStartTime,
        syncCompletedAt: new Date('2025-11-11T09:15:00Z'),
        totalAccounts: 3,
        successfulAccounts: 0,
        failedAccounts: 3,
        totalNewTransactions: 0,
        totalDuplicates: 0,
        totalPendingDuplicates: 0,
        importLogs: mockImportLogs,
        syncType: 'automatic',
        accountResults: importResult.importResults,
        errorMessage: 'All accounts failed to sync',
        createdAt: new Date('2025-11-11T09:15:00Z'),
        updatedAt: new Date('2025-11-11T09:15:00Z'),
      };

      (userRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (importLogRepository.find as jest.Mock).mockResolvedValue(mockImportLogs);
      (syncReportRepository.create as jest.Mock).mockReturnValue(
        mockSyncReport,
      );
      (syncReportRepository.save as jest.Mock).mockResolvedValue(
        mockSyncReport,
      );

      // Act
      const result = await service.createSyncReport(
        userId,
        importResult,
        syncStartTime,
      );

      // Assert
      expect(result.status).toBe(SyncStatus.FAILED);
      expect(result.successfulAccounts).toBe(0);
      expect(result.failedAccounts).toBe(3);
      expect(result.errorMessage).toBe('All accounts failed to sync');
    });

    it('should throw error when user not found', async () => {
      // Arrange
      const userId = 999;
      const syncStartTime = new Date('2025-11-11T09:00:00Z');
      const importResult = {
        summary: {
          totalAccounts: 1,
          successfulImports: 1,
          failedImports: 0,
          totalNewTransactions: 10,
          totalDuplicates: 5,
          totalPendingDuplicates: 1,
        },
        importResults: [],
      };

      (userRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.createSyncReport(userId, importResult, syncStartTime),
      ).rejects.toThrow('User not found');
    });

    it('should link ImportLogs to SyncReport', async () => {
      // Arrange
      const userId = 1;
      const syncStartTime = new Date('2025-11-11T09:00:00Z');
      const importResult = {
        summary: {
          totalAccounts: 2,
          successfulImports: 2,
          failedImports: 0,
          totalNewTransactions: 35,
          totalDuplicates: 15,
          totalPendingDuplicates: 3,
        },
        importResults: [
          {
            accountId: 'abc123',
            accountName: 'Fineco',
            accountType: 'bank_account',
            success: true,
            newTransactions: 15,
            duplicates: 5,
            pendingDuplicates: 2,
            importLogId: 1,
          },
          {
            accountId: 'def456',
            accountName: 'UniCredit',
            accountType: 'bank_account',
            success: true,
            newTransactions: 20,
            duplicates: 10,
            pendingDuplicates: 1,
            importLogId: 2,
          },
        ],
      };

      const mockSyncReport: SyncReport = {
        id: 1,
        user: mockUser,
        status: SyncStatus.SUCCESS,
        syncStartedAt: syncStartTime,
        syncCompletedAt: new Date('2025-11-11T09:15:00Z'),
        totalAccounts: 2,
        successfulAccounts: 2,
        failedAccounts: 0,
        totalNewTransactions: 35,
        totalDuplicates: 15,
        totalPendingDuplicates: 3,
        importLogs: mockImportLogs.slice(0, 2), // First 2 import logs
        syncType: 'automatic',
        accountResults: importResult.importResults,
        errorMessage: null,
        createdAt: new Date('2025-11-11T09:15:00Z'),
        updatedAt: new Date('2025-11-11T09:15:00Z'),
      };

      (userRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (importLogRepository.find as jest.Mock).mockResolvedValue(
        mockImportLogs.slice(0, 2),
      );
      (syncReportRepository.create as jest.Mock).mockReturnValue(
        mockSyncReport,
      );
      (syncReportRepository.save as jest.Mock).mockResolvedValue(
        mockSyncReport,
      );

      // Act
      const result = await service.createSyncReport(
        userId,
        importResult,
        syncStartTime,
      );

      // Assert
      expect(importLogRepository.find).toHaveBeenCalledWith({
        where: { id: In([1, 2]) },
      });
      expect(result.importLogs).toHaveLength(2);
      expect(result.importLogs).toEqual(mockImportLogs.slice(0, 2));
    });

    it('should handle empty ImportLogs array when no importLogIds provided', async () => {
      // Arrange
      const userId = 1;
      const syncStartTime = new Date('2025-11-11T09:00:00Z');
      const importResult = {
        summary: {
          totalAccounts: 1,
          successfulImports: 1,
          failedImports: 0,
          totalNewTransactions: 10,
          totalDuplicates: 5,
          totalPendingDuplicates: 1,
        },
        importResults: [
          {
            accountId: 'abc123',
            accountName: 'Fineco',
            accountType: 'bank_account',
            success: true,
            newTransactions: 10,
            duplicates: 5,
            pendingDuplicates: 1,
            importLogId: 0, // No valid importLogId
          },
        ],
      };

      const mockSyncReport: SyncReport = {
        id: 1,
        user: mockUser,
        status: SyncStatus.SUCCESS,
        syncStartedAt: syncStartTime,
        syncCompletedAt: new Date('2025-11-11T09:15:00Z'),
        totalAccounts: 1,
        successfulAccounts: 1,
        failedAccounts: 0,
        totalNewTransactions: 10,
        totalDuplicates: 5,
        totalPendingDuplicates: 1,
        importLogs: [],
        syncType: 'automatic',
        accountResults: importResult.importResults,
        errorMessage: null,
        createdAt: new Date('2025-11-11T09:15:00Z'),
        updatedAt: new Date('2025-11-11T09:15:00Z'),
      };

      (userRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (syncReportRepository.create as jest.Mock).mockReturnValue(
        mockSyncReport,
      );
      (syncReportRepository.save as jest.Mock).mockResolvedValue(
        mockSyncReport,
      );

      // Act
      const result = await service.createSyncReport(
        userId,
        importResult,
        syncStartTime,
      );

      // Assert
      expect(importLogRepository.find).not.toHaveBeenCalled();
      expect(result.importLogs).toEqual([]);
    });
  });

  describe('getUserSyncHistory', () => {
    it('should return paginated sync reports for a user', async () => {
      // Arrange
      const userId = 1;
      const page = 1;
      const limit = 10;

      const mockSyncReports: SyncReport[] = [
        {
          id: 1,
          user: mockUser,
          status: SyncStatus.SUCCESS,
          syncStartedAt: new Date('2025-11-11T09:00:00Z'),
          syncCompletedAt: new Date('2025-11-11T09:15:00Z'),
          totalAccounts: 3,
          successfulAccounts: 3,
          failedAccounts: 0,
          totalNewTransactions: 45,
          totalDuplicates: 20,
          totalPendingDuplicates: 5,
          importLogs: mockImportLogs,
          syncType: 'automatic',
          accountResults: [],
          errorMessage: null,
          createdAt: new Date('2025-11-11T09:15:00Z'),
          updatedAt: new Date('2025-11-11T09:15:00Z'),
        },
        {
          id: 2,
          user: mockUser,
          status: SyncStatus.SUCCESS,
          syncStartedAt: new Date('2025-11-10T09:00:00Z'),
          syncCompletedAt: new Date('2025-11-10T09:15:00Z'),
          totalAccounts: 3,
          successfulAccounts: 3,
          failedAccounts: 0,
          totalNewTransactions: 30,
          totalDuplicates: 15,
          totalPendingDuplicates: 3,
          importLogs: [],
          syncType: 'automatic',
          accountResults: [],
          errorMessage: null,
          createdAt: new Date('2025-11-10T09:15:00Z'),
          updatedAt: new Date('2025-11-10T09:15:00Z'),
        },
      ];

      (syncReportRepository.findAndCount as jest.Mock).mockResolvedValue([
        mockSyncReports,
        2,
      ]);

      // Act
      const result = await service.getUserSyncHistory(userId, { page, limit });

      // Assert
      expect(result).toEqual({
        data: mockSyncReports,
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(syncReportRepository.findAndCount).toHaveBeenCalledWith({
        where: { user: { id: userId } },
        order: { syncStartedAt: 'DESC' },
        skip: 0,
        take: 10,
      });
    });

    it('should return empty array when user has no sync reports', async () => {
      // Arrange
      const userId = 1;
      const page = 1;
      const limit = 10;

      (syncReportRepository.findAndCount as jest.Mock).mockResolvedValue([
        [],
        0,
      ]);

      // Act
      const result = await service.getUserSyncHistory(userId, { page, limit });

      // Assert
      expect(result).toEqual({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });
    });

    it('should handle pagination correctly', async () => {
      // Arrange
      const userId = 1;
      const page = 2;
      const limit = 5;

      (syncReportRepository.findAndCount as jest.Mock).mockResolvedValue([
        [],
        12,
      ]);

      // Act
      await service.getUserSyncHistory(userId, { page, limit });

      // Assert
      expect(syncReportRepository.findAndCount).toHaveBeenCalledWith({
        where: { user: { id: userId } },
        order: { syncStartedAt: 'DESC' },
        skip: 5,
        take: 5,
      });
    });

    it('should filter by status when provided', async () => {
      // Arrange
      const userId = 1;
      const page = 1;
      const limit = 10;
      const status = SyncStatus.FAILED;

      (syncReportRepository.findAndCount as jest.Mock).mockResolvedValue([
        [],
        0,
      ]);

      // Act
      await service.getUserSyncHistory(userId, { page, limit, status });

      // Assert
      expect(syncReportRepository.findAndCount).toHaveBeenCalledWith({
        where: { user: { id: userId }, status },
        order: { syncStartedAt: 'DESC' },
        skip: 0,
        take: 10,
      });
    });
  });

  describe('getSyncStatistics', () => {
    it('should return statistics for user sync reports', async () => {
      // Arrange
      const userId = 1;
      const days = 30;

      const mockSyncReports: SyncReport[] = [
        {
          id: 1,
          user: mockUser,
          status: SyncStatus.SUCCESS,
          syncStartedAt: new Date('2025-11-11T09:00:00Z'),
          syncCompletedAt: new Date('2025-11-11T09:15:00Z'),
          totalAccounts: 3,
          successfulAccounts: 3,
          failedAccounts: 0,
          totalNewTransactions: 45,
          totalDuplicates: 20,
          totalPendingDuplicates: 5,
          importLogs: [],
          syncType: 'automatic',
          accountResults: [],
          errorMessage: null,
          createdAt: new Date('2025-11-11T09:15:00Z'),
          updatedAt: new Date('2025-11-11T09:15:00Z'),
        },
        {
          id: 2,
          user: mockUser,
          status: SyncStatus.SUCCESS,
          syncStartedAt: new Date('2025-11-10T09:00:00Z'),
          syncCompletedAt: new Date('2025-11-10T09:15:00Z'),
          totalAccounts: 3,
          successfulAccounts: 3,
          failedAccounts: 0,
          totalNewTransactions: 30,
          totalDuplicates: 15,
          totalPendingDuplicates: 3,
          importLogs: [],
          syncType: 'automatic',
          accountResults: [],
          errorMessage: null,
          createdAt: new Date('2025-11-10T09:15:00Z'),
          updatedAt: new Date('2025-11-10T09:15:00Z'),
        },
        {
          id: 3,
          user: mockUser,
          status: SyncStatus.FAILED,
          syncStartedAt: new Date('2025-11-09T09:00:00Z'),
          syncCompletedAt: new Date('2025-11-09T09:15:00Z'),
          totalAccounts: 3,
          successfulAccounts: 0,
          failedAccounts: 3,
          totalNewTransactions: 0,
          totalDuplicates: 0,
          totalPendingDuplicates: 0,
          importLogs: [],
          syncType: 'automatic',
          accountResults: [],
          errorMessage: 'All accounts failed',
          createdAt: new Date('2025-11-09T09:15:00Z'),
          updatedAt: new Date('2025-11-09T09:15:00Z'),
        },
      ];

      (syncReportRepository.find as jest.Mock).mockResolvedValue(
        mockSyncReports,
      );

      // Act
      const result = await service.getSyncStatistics(userId, days);

      // Assert
      expect(result.totalSyncs).toBe(3);
      expect(result.successfulSyncs).toBe(2);
      expect(result.failedSyncs).toBe(1);
      expect(result.successRate).toBe(66.67);
      expect(result.totalNewTransactions).toBe(75);
      expect(result.totalDuplicates).toBe(35);
      expect(result.averageTransactionsPerSync).toBe(25);
    });

    it('should return zero statistics when no syncs found', async () => {
      // Arrange
      const userId = 1;
      const days = 30;

      (syncReportRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.getSyncStatistics(userId, days);

      // Assert
      expect(result.totalSyncs).toBe(0);
      expect(result.successfulSyncs).toBe(0);
      expect(result.failedSyncs).toBe(0);
      expect(result.successRate).toBe(0);
      expect(result.totalNewTransactions).toBe(0);
      expect(result.totalDuplicates).toBe(0);
      expect(result.averageTransactionsPerSync).toBe(0);
    });

    it('should filter syncs by date range', async () => {
      // Arrange
      const userId = 1;
      const days = 7;
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() - days);

      (syncReportRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      await service.getSyncStatistics(userId, days);

      // Assert
      expect(syncReportRepository.find).toHaveBeenCalledWith({
        where: expect.objectContaining({
          user: { id: userId },
          syncStartedAt: expect.anything(),
        }),
      });
    });
  });

  describe('getSyncReportById', () => {
    it('should return sync report with relations when user owns it', async () => {
      // Arrange
      const userId = 1;
      const syncReportId = 1;
      const mockSyncReport = {
        id: 1,
        user: { id: userId },
        status: SyncStatus.SUCCESS,
        syncStartedAt: new Date('2025-11-11T09:00:00Z'),
        syncCompletedAt: new Date('2025-11-11T09:15:00Z'),
        totalAccounts: 2,
        successfulAccounts: 2,
        failedAccounts: 0,
        totalNewTransactions: 35,
        totalDuplicates: 15,
        totalPendingDuplicates: 3,
        importLogs: mockImportLogs.slice(0, 2),
        syncType: 'automatic',
        accountResults: [],
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (syncReportRepository.findOne as jest.Mock).mockResolvedValue(
        mockSyncReport,
      );

      // Act
      const result = await service.getSyncReportById(syncReportId, userId);

      // Assert
      expect(result).toEqual(mockSyncReport);
      expect(syncReportRepository.findOne).toHaveBeenCalledWith({
        where: { id: syncReportId },
        relations: ['importLogs', 'user'],
      });
    });

    it('should throw NotFoundException when sync report does not exist', async () => {
      // Arrange
      const userId = 1;
      const syncReportId = 999;

      (syncReportRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getSyncReportById(syncReportId, userId),
      ).rejects.toThrow('Sync report not found');
    });

    it('should throw ForbiddenException when user does not own sync report', async () => {
      // Arrange
      const userId = 1;
      const syncReportId = 1;
      const mockSyncReport = {
        id: 1,
        user: { id: 2 }, // Different user
        status: SyncStatus.SUCCESS,
        syncStartedAt: new Date('2025-11-11T09:00:00Z'),
        syncCompletedAt: new Date('2025-11-11T09:15:00Z'),
        totalAccounts: 2,
        successfulAccounts: 2,
        failedAccounts: 0,
        totalNewTransactions: 35,
        totalDuplicates: 15,
        totalPendingDuplicates: 3,
        importLogs: [],
        syncType: 'automatic',
        accountResults: [],
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (syncReportRepository.findOne as jest.Mock).mockResolvedValue(
        mockSyncReport,
      );

      // Act & Assert
      await expect(
        service.getSyncReportById(syncReportId, userId),
      ).rejects.toThrow('Access denied');
    });
  });
});
