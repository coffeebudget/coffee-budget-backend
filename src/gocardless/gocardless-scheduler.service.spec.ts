import { Test, TestingModule } from '@nestjs/testing';
import { GocardlessSchedulerService } from './gocardless-scheduler.service';
import { GocardlessService } from './gocardless.service';
import { SyncHistoryService } from '../sync-history/sync-history.service';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';

describe('GocardlessSchedulerService', () => {
  let service: GocardlessSchedulerService;
  let gocardlessService: GocardlessService;
  let syncHistoryService: SyncHistoryService;
  let userRepository: Repository<User>;
  let module: TestingModule;

  const mockUsers: User[] = [
    {
      id: 1,
      auth0Id: 'auth0|user1',
      email: 'user1@example.com',
      isDemoUser: false,
      demoExpiryDate: new Date('2024-12-31'),
      demoActivatedAt: new Date('2024-01-01'),
      bankAccounts: [],
      creditCards: [],
      transactions: [],
      tags: [],
      categories: [],
      recurringTransactions: [],
    },
    {
      id: 2,
      auth0Id: 'auth0|user2',
      email: 'user2@example.com',
      isDemoUser: false,
      demoExpiryDate: new Date('2024-12-31'),
      demoActivatedAt: new Date('2024-01-01'),
      bankAccounts: [],
      creditCards: [],
      transactions: [],
      tags: [],
      categories: [],
      recurringTransactions: [],
    },
  ];

  const mockImportResult = {
    importResults: [
      {
        accountType: 'bank_account',
        accountName: 'Fineco',
        gocardlessAccountId: 'acc123',
        newTransactionsCount: 15,
        duplicatesCount: 5,
        pendingDuplicatesCreated: 2,
        status: 'completed',
      },
    ],
    summary: {
      totalAccounts: 1,
      successfulImports: 1,
      failedImports: 0,
      totalNewTransactions: 15,
      totalDuplicates: 5,
      totalPendingDuplicates: 2,
    },
  };

  const mockSyncReport = {
    id: 1,
    status: 'success',
    totalAccounts: 1,
    successfulAccounts: 1,
    failedAccounts: 0,
    totalNewTransactions: 15,
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        GocardlessSchedulerService,
        {
          provide: GocardlessService,
          useValue: {
            importAllConnectedAccounts: jest.fn(),
          },
        },
        {
          provide: SyncHistoryService,
          useValue: {
            createSyncReport: jest.fn(),
          },
        },
        RepositoryMockFactory.createRepositoryProvider(User),
      ],
    }).compile();

    service = module.get<GocardlessSchedulerService>(
      GocardlessSchedulerService,
    );
    gocardlessService = module.get<GocardlessService>(GocardlessService);
    syncHistoryService = module.get<SyncHistoryService>(SyncHistoryService);
    userRepository = module.get(getRepositoryToken(User));
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('dailyBankSync', () => {
    it('should sync all users with GoCardless accounts', async () => {
      // Arrange
      (userRepository.find as jest.Mock).mockResolvedValue(mockUsers);
      (gocardlessService.importAllConnectedAccounts as jest.Mock)
        .mockResolvedValue(mockImportResult);
      (syncHistoryService.createSyncReport as jest.Mock).mockResolvedValue(
        mockSyncReport,
      );

      // Act
      await service.dailyBankSync();

      // Assert
      expect(userRepository.find).toHaveBeenCalled();
      expect(gocardlessService.importAllConnectedAccounts).toHaveBeenCalledTimes(
        2,
      );
      expect(gocardlessService.importAllConnectedAccounts).toHaveBeenCalledWith(
        1,
        {},
      );
      expect(gocardlessService.importAllConnectedAccounts).toHaveBeenCalledWith(
        2,
        {},
      );
      expect(syncHistoryService.createSyncReport).toHaveBeenCalledTimes(2);
    });

    it('should create sync report for each user', async () => {
      // Arrange
      (userRepository.find as jest.Mock).mockResolvedValue([mockUsers[0]]);
      (gocardlessService.importAllConnectedAccounts as jest.Mock)
        .mockResolvedValue(mockImportResult);
      (syncHistoryService.createSyncReport as jest.Mock).mockResolvedValue(
        mockSyncReport,
      );

      // Act
      await service.dailyBankSync();

      // Assert
      expect(syncHistoryService.createSyncReport).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          summary: expect.objectContaining({
            totalAccounts: 1,
            successfulImports: 1,
            failedImports: 0,
            totalNewTransactions: 15,
            totalDuplicates: 5,
            totalPendingDuplicates: 2,
          }),
          importResults: expect.arrayContaining([
            expect.objectContaining({
              accountId: 'acc123',
              accountName: 'Fineco',
              accountType: 'bank_account',
              success: true,
              newTransactions: 15,
              duplicates: 5,
              pendingDuplicates: 2,
            }),
          ]),
        }),
        expect.any(Date),
      );
    });

    it('should handle import errors gracefully', async () => {
      // Arrange
      const importError = new Error('GoCardless API error');
      (userRepository.find as jest.Mock).mockResolvedValue([mockUsers[0]]);
      (gocardlessService.importAllConnectedAccounts as jest.Mock)
        .mockRejectedValue(importError);

      // Act & Assert
      await expect(service.dailyBankSync()).resolves.not.toThrow();
      expect(syncHistoryService.createSyncReport).not.toHaveBeenCalled();
    });

    it('should continue syncing other users if one fails', async () => {
      // Arrange
      (userRepository.find as jest.Mock).mockResolvedValue(mockUsers);
      (gocardlessService.importAllConnectedAccounts as jest.Mock)
        .mockResolvedValueOnce(mockImportResult)
        .mockRejectedValueOnce(new Error('API error'));
      (syncHistoryService.createSyncReport as jest.Mock).mockResolvedValue(
        mockSyncReport,
      );

      // Act
      await service.dailyBankSync();

      // Assert
      expect(gocardlessService.importAllConnectedAccounts).toHaveBeenCalledTimes(
        2,
      );
      expect(syncHistoryService.createSyncReport).toHaveBeenCalledTimes(1); // Only for successful user
    });

    it('should skip demo users', async () => {
      // Arrange
      // The repository query filters isDemoUser: false, so it only returns non-demo users
      (userRepository.find as jest.Mock).mockResolvedValue(mockUsers);
      (gocardlessService.importAllConnectedAccounts as jest.Mock)
        .mockResolvedValue(mockImportResult);
      (syncHistoryService.createSyncReport as jest.Mock).mockResolvedValue(
        mockSyncReport,
      );

      // Act
      await service.dailyBankSync();

      // Assert
      expect(gocardlessService.importAllConnectedAccounts).toHaveBeenCalledTimes(
        2,
      ); // Only non-demo users
      // Verify the repository was called with the correct filter
      expect(userRepository.find).toHaveBeenCalledWith({
        where: { isDemoUser: false },
      });
    });
  });

  describe('getUsersWithGocardlessAccounts', () => {
    it('should return all non-demo users', async () => {
      // Arrange
      (userRepository.find as jest.Mock).mockResolvedValue(mockUsers);

      // Act
      const result = await service.getUsersWithGocardlessAccounts();

      // Assert
      expect(result).toEqual(mockUsers);
      expect(userRepository.find).toHaveBeenCalledWith({
        where: { isDemoUser: false },
      });
    });

    it('should return empty array when no users found', async () => {
      // Arrange
      (userRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.getUsersWithGocardlessAccounts();

      // Assert
      expect(result).toEqual([]);
    });
  });
});
