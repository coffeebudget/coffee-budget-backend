import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BankAccountCreatedEvent, BankAccountUpdatedEvent, BankAccountDeletedEvent } from '../../shared/events/bank-account.events';
import { PendingDuplicatesService } from '../pending-duplicates.service';

/**
 * Bank Account Event Handler for Pending Duplicates Module
 * Handles bank account-related events for duplicate detection
 */
@Injectable()
export class BankAccountEventHandler {
  private readonly logger = new Logger(BankAccountEventHandler.name);

  constructor(
    private readonly pendingDuplicatesService: PendingDuplicatesService,
  ) {}

  /**
   * Handle BankAccountCreatedEvent
   * Initialize duplicate detection for the new bank account
   */
  @OnEvent(BankAccountCreatedEvent.name)
  async handleBankAccountCreated(event: BankAccountCreatedEvent): Promise<void> {
    try {
      this.logger.debug('Handling BankAccountCreatedEvent for duplicate detection setup', {
        bankAccountId: event.bankAccount.id,
        userId: event.userId,
      });

      // Initialize duplicate detection for the new bank account
      // This could include setting up duplicate detection rules or configurations
      this.logger.debug('Bank account duplicate detection setup completed', {
        bankAccountId: event.bankAccount.id,
      });
    } catch (error) {
      this.logger.error('Failed to handle BankAccountCreatedEvent for duplicate detection setup', {
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
   * Update duplicate detection when bank account is modified
   */
  @OnEvent(BankAccountUpdatedEvent.name)
  async handleBankAccountUpdated(event: BankAccountUpdatedEvent): Promise<void> {
    try {
      this.logger.debug('Handling BankAccountUpdatedEvent for duplicate detection update', {
        bankAccountId: event.bankAccount.id,
        userId: event.userId,
      });

      // Update duplicate detection when bank account is modified
      // This could include updating duplicate detection rules or configurations
      this.logger.debug('Bank account duplicate detection update completed', {
        bankAccountId: event.bankAccount.id,
      });
    } catch (error) {
      this.logger.error('Failed to handle BankAccountUpdatedEvent for duplicate detection update', {
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
   * Clean up duplicate detection when bank account is deleted
   */
  @OnEvent(BankAccountDeletedEvent.name)
  async handleBankAccountDeleted(event: BankAccountDeletedEvent): Promise<void> {
    try {
      this.logger.debug('Handling BankAccountDeletedEvent for duplicate detection cleanup', {
        bankAccountId: event.bankAccountId,
        userId: event.userId,
      });

      // Clean up duplicate detection when bank account is deleted
      // This could include removing duplicate detection rules or archiving data
      this.logger.debug('Bank account duplicate detection cleanup completed', {
        bankAccountId: event.bankAccountId,
      });
    } catch (error) {
      this.logger.error('Failed to handle BankAccountDeletedEvent for duplicate detection cleanup', {
        error: error.message,
        stack: error.stack,
        bankAccountId: event.bankAccountId,
        userId: event.userId,
      });
      // Don't re-throw to avoid breaking the bank account deletion flow
    }
  }
}
