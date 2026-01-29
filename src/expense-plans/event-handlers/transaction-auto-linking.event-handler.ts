import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TransactionCreatedEvent,
  TransactionCategorizedEvent,
} from '../../shared/events/transaction.events';
import { Transaction } from '../../transactions/transaction.entity';
import { TransactionLinkingService } from '../transaction-linking.service';

/**
 * Transaction Auto-Linking Event Handler
 *
 * Handles transaction events to automatically link transactions
 * to expense plans that have autoTrackCategory enabled.
 *
 * This is different from TransactionLinkSuggestionEventHandler:
 * - Suggestions: User must approve before linking
 * - Auto-linking: Links happen automatically (no approval needed)
 */
@Injectable()
export class TransactionAutoLinkingEventHandler {
  private readonly logger = new Logger(TransactionAutoLinkingEventHandler.name);

  constructor(
    private readonly linkingService: TransactionLinkingService,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  /**
   * Handle TransactionCreatedEvent
   * Auto-link to expense plans with matching category and autoTrackCategory enabled
   */
  @OnEvent(TransactionCreatedEvent.name)
  async handleTransactionCreated(
    event: TransactionCreatedEvent,
  ): Promise<void> {
    try {
      this.logger.debug('Handling TransactionCreatedEvent for auto-linking', {
        transactionId: event.transaction.id,
        userId: event.userId,
      });

      await this.processAutoLinking(event.transaction, event.userId);

      this.logger.debug('Auto-linking check completed for new transaction', {
        transactionId: event.transaction.id,
      });
    } catch (error) {
      this.logger.error(
        'Failed to handle TransactionCreatedEvent for auto-linking',
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
   * When a transaction gets categorized, check for auto-track plans
   */
  @OnEvent(TransactionCategorizedEvent.name)
  async handleTransactionCategorized(
    event: TransactionCategorizedEvent,
  ): Promise<void> {
    try {
      this.logger.debug(
        'Handling TransactionCategorizedEvent for auto-linking',
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

      await this.processAutoLinking(transaction, event.userId);

      this.logger.debug(
        'Auto-linking check completed for categorized transaction',
        {
          transactionId: event.transactionId,
        },
      );
    } catch (error) {
      this.logger.error(
        'Failed to handle TransactionCategorizedEvent for auto-linking',
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
   * Process auto-linking for a transaction
   */
  private async processAutoLinking(
    transaction: Transaction,
    userId: number,
  ): Promise<void> {
    // Need a category to match
    const categoryId = transaction.category?.id;
    if (!categoryId) {
      this.logger.debug('Transaction has no category, skipping auto-linking', {
        transactionId: transaction.id,
      });
      return;
    }

    // Only link expense transactions (negative amounts)
    if (Number(transaction.amount) >= 0) {
      this.logger.debug(
        'Transaction is not an expense, skipping auto-linking',
        {
          transactionId: transaction.id,
          amount: transaction.amount,
        },
      );
      return;
    }

    // Find auto-track plans matching this category
    const autoTrackPlans = await this.linkingService.findAutoTrackPlans(
      categoryId,
      userId,
    );

    if (autoTrackPlans.length === 0) {
      this.logger.debug('No auto-track plans found for this category', {
        transactionId: transaction.id,
        categoryId,
      });
      return;
    }

    // Link to each matching plan
    for (const plan of autoTrackPlans) {
      // Check if already linked
      const isLinked = await this.linkingService.isTransactionLinked(
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

      // Create the auto-link
      await this.linkingService.createAutoLinkedPayment(plan, transaction);

      this.logger.log('Auto-linked transaction to expense plan', {
        transactionId: transaction.id,
        expensePlanId: plan.id,
        planName: plan.name,
      });
    }
  }
}
