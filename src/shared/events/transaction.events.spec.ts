import {
  TransactionCreatedEvent,
  TransactionUpdatedEvent,
  TransactionDeletedEvent,
  TransactionImportedEvent,
  TransactionCategorizedEvent,
  TransactionTaggedEvent,
  TransactionEnrichedEvent,
} from './transaction.events';
import { Transaction } from '../../transactions/transaction.entity';

describe('Transaction Events', () => {
  describe('TransactionCreatedEvent', () => {
    it('should create event with transaction and userId', () => {
      const mockTransaction = { id: 1, description: 'Test' } as Transaction;
      const event = new TransactionCreatedEvent(mockTransaction, 1);

      expect(event.transaction).toEqual(mockTransaction);
      expect(event.userId).toBe(1);
      expect(event.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('TransactionEnrichedEvent', () => {
    const mockTransaction = {
      id: 1,
      description: 'PayPal Transfer',
      amount: 50.0,
      enhancedMerchantName: 'Starbucks Seattle',
      originalMerchantName: 'PayPal',
    } as Transaction;

    it('should create event with all required fields', () => {
      const event = new TransactionEnrichedEvent(
        mockTransaction,
        123, // paymentActivityId
        'Starbucks Seattle',
        'PayPal',
        1, // userId
      );

      expect(event.transaction).toEqual(mockTransaction);
      expect(event.paymentActivityId).toBe(123);
      expect(event.enhancedMerchantName).toBe('Starbucks Seattle');
      expect(event.originalMerchantName).toBe('PayPal');
      expect(event.userId).toBe(1);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should extend BaseEventClass', () => {
      const event = new TransactionEnrichedEvent(
        mockTransaction,
        123,
        'Starbucks',
        'PayPal',
        1,
      );

      expect(event).toHaveProperty('userId');
      expect(event).toHaveProperty('timestamp');
    });

    it('should handle null merchant names', () => {
      const event = new TransactionEnrichedEvent(
        mockTransaction,
        123,
        null,
        null,
        1,
      );

      expect(event.enhancedMerchantName).toBeNull();
      expect(event.originalMerchantName).toBeNull();
    });

    it('should create event with different userId', () => {
      const event = new TransactionEnrichedEvent(
        mockTransaction,
        123,
        'Starbucks',
        'PayPal',
        99,
      );

      expect(event.userId).toBe(99);
    });

    it('should capture timestamp at creation', () => {
      const before = new Date();
      const event = new TransactionEnrichedEvent(
        mockTransaction,
        123,
        'Starbucks',
        'PayPal',
        1,
      );
      const after = new Date();

      expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
