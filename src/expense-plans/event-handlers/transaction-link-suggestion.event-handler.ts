import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TransactionCreatedEvent,
  TransactionCategorizedEvent,
  TransactionDeletedEvent,
} from '../../shared/events/transaction.events';
import { Transaction } from '../../transactions/transaction.entity';
import { TransactionLinkSuggestionService } from '../transaction-link-suggestion.service';

/**
 * Transaction Link Suggestion Event Handler
 * Handles transaction events to create/invalidate link suggestions
 */
@Injectable()
export class TransactionLinkSuggestionEventHandler {
  private readonly logger = new Logger(TransactionLinkSuggestionEventHandler.name);

  constructor(
    private readonly suggestionService: TransactionLinkSuggestionService,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  /**
   * Handle TransactionCreatedEvent
   * Check if the new transaction should be suggested for linking to expense plans
   */
  @OnEvent(TransactionCreatedEvent.name)
  async handleTransactionCreated(
    event: TransactionCreatedEvent,
  ): Promise<void> {
    try {
      this.logger.debug('Handling TransactionCreatedEvent for link suggestions', {
        transactionId: event.transaction.id,
        userId: event.userId,
      });

      await this.checkForMatchingPlans(event.transaction, event.userId);

      this.logger.debug('Link suggestion check completed for new transaction', {
        transactionId: event.transaction.id,
      });
    } catch (error) {
      this.logger.error(
        'Failed to handle TransactionCreatedEvent for link suggestions',
        {
          error: error.message,
          stack: error.stack,
          transactionId: event.transaction.id,
          userId: event.userId,
        },
      );
      // Don't re-throw to avoid breaking the transaction creation flow
    }
  }

  /**
   * Handle TransactionCategorizedEvent
   * When a transaction gets categorized, check for matching expense plans
   */
  @OnEvent(TransactionCategorizedEvent.name)
  async handleTransactionCategorized(
    event: TransactionCategorizedEvent,
  ): Promise<void> {
    try {
      this.logger.debug(
        'Handling TransactionCategorizedEvent for link suggestions',
        {
          transactionId: event.transactionId,
          categoryId: event.categoryId,
          userId: event.userId,
        },
      );

      // Load the transaction with category relation
      const transaction = await this.transactionRepository.findOne({
        where: { id: event.transactionId },
        relations: ['category'],
      });

      if (!transaction) {
        this.logger.warn('Transaction not found for categorized event', {
          transactionId: event.transactionId,
        });
        return;
      }

      await this.checkForMatchingPlans(transaction, event.userId);

      this.logger.debug(
        'Link suggestion check completed for categorized transaction',
        {
          transactionId: event.transactionId,
        },
      );
    } catch (error) {
      this.logger.error(
        'Failed to handle TransactionCategorizedEvent for link suggestions',
        {
          error: error.message,
          stack: error.stack,
          transactionId: event.transactionId,
          userId: event.userId,
        },
      );
      // Don't re-throw to avoid breaking the categorization flow
    }
  }

  /**
   * Handle TransactionDeletedEvent
   * Invalidate any pending suggestions for the deleted transaction
   */
  @OnEvent(TransactionDeletedEvent.name)
  async handleTransactionDeleted(
    event: TransactionDeletedEvent,
  ): Promise<void> {
    try {
      this.logger.debug(
        'Handling TransactionDeletedEvent for link suggestions',
        {
          transactionId: event.transactionId,
          userId: event.userId,
        },
      );

      await this.suggestionService.invalidateForTransaction(event.transactionId);

      this.logger.debug(
        'Link suggestion invalidation completed for deleted transaction',
        {
          transactionId: event.transactionId,
        },
      );
    } catch (error) {
      this.logger.error(
        'Failed to handle TransactionDeletedEvent for link suggestions',
        {
          error: error.message,
          stack: error.stack,
          transactionId: event.transactionId,
          userId: event.userId,
        },
      );
      // Don't re-throw to avoid breaking the deletion flow
    }
  }

  /**
   * Check if a transaction matches any expense plans and create suggestions
   */
  private async checkForMatchingPlans(
    transaction: Transaction,
    userId: number,
  ): Promise<void> {
    // Need a category to match
    const categoryId = transaction.category?.id;
    if (!categoryId) {
      this.logger.debug('Transaction has no category, skipping link suggestion', {
        transactionId: transaction.id,
      });
      return;
    }

    // Find matching sinking fund plans
    const matchingPlans = await this.suggestionService.findMatchingPlans(
      categoryId,
      userId,
    );

    if (matchingPlans.length === 0) {
      this.logger.debug('No matching expense plans found for transaction', {
        transactionId: transaction.id,
        categoryId,
      });
      return;
    }

    // Create suggestions for each matching plan
    for (const plan of matchingPlans) {
      // Check if suggestion already exists
      const exists = await this.suggestionService.checkSuggestionExists(
        transaction.id,
        plan.id,
      );

      if (exists) {
        this.logger.debug('Suggestion already exists for this combination', {
          transactionId: transaction.id,
          expensePlanId: plan.id,
        });
        continue;
      }

      // Check if transaction is already linked to this plan
      const isLinked = await this.suggestionService.isTransactionLinkedToPlan(
        transaction.id,
        plan.id,
      );

      if (isLinked) {
        this.logger.debug('Transaction already linked to this plan', {
          transactionId: transaction.id,
          expensePlanId: plan.id,
        });
        continue;
      }

      // Create the suggestion
      await this.suggestionService.createSuggestion(transaction, plan, userId);
    }
  }
}
