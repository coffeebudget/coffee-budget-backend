import { BaseEventClass } from './base.event';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';

export class BankAccountCreatedEvent extends BaseEventClass {
  constructor(
    public readonly bankAccount: BankAccount,
    userId: number,
  ) {
    super(userId);
  }
}

export class BankAccountUpdatedEvent extends BaseEventClass {
  constructor(
    public readonly bankAccount: BankAccount,
    userId: number,
  ) {
    super(userId);
  }
}

export class BankAccountDeletedEvent extends BaseEventClass {
  constructor(
    public readonly bankAccountId: number,
    userId: number,
  ) {
    super(userId);
  }
}

export class BankAccountTransactionsImportedEvent extends BaseEventClass {
  constructor(
    public readonly bankAccountId: number,
    public readonly importedCount: number,
    userId: number,
  ) {
    super(userId);
  }
}
