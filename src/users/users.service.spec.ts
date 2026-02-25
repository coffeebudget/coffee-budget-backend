import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserService } from './users.service';
import { User } from './user.entity';
import { CategoriesService } from '../categories/categories.service';
import { DefaultCategoriesService } from '../categories/default-categories.service';
import { Transaction } from '../transactions/transaction.entity';
import { Tag } from '../tags/entities/tag.entity';
import { Category } from '../categories/entities/category.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { ExpensePlan } from '../expense-plans/entities/expense-plan.entity';
import { ExpensePlanPayment } from '../expense-plans/entities/expense-plan-payment.entity';
import { TransactionLinkSuggestion } from '../expense-plans/entities/transaction-link-suggestion.entity';
import { IncomePlan } from '../income-plans/entities/income-plan.entity';
import { IncomePlanEntry } from '../income-plans/entities/income-plan-entry.entity';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';
import { PreventedDuplicate } from '../prevented-duplicates/entities/prevented-duplicate.entity';
import { ImportLog } from '../transactions/entities/import-log.entity';
import { SyncReport } from '../sync-history/entities/sync-report.entity';
import { DetectedPattern } from '../smart-recurrence/entities/detected-pattern.entity';
import { ExpensePlanSuggestion } from '../smart-recurrence/entities/expense-plan-suggestion.entity';
import { MerchantCategorization } from '../merchant-categorization/entities/merchant-categorization.entity';
import { KeywordStats } from '../categories/entities/keyword-stats.entity';
import { GocardlessConnection } from '../gocardless/entities/gocardless-connection.entity';
import { PaymentAccount } from '../payment-accounts/payment-account.entity';

describe('UserService', () => {
  let service: UserService;
  let usersRepository: any;
  let dataSource: any;
  let mockManager: any;
  let mockQueryBuilder: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    mockManager = {
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation((cb: Function) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: CategoriesService,
          useValue: {},
        },
        {
          provide: DefaultCategoriesService,
          useValue: {
            createDefaultCategoriesForUser: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    usersRepository = module.get(getRepositoryToken(User));
  });

  describe('exportAccountData', () => {
    const userId = 42;
    const mockUser: User = {
      id: userId,
      auth0Id: 'auth0|export-me',
      email: 'export@example.com',
      isDemoUser: false,
      demoExpiryDate: null as any,
      demoActivatedAt: null as any,
      bankAccounts: [],
      creditCards: [],
      transactions: null,
      tags: null,
      categories: null,
      paymentAccounts: [],
    };

    it('should throw NotFoundException when user does not exist', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.exportAccountData(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return export data with correct structure', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(mockUser);

      const mockFind = jest.fn().mockResolvedValue([]);
      (dataSource as any).getRepository = jest
        .fn()
        .mockReturnValue({ find: mockFind });

      const result = await service.exportAccountData(userId);

      expect(result).toHaveProperty('exportedAt');
      expect(result).toHaveProperty('user');
      expect(result.user.email).toBe(mockUser.email);
      expect(result).toHaveProperty('transactions');
      expect(result).toHaveProperty('categories');
      expect(result).toHaveProperty('tags');
      expect(result).toHaveProperty('bankAccounts');
      expect(result).toHaveProperty('creditCards');
      expect(result).toHaveProperty('expensePlans');
      expect(result).toHaveProperty('incomePlans');
      expect(result).toHaveProperty('paymentAccounts');
      expect(result).toHaveProperty('gocardlessConnections');
      expect(result).toHaveProperty('syncReports');
    });

    it('should query all entity types', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(mockUser);

      const mockFind = jest.fn().mockResolvedValue([]);
      (dataSource as any).getRepository = jest
        .fn()
        .mockReturnValue({ find: mockFind });

      await service.exportAccountData(userId);

      // Should call getRepository for each entity type (13 calls)
      expect((dataSource as any).getRepository).toHaveBeenCalledTimes(13);
    });
  });

  describe('deleteAccount', () => {
    const userId = 42;
    const mockUser: User = {
      id: userId,
      auth0Id: 'auth0|delete-me',
      email: 'delete@example.com',
      isDemoUser: false,
      demoExpiryDate: null as any,
      demoActivatedAt: null as any,
      bankAccounts: [],
      creditCards: [],
      transactions: null,
      tags: null,
      categories: null,
      paymentAccounts: [],
    };

    it('should throw NotFoundException when user does not exist', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteAccount(userId)).rejects.toThrow(
        NotFoundException,
      );

      expect(usersRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should execute deletion within a dataSource.transaction() when user exists', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);

      await service.deleteAccount(userId);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(dataSource.transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should delete all entity types in correct order with User deleted LAST', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);

      await service.deleteAccount(userId);

      // Collect all delete calls to verify ordering
      const deleteCalls = mockManager.delete.mock.calls;

      // User must be the LAST entity deleted
      const lastDeleteCall = deleteCalls[deleteCalls.length - 1];
      expect(lastDeleteCall[0]).toBe(User);

      // All these entities must be deleted before User
      const deletedEntities = deleteCalls.map(
        (call: any[]) => call[0],
      );

      // Verify all user-owned entities are included in deletion
      const requiredEntities = [
        ExpensePlanPayment,
        IncomePlanEntry,
        TransactionLinkSuggestion,
        ExpensePlanSuggestion,
        DetectedPattern,
        PendingDuplicate,
        PreventedDuplicate,
        ImportLog,
        SyncReport,
        MerchantCategorization,
        KeywordStats,
        GocardlessConnection,
        PaymentAccount,
        Transaction,
        Tag,
        ExpensePlan,
        IncomePlan,
        Category,
        BankAccount,
        CreditCard,
        User,
      ];

      for (const entity of requiredEntities) {
        expect(deletedEntities).toContain(entity);
      }

      // Verify each delete is called with the correct user filter
      for (const call of deleteCalls) {
        if (call[0] === User) {
          expect(call[1]).toEqual({ id: userId });
        } else {
          expect(call[1]).toEqual({ user: { id: userId } });
        }
      }
    });

    it('should delete transaction_tags_tag junction table entries when user has transactions', async () => {
      const userTransactions = [
        { id: 101, description: 'Coffee' },
        { id: 102, description: 'Lunch' },
      ];
      usersRepository.findOne.mockResolvedValue(mockUser);
      mockManager.find.mockResolvedValue(userTransactions);

      await service.deleteAccount(userId);

      // Should query for user's transactions
      expect(mockManager.find).toHaveBeenCalledWith(Transaction, {
        where: { user: { id: userId } },
        select: ['id'],
      });

      // Should use createQueryBuilder to delete junction table entries
      expect(mockManager.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(mockQueryBuilder.from).toHaveBeenCalledWith(
        'transaction_tags_tag',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        '"transactionId" IN (:...transactionIds)',
        { transactionIds: [101, 102] },
      );
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should NOT call createQueryBuilder when user has no transactions', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);
      mockManager.find.mockResolvedValue([]);

      await service.deleteAccount(userId);

      expect(mockManager.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
