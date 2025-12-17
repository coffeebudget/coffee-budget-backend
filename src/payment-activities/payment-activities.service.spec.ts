import { Test, TestingModule } from '@nestjs/testing';
import { PaymentActivitiesService } from './payment-activities.service';
import { PaymentActivity } from './payment-activity.entity';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';
import { EventPublisherService } from '../shared/services/event-publisher.service';

describe('PaymentActivitiesService', () => {
  let service: PaymentActivitiesService;
  let repository: Repository<PaymentActivity>;
  let module: TestingModule;

  const mockUser = {
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
    paymentAccounts: [],
  };

  const mockPaymentAccount = {
    id: 1,
    userId: 1,
    provider: 'paypal',
    displayName: 'My PayPal',
    user: mockUser,
  };

  const mockTransaction = {
    id: 1,
    description: 'PayPal Transfer',
    amount: 50.00,
    executionDate: new Date('2024-01-15'),
  };

  const mockPaymentActivity = {
    id: 1,
    paymentAccountId: 1,
    externalId: 'PAYPAL-TX-123',
    merchantName: 'Starbucks',
    merchantCategory: 'Coffee Shops',
    merchantCategoryCode: '5814',
    amount: 50.00,
    executionDate: new Date('2024-01-15'),
    description: 'Coffee purchase',
    reconciledTransactionId: null,
    reconciliationStatus: 'pending',
    reconciliationConfidence: null,
    reconciledAt: null,
    rawData: { paypal_fee: 1.50 },
    paymentAccount: mockPaymentAccount,
    reconciledTransaction: null,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  } as unknown as PaymentActivity;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        PaymentActivitiesService,
        RepositoryMockFactory.createRepositoryProvider(PaymentActivity),
        {
          provide: EventPublisherService,
          useValue: {
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentActivitiesService>(PaymentActivitiesService);
    repository = module.get(getRepositoryToken(PaymentActivity));
  });

  afterEach(async () => {
    await module.close();
  });

  describe('findAllByPaymentAccount', () => {
    it('should return all payment activities for a payment account', async () => {
      // Arrange
      const paymentAccountId = 1;
      const userId = 1;
      const mockActivities = [mockPaymentActivity];
      (repository.find as jest.Mock).mockResolvedValue(mockActivities);

      // Act
      const result = await service.findAllByPaymentAccount(paymentAccountId, userId);

      // Assert
      expect(result).toEqual(mockActivities);
      expect(repository.find).toHaveBeenCalledWith({
        where: {
          paymentAccountId,
          paymentAccount: { userId },
        },
        relations: ['paymentAccount', 'reconciledTransaction'],
        order: { executionDate: 'DESC' },
      });
    });

    it('should return empty array when no activities exist', async () => {
      // Arrange
      const paymentAccountId = 1;
      const userId = 1;
      (repository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.findAllByPaymentAccount(paymentAccountId, userId);

      // Assert
      expect(result).toEqual([]);
    });

    it('should filter by user through payment account', async () => {
      // Arrange
      const paymentAccountId = 1;
      const userId = 2; // Different user
      (repository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.findAllByPaymentAccount(paymentAccountId, userId);

      // Assert
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentAccount: { userId: 2 },
          }),
        }),
      );
    });

    it('should order by executionDate DESC', async () => {
      // Arrange
      const paymentAccountId = 1;
      const userId = 1;
      (repository.find as jest.Mock).mockResolvedValue([]);

      // Act
      await service.findAllByPaymentAccount(paymentAccountId, userId);

      // Assert
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { executionDate: 'DESC' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a payment activity when found', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentActivity);

      // Act
      const result = await service.findOne(id, userId);

      // Assert
      expect(result).toEqual(mockPaymentActivity);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          id,
          paymentAccount: { userId },
        },
        relations: ['paymentAccount', 'reconciledTransaction'],
      });
    });

    it('should throw NotFoundException when payment activity not found', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(id, userId)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(id, userId)).rejects.toThrow(
        `Payment activity with ID ${id} not found for user`,
      );
    });

    it('should not return activity belonging to different user', async () => {
      // Arrange
      const id = 1;
      const userId = 2; // Different user
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(id, userId)).rejects.toThrow(NotFoundException);
    });

    it('should include relations for paymentAccount and reconciledTransaction', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentActivity);

      // Act
      await service.findOne(id, userId);

      // Assert
      expect(repository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['paymentAccount', 'reconciledTransaction'],
        }),
      );
    });
  });

  describe('create', () => {
    it('should create a new payment activity with all fields', async () => {
      // Arrange
      const userId = 1;
      const createData = {
        paymentAccountId: 1,
        externalId: 'PAYPAL-TX-456',
        merchantName: 'Amazon',
        merchantCategory: 'Online Retail',
        merchantCategoryCode: '5999',
        amount: 25.99,
        executionDate: new Date('2024-01-20'),
        description: 'Book purchase',
        rawData: { order_id: 'AMZ-123' },
      };

      const queryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      };

      (repository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);
      (repository.create as jest.Mock).mockReturnValue(mockPaymentActivity);
      (repository.save as jest.Mock).mockResolvedValue(mockPaymentActivity);

      // Act
      const result = await service.create(userId, createData);

      // Assert
      expect(repository.create).toHaveBeenCalledWith({
        ...createData,
        reconciliationStatus: 'pending',
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(mockPaymentActivity);
    });

    it('should throw NotFoundException if payment account does not belong to user', async () => {
      // Arrange
      const userId = 2; // Different user
      const createData = {
        paymentAccountId: 1,
        externalId: 'PAYPAL-TX-456',
        amount: 25.99,
        executionDate: new Date('2024-01-20'),
        rawData: {},
      };

      const queryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(false), // Payment account doesn't exist
      };

      (repository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      // Act & Assert
      await expect(service.create(userId, createData)).rejects.toThrow(NotFoundException);
      await expect(service.create(userId, createData)).rejects.toThrow(
        'Payment account not found for user',
      );
    });

    it('should set reconciliationStatus to pending by default', async () => {
      // Arrange
      const userId = 1;
      const createData = {
        paymentAccountId: 1,
        externalId: 'PAYPAL-TX-789',
        amount: 10.00,
        executionDate: new Date('2024-01-21'),
        rawData: {},
      };

      const queryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      };

      (repository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);
      (repository.create as jest.Mock).mockReturnValue(mockPaymentActivity);
      (repository.save as jest.Mock).mockResolvedValue(mockPaymentActivity);

      // Act
      await service.create(userId, createData);

      // Assert
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reconciliationStatus: 'pending',
        }),
      );
    });
  });

  describe('findPending', () => {
    it('should return all pending payment activities for user', async () => {
      // Arrange
      const userId = 1;
      const pendingActivities = [mockPaymentActivity];
      (repository.find as jest.Mock).mockResolvedValue(pendingActivities);

      // Act
      const result = await service.findPending(userId);

      // Assert
      expect(result).toEqual(pendingActivities);
      expect(repository.find).toHaveBeenCalledWith({
        where: {
          reconciliationStatus: 'pending',
          paymentAccount: { userId },
        },
        relations: ['paymentAccount'],
        order: { executionDate: 'DESC' },
      });
    });

    it('should only return activities with pending status', async () => {
      // Arrange
      const userId = 1;
      (repository.find as jest.Mock).mockResolvedValue([]);

      // Act
      await service.findPending(userId);

      // Assert
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            reconciliationStatus: 'pending',
          }),
        }),
      );
    });

    it('should filter by user', async () => {
      // Arrange
      const userId = 1;
      (repository.find as jest.Mock).mockResolvedValue([]);

      // Act
      await service.findPending(userId);

      // Assert
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentAccount: { userId: 1 },
          }),
        }),
      );
    });
  });

  describe('findByDateRange', () => {
    it('should find activities within date range', async () => {
      // Arrange
      const userId = 1;
      const startDate = new Date('2024-01-10');
      const endDate = new Date('2024-01-20');
      const activities = [mockPaymentActivity];
      (repository.find as jest.Mock).mockResolvedValue(activities);

      // Act
      const result = await service.findByDateRange(userId, startDate, endDate);

      // Assert
      expect(result).toEqual(activities);
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentAccount: { userId },
            reconciliationStatus: 'pending',
          }),
        }),
      );
    });

    it('should only return pending activities', async () => {
      // Arrange
      const userId = 1;
      const startDate = new Date('2024-01-10');
      const endDate = new Date('2024-01-20');
      (repository.find as jest.Mock).mockResolvedValue([]);

      // Act
      await service.findByDateRange(userId, startDate, endDate);

      // Assert
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            reconciliationStatus: 'pending',
          }),
        }),
      );
    });

    it('should order by executionDate ASC', async () => {
      // Arrange
      const userId = 1;
      const startDate = new Date('2024-01-10');
      const endDate = new Date('2024-01-20');
      (repository.find as jest.Mock).mockResolvedValue([]);

      // Act
      await service.findByDateRange(userId, startDate, endDate);

      // Assert
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { executionDate: 'ASC' },
        }),
      );
    });
  });

  describe('updateReconciliation', () => {
    it('should update reconciliation with all fields', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const updateData = {
        reconciledTransactionId: 123,
        reconciliationStatus: 'reconciled' as const,
        reconciliationConfidence: 95.5,
      };
      const updatedActivity = {
        ...mockPaymentActivity,
        ...updateData,
        reconciledAt: expect.any(Date),
      };
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentActivity);
      (repository.save as jest.Mock).mockResolvedValue(updatedActivity);

      // Act
      const result = await service.updateReconciliation(id, userId, updateData);

      // Assert
      expect(result).toEqual(updatedActivity);
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          reconciledTransactionId: 123,
          reconciliationStatus: 'reconciled',
          reconciliationConfidence: 95.5,
          reconciledAt: expect.any(Date),
        }),
      );
    });

    it('should set reconciledAt timestamp', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const updateData = {
        reconciledTransactionId: 123,
        reconciliationStatus: 'reconciled' as const,
      };
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentActivity);
      (repository.save as jest.Mock).mockImplementation((activity) => Promise.resolve(activity));

      // Act
      const result = await service.updateReconciliation(id, userId, updateData);

      // Assert
      expect(result.reconciledAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException if activity does not exist', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      const updateData = {
        reconciledTransactionId: 123,
        reconciliationStatus: 'reconciled' as const,
      };
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.updateReconciliation(id, userId, updateData)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markReconciliationFailed', () => {
    it('should mark activity as failed', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const failedActivity = {
        ...mockPaymentActivity,
        reconciliationStatus: 'failed' as const,
      };
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentActivity);
      (repository.save as jest.Mock).mockResolvedValue(failedActivity);

      // Act
      const result = await service.markReconciliationFailed(id, userId);

      // Assert
      expect(result.reconciliationStatus).toBe('failed');
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if activity does not exist', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.markReconciliationFailed(id, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByExternalId', () => {
    it('should find activity by external ID', async () => {
      // Arrange
      const externalId = 'PAYPAL-TX-123';
      const userId = 1;
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentActivity);

      // Act
      const result = await service.findByExternalId(externalId, userId);

      // Assert
      expect(result).toEqual(mockPaymentActivity);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          externalId,
          paymentAccount: { userId },
        },
        relations: ['paymentAccount'],
      });
    });

    it('should return null when external ID not found', async () => {
      // Arrange
      const externalId = 'NONEXISTENT-123';
      const userId = 1;
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await service.findByExternalId(externalId, userId);

      // Assert
      expect(result).toBeNull();
    });

    it('should filter by user', async () => {
      // Arrange
      const externalId = 'PAYPAL-TX-123';
      const userId = 1;
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentActivity);

      // Act
      await service.findByExternalId(externalId, userId);

      // Assert
      expect(repository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentAccount: { userId: 1 },
          }),
        }),
      );
    });
  });

  describe('getReconciliationStats', () => {
    it('should return reconciliation statistics', async () => {
      // Arrange
      const userId = 1;
      (repository.count as jest.Mock)
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(3)  // pending
        .mockResolvedValueOnce(5)  // reconciled
        .mockResolvedValueOnce(1)  // failed
        .mockResolvedValueOnce(1); // manual

      // Act
      const result = await service.getReconciliationStats(userId);

      // Assert
      expect(result).toEqual({
        total: 10,
        pending: 3,
        reconciled: 5,
        failed: 1,
        manual: 1,
      });
    });

    it('should return zeros when no activities exist', async () => {
      // Arrange
      const userId = 1;
      (repository.count as jest.Mock).mockResolvedValue(0);

      // Act
      const result = await service.getReconciliationStats(userId);

      // Assert
      expect(result).toEqual({
        total: 0,
        pending: 0,
        reconciled: 0,
        failed: 0,
        manual: 0,
      });
    });

    it('should filter all counts by user', async () => {
      // Arrange
      const userId = 1;
      (repository.count as jest.Mock).mockResolvedValue(0);

      // Act
      await service.getReconciliationStats(userId);

      // Assert
      expect(repository.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentAccount: { userId: 1 },
          }),
        }),
      );
    });

    it('should call count 5 times for each status', async () => {
      // Arrange
      const userId = 1;
      (repository.count as jest.Mock).mockResolvedValue(0);

      // Act
      await service.getReconciliationStats(userId);

      // Assert
      expect(repository.count).toHaveBeenCalledTimes(5);
    });
  });
});
