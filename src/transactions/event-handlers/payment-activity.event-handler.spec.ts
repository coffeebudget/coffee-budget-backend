import { Test, TestingModule } from '@nestjs/testing';
import { PaymentActivityEventHandler } from './payment-activity.event-handler';
import { PaymentActivitiesService } from '../../payment-activities/payment-activities.service';
import { Transaction } from '../transaction.entity';
import { PaymentAccount } from '../../payment-accounts/payment-account.entity';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentActivityCreatedEvent } from '../../shared/events/payment-activity-created.event';
import { RepositoryMockFactory } from '../../test/test-utils/repository-mocks';
import { EventPublisherService } from '../../shared/services/event-publisher.service';
import { TransactionEnrichedEvent } from '../../shared/events/transaction.events';

describe('PaymentActivityEventHandler', () => {
  let handler: PaymentActivityEventHandler;
  let transactionRepository: Repository<Transaction>;
  let paymentAccountRepository: Repository<PaymentAccount>;
  let paymentActivitiesService: PaymentActivitiesService;
  let eventPublisher: EventPublisherService;
  let module: TestingModule;

  const mockPaymentAccount = {
    id: 1,
    provider: 'paypal',
    userId: 1,
  } as PaymentAccount;

  const mockPaymentActivity = {
    id: 123,
    paymentAccountId: 1,
    paymentAccount: { userId: 1 },
    externalId: 'PAY-123',
    merchantName: 'Starbucks Seattle',
    merchantCategory: 'Coffee Shops',
    merchantCategoryCode: '5814',
    amount: 50.0,
    executionDate: new Date('2024-12-15'),
    description: 'Coffee purchase',
    reconciledTransactionId: null,
    reconciliationStatus: 'pending',
    reconciliationConfidence: null,
    reconciledAt: null,
    rawData: { transactionType: 'expense' },
    reconciledTransaction: null,
    createdAt: new Date('2024-12-15'),
    updatedAt: new Date('2024-12-15'),
  } as unknown as any;

  const mockTransaction = {
    id: 1,
    description: 'PayPal Transfer',
    merchantName: 'PayPal',
    amount: 50.0,
    executionDate: new Date('2024-12-15'),
    type: 'expense',
    source: 'gocardless',
    enrichedFromPaymentActivityId: null,
    originalMerchantName: null,
    enhancedMerchantName: null,
    enhancedCategoryConfidence: null,
    user: { id: 1 },
  } as unknown as Transaction;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        PaymentActivityEventHandler,
        RepositoryMockFactory.createRepositoryProvider(Transaction),
        RepositoryMockFactory.createRepositoryProvider(PaymentAccount),
        {
          provide: PaymentActivitiesService,
          useValue: {
            markReconciliationFailed: jest.fn(),
            updateReconciliation: jest.fn(),
          },
        },
        {
          provide: EventPublisherService,
          useValue: {
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<PaymentActivityEventHandler>(
      PaymentActivityEventHandler,
    );
    transactionRepository = module.get(getRepositoryToken(Transaction));
    paymentAccountRepository = module.get(getRepositoryToken(PaymentAccount));
    paymentActivitiesService = module.get<PaymentActivitiesService>(
      PaymentActivitiesService,
    );
    eventPublisher = module.get<EventPublisherService>(EventPublisherService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('handlePaymentActivityCreated - Event Publishing', () => {
    it('should publish TransactionEnrichedEvent after successful automatic reconciliation', async () => {
      // Arrange
      const event = new PaymentActivityCreatedEvent(mockPaymentActivity, 1);

      (paymentAccountRepository.findOne as jest.Mock).mockResolvedValue(
        mockPaymentAccount,
      );

      // Mock the query builder chain for finding matching transaction
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockTransaction]),
      };
      (transactionRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      (transactionRepository.save as jest.Mock).mockResolvedValue({
        ...mockTransaction,
        enrichedFromPaymentActivityId: 123,
        originalMerchantName: 'PayPal',
        enhancedMerchantName: 'Starbucks Seattle',
        enhancedCategoryConfidence: 85.0,
      });

      (
        paymentActivitiesService.updateReconciliation as jest.Mock
      ).mockResolvedValue(mockPaymentActivity);

      // Act
      await handler.handlePaymentActivityCreated(event);

      // Assert
      expect(
        paymentActivitiesService.updateReconciliation,
      ).toHaveBeenCalledWith(
        123,
        1,
        expect.objectContaining({
          reconciledTransactionId: 1,
          reconciliationStatus: 'reconciled',
        }),
        false, // publishEvent should be false for automatic flow
      );

      expect(eventPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({ id: 1 }),
          paymentActivityId: 123,
          enhancedMerchantName: 'Starbucks Seattle',
          originalMerchantName: 'PayPal',
          userId: 1,
        }),
      );

      // Verify it's a TransactionEnrichedEvent
      const publishedEvent = (eventPublisher.publish as jest.Mock).mock
        .calls[0][0];
      expect(publishedEvent).toBeInstanceOf(TransactionEnrichedEvent);
    });

    it('should not publish event if no matching transaction found', async () => {
      // Arrange
      const event = new PaymentActivityCreatedEvent(mockPaymentActivity, 1);

      (paymentAccountRepository.findOne as jest.Mock).mockResolvedValue(
        mockPaymentAccount,
      );

      // Mock query builder returning no matches
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]), // No matches
      };
      (transactionRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      await handler.handlePaymentActivityCreated(event);

      // Assert
      expect(
        paymentActivitiesService.markReconciliationFailed,
      ).toHaveBeenCalledWith(123, 1);
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('should not fail reconciliation if event publishing fails', async () => {
      // Arrange
      const event = new PaymentActivityCreatedEvent(mockPaymentActivity, 1);

      (paymentAccountRepository.findOne as jest.Mock).mockResolvedValue(
        mockPaymentAccount,
      );

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockTransaction]),
      };
      (transactionRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      (transactionRepository.save as jest.Mock).mockResolvedValue({
        ...mockTransaction,
        enrichedFromPaymentActivityId: 123,
      });

      (
        paymentActivitiesService.updateReconciliation as jest.Mock
      ).mockResolvedValue(mockPaymentActivity);

      // Mock event publishing to throw error
      (eventPublisher.publish as jest.Mock).mockImplementation(() => {
        throw new Error('Event bus error');
      });

      // Act & Assert - should not throw
      await expect(
        handler.handlePaymentActivityCreated(event),
      ).resolves.not.toThrow();

      // Verify reconciliation still completed
      expect(paymentActivitiesService.updateReconciliation).toHaveBeenCalled();
    });

    it('should pass publishEvent: false to updateReconciliation to avoid duplicate events', async () => {
      // Arrange
      const event = new PaymentActivityCreatedEvent(mockPaymentActivity, 1);

      (paymentAccountRepository.findOne as jest.Mock).mockResolvedValue(
        mockPaymentAccount,
      );

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockTransaction]),
      };
      (transactionRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      (transactionRepository.save as jest.Mock).mockResolvedValue({
        ...mockTransaction,
        enrichedFromPaymentActivityId: 123,
        originalMerchantName: 'PayPal',
        enhancedMerchantName: 'Starbucks Seattle',
      });

      (
        paymentActivitiesService.updateReconciliation as jest.Mock
      ).mockResolvedValue(mockPaymentActivity);

      // Act
      await handler.handlePaymentActivityCreated(event);

      // Assert - verify 4th parameter is false
      expect(
        paymentActivitiesService.updateReconciliation,
      ).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        expect.any(Object),
        false, // CRITICAL: Must be false to prevent duplicate event publishing
      );
    });

    it('should use saved transaction data for event publishing', async () => {
      // Arrange
      const event = new PaymentActivityCreatedEvent(mockPaymentActivity, 1);

      (paymentAccountRepository.findOne as jest.Mock).mockResolvedValue(
        mockPaymentAccount,
      );

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockTransaction]),
      };
      (transactionRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      const savedTransaction = {
        ...mockTransaction,
        enrichedFromPaymentActivityId: 123,
        originalMerchantName: 'PayPal Transfer',
        enhancedMerchantName: 'Starbucks Seattle Downtown',
        enhancedCategoryConfidence: 92.5,
      };

      (transactionRepository.save as jest.Mock).mockResolvedValue(
        savedTransaction,
      );

      (
        paymentActivitiesService.updateReconciliation as jest.Mock
      ).mockResolvedValue(mockPaymentActivity);

      // Act
      await handler.handlePaymentActivityCreated(event);

      // Assert - verify event uses saved transaction data
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: savedTransaction,
          enhancedMerchantName: 'Starbucks Seattle Downtown',
          originalMerchantName: 'PayPal Transfer',
        }),
      );
    });

    it('should update transaction description with enhanced merchant name', async () => {
      // Arrange
      const event = new PaymentActivityCreatedEvent(mockPaymentActivity, 1);

      (paymentAccountRepository.findOne as jest.Mock).mockResolvedValue(
        mockPaymentAccount,
      );

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockTransaction]),
      };
      (transactionRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      (transactionRepository.save as jest.Mock).mockImplementation((tx) =>
        Promise.resolve(tx),
      );

      (
        paymentActivitiesService.updateReconciliation as jest.Mock
      ).mockResolvedValue(mockPaymentActivity);

      // Act
      await handler.handlePaymentActivityCreated(event);

      // Assert - verify description is updated to enhanced merchant name
      expect(transactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Starbucks Seattle', // Should be updated from 'PayPal Transfer'
          originalMerchantName: 'PayPal', // Original preserved
          enhancedMerchantName: 'Starbucks Seattle',
        }),
      );
    });

    it('should extract userId from paymentActivity.paymentAccount.userId', async () => {
      // Arrange
      const activityWithNestedUser = {
        ...mockPaymentActivity,
        paymentAccount: { userId: 42 } as any,
      } as unknown as any;

      const event = new PaymentActivityCreatedEvent(activityWithNestedUser, 42);

      (paymentAccountRepository.findOne as jest.Mock).mockResolvedValue(
        mockPaymentAccount,
      );

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockTransaction]),
      };
      (transactionRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      (transactionRepository.save as jest.Mock).mockResolvedValue({
        ...mockTransaction,
        enrichedFromPaymentActivityId: 123,
      });

      (
        paymentActivitiesService.updateReconciliation as jest.Mock
      ).mockResolvedValue(activityWithNestedUser);

      // Act
      await handler.handlePaymentActivityCreated(event);

      // Assert - verify userId is 42
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 42,
        }),
      );
    });
  });
});
