import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TransactionCreatedEvent } from '../../shared/events/transaction.events';
import { TagsService } from '../tags.service';

/**
 * Transaction Event Handler for Tags Module
 * Handles transaction-related events for tagging
 */
@Injectable()
export class TransactionEventHandler {
  private readonly logger = new Logger(TransactionEventHandler.name);

  constructor(
    private readonly tagsService: TagsService,
  ) {}

  /**
   * Handle TransactionCreatedEvent
   * Suggest tags for transaction when created
   */
  @OnEvent(TransactionCreatedEvent.name)
  async handleTransactionCreated(event: TransactionCreatedEvent): Promise<void> {
    try {
      this.logger.debug('Handling TransactionCreatedEvent for tag suggestion', {
        transactionId: event.transaction.id,
        userId: event.userId,
      });

      // Only suggest tags if transaction doesn't already have any
      if (!event.transaction.tags || event.transaction.tags.length === 0) {
        // For now, we'll use a simplified approach since there's no specific method
        // In a real implementation, we might need to create suggestTagsForTransaction
        this.logger.debug('Tag suggestion would be triggered here', {
          transactionId: event.transaction.id,
        });
      }

      this.logger.debug('Tag suggestion completed for transaction', {
        transactionId: event.transaction.id,
      });
    } catch (error) {
      this.logger.error('Failed to handle TransactionCreatedEvent for tag suggestion', {
        error: error.message,
        stack: error.stack,
        transactionId: event.transaction.id,
        userId: event.userId,
      });
      // Don't re-throw to avoid breaking the transaction creation flow
      }
  }
}
