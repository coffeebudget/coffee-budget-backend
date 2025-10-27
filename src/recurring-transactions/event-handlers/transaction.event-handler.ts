import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TransactionCreatedEvent } from '../../shared/events/transaction.events';
import { RecurringPatternDetectorService } from '../recurring-pattern-detector.service';

/**
 * Transaction Event Handler for Recurring Transactions Module
 * Handles transaction-related events for recurring pattern detection
 */
@Injectable()
export class TransactionEventHandler {
  private readonly logger = new Logger(TransactionEventHandler.name);

  constructor(
    private readonly recurringPatternDetectorService: RecurringPatternDetectorService,
  ) {}

  /**
   * Handle TransactionCreatedEvent
   * Analyze transaction for recurring patterns when created
   */
  @OnEvent(TransactionCreatedEvent.name)
  async handleTransactionCreated(event: TransactionCreatedEvent): Promise<void> {
    try {
      this.logger.debug('Handling TransactionCreatedEvent for recurring pattern analysis', {
        transactionId: event.transaction.id,
        userId: event.userId,
      });

      // Analyze transaction for recurring patterns
      await this.recurringPatternDetectorService.detectPatternForTransaction(
        event.transaction,
      );

      this.logger.debug('Recurring pattern analysis completed for transaction', {
        transactionId: event.transaction.id,
      });
    } catch (error) {
      this.logger.error('Failed to handle TransactionCreatedEvent for recurring pattern analysis', {
        error: error.message,
        stack: error.stack,
        transactionId: event.transaction.id,
        userId: event.userId,
      });
      // Don't re-throw to avoid breaking the transaction creation flow
    }
  }
}
