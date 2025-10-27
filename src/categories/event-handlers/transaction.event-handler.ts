import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TransactionCreatedEvent } from '../../shared/events/transaction.events';
import { CategoriesService } from '../categories.service';

/**
 * Transaction Event Handler for Categories Module
 * Handles transaction-related events for categorization
 */
@Injectable()
export class TransactionEventHandler {
  private readonly logger = new Logger(TransactionEventHandler.name);

  constructor(
    private readonly categoriesService: CategoriesService,
  ) {}

  /**
   * Handle TransactionCreatedEvent
   * Suggest category for transaction when created
   */
  @OnEvent(TransactionCreatedEvent.name)
  async handleTransactionCreated(event: TransactionCreatedEvent): Promise<void> {
    try {
      this.logger.debug('Handling TransactionCreatedEvent for category suggestion', {
        transactionId: event.transaction.id,
        userId: event.userId,
      });

      // Only suggest category if transaction doesn't already have one
      if (!event.transaction.category && event.transaction.description) {
        await this.categoriesService.suggestCategoryForDescription(
          event.transaction.description,
          event.userId,
        );
      }

      this.logger.debug('Category suggestion completed for transaction', {
        transactionId: event.transaction.id,
      });
    } catch (error) {
      this.logger.error('Failed to handle TransactionCreatedEvent for category suggestion', {
        error: error.message,
        stack: error.stack,
        transactionId: event.transaction.id,
        userId: event.userId,
      });
      // Don't re-throw to avoid breaking the transaction creation flow
    }
  }
}
