import { Transaction } from '../../transactions/transaction.entity';
import { BaseEventClass } from './base.event';

/**
 * Transaction Created Event
 * Published when a new transaction is created
 */
export class TransactionCreatedEvent extends BaseEventClass {
  constructor(
    public readonly transaction: Transaction,
    userId: number,
  ) {
    super(userId);
  }
}

/**
 * Transaction Updated Event
 * Published when a transaction is updated
 */
export class TransactionUpdatedEvent extends BaseEventClass {
  constructor(
    public readonly transaction: Transaction,
    userId: number,
  ) {
    super(userId);
  }
}

/**
 * Transaction Deleted Event
 * Published when a transaction is deleted
 */
export class TransactionDeletedEvent extends BaseEventClass {
  constructor(
    public readonly transactionId: number,
    userId: number,
  ) {
    super(userId);
  }
}

/**
 * Transaction Imported Event
 * Published when transactions are imported (bulk)
 */
export class TransactionImportedEvent extends BaseEventClass {
  constructor(
    public readonly transactions: Transaction[],
    userId: number,
  ) {
    super(userId);
  }
}

/**
 * Transaction Categorized Event
 * Published when a transaction is categorized
 */
export class TransactionCategorizedEvent extends BaseEventClass {
  constructor(
    public readonly transactionId: number,
    public readonly categoryId: number,
    userId: number,
  ) {
    super(userId);
  }
}

/**
 * Transaction Tagged Event
 * Published when tags are assigned to a transaction
 */
export class TransactionTaggedEvent extends BaseEventClass {
  constructor(
    public readonly transactionId: number,
    public readonly tagIds: number[],
    userId: number,
  ) {
    super(userId);
  }
}
