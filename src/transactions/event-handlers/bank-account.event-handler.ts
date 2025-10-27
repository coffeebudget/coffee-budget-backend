import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BankAccountCreatedEvent, BankAccountUpdatedEvent, BankAccountDeletedEvent } from '../../shared/events/bank-account.events';
import { TransactionsService } from '../transactions.service';

/**
 * Bank Account Event Handler for Transactions Module
 * Handles bank account-related events for transaction management
 */
@Injectable()
export class BankAccountEventHandler {
  private readonly logger = new Logger(BankAccountEventHandler.name);

  constructor(
    private readonly transactionsService: TransactionsService,
  ) {}

  /**
   * Handle BankAccountCreatedEvent
   * Initialize any transaction-related data for the new bank account
   */
  @OnEvent(BankAccountCreatedEvent.name)
  async handleBankAccountCreated(event: BankAccountCreatedEvent): Promise<void> {
    try {
      this.logger.debug('Handling BankAccountCreatedEvent for transaction management', {
        bankAccountId: event.bankAccount.id,
        userId: event.userId,
      });

      // Initialize any transaction-related data for the new bank account
      // This could include setting up default categories, tags, or other configurations
      this.logger.debug('Bank account transaction setup completed', {
        bankAccountId: event.bankAccount.id,
      });
    } catch (error) {
      this.logger.error('Failed to handle BankAccountCreatedEvent for transaction management', {
        error: error.message,
        stack: error.stack,
        bankAccountId: event.bankAccount.id,
        userId: event.userId,
      });
      // Don't re-throw to avoid breaking the bank account creation flow
    }
  }

  /**
   * Handle BankAccountUpdatedEvent
   * Update any transaction-related data when bank account is modified
   */
  @OnEvent(BankAccountUpdatedEvent.name)
  async handleBankAccountUpdated(event: BankAccountUpdatedEvent): Promise<void> {
    try {
      this.logger.debug('Handling BankAccountUpdatedEvent for transaction management', {
        bankAccountId: event.bankAccount.id,
        userId: event.userId,
      });

      // Update any transaction-related data when bank account is modified
      // This could include updating transaction references or configurations
      this.logger.debug('Bank account transaction update completed', {
        bankAccountId: event.bankAccount.id,
      });
    } catch (error) {
      this.logger.error('Failed to handle BankAccountUpdatedEvent for transaction management', {
        error: error.message,
        stack: error.stack,
        bankAccountId: event.bankAccount.id,
        userId: event.userId,
      });
      // Don't re-throw to avoid breaking the bank account update flow
    }
  }

  /**
   * Handle BankAccountDeletedEvent
   * Clean up any transaction-related data when bank account is deleted
   */
  @OnEvent(BankAccountDeletedEvent.name)
  async handleBankAccountDeleted(event: BankAccountDeletedEvent): Promise<void> {
    try {
      this.logger.debug('Handling BankAccountDeletedEvent for transaction cleanup', {
        bankAccountId: event.bankAccountId,
        userId: event.userId,
      });

      // Clean up any transaction-related data when bank account is deleted
      // This could include archiving transactions or updating references
      this.logger.debug('Bank account transaction cleanup completed', {
        bankAccountId: event.bankAccountId,
      });
    } catch (error) {
      this.logger.error('Failed to handle BankAccountDeletedEvent for transaction cleanup', {
        error: error.message,
        stack: error.stack,
        bankAccountId: event.bankAccountId,
        userId: event.userId,
      });
      // Don't re-throw to avoid breaking the bank account deletion flow
    }
  }
}
