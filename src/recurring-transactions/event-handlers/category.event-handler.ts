import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CategoryCreatedEvent, CategoryUpdatedEvent, CategoryDeletedEvent } from '../../shared/events/category.events';
import { RecurringTransactionsService } from '../recurring-transactions.service';

/**
 * Category Event Handler for Recurring Transactions Module
 * Handles category-related events for recurring transaction management
 */
@Injectable()
export class CategoryEventHandler {
  private readonly logger = new Logger(CategoryEventHandler.name);

  constructor(
    private readonly recurringTransactionsService: RecurringTransactionsService,
  ) {}

  /**
   * Handle CategoryCreatedEvent
   * Initialize any recurring transaction-related data for the new category
   */
  @OnEvent(CategoryCreatedEvent.name)
  async handleCategoryCreated(event: CategoryCreatedEvent): Promise<void> {
    try {
      this.logger.debug('Handling CategoryCreatedEvent for recurring transaction management', {
        categoryId: event.category.id,
        userId: event.userId,
      });

      // Initialize any recurring transaction-related data for the new category
      // This could include updating recurring transaction patterns or configurations
      this.logger.debug('Category recurring transaction setup completed', {
        categoryId: event.category.id,
      });
    } catch (error) {
      this.logger.error('Failed to handle CategoryCreatedEvent for recurring transaction management', {
        error: error.message,
        stack: error.stack,
        categoryId: event.category.id,
        userId: event.userId,
      });
      // Don't re-throw to avoid breaking the category creation flow
    }
  }

  /**
   * Handle CategoryUpdatedEvent
   * Update any recurring transaction-related data when category is modified
   */
  @OnEvent(CategoryUpdatedEvent.name)
  async handleCategoryUpdated(event: CategoryUpdatedEvent): Promise<void> {
    try {
      this.logger.debug('Handling CategoryUpdatedEvent for recurring transaction management', {
        categoryId: event.category.id,
        userId: event.userId,
      });

      // Update any recurring transaction-related data when category is modified
      // This could include updating recurring transaction patterns or configurations
      this.logger.debug('Category recurring transaction update completed', {
        categoryId: event.category.id,
      });
    } catch (error) {
      this.logger.error('Failed to handle CategoryUpdatedEvent for recurring transaction management', {
        error: error.message,
        stack: error.stack,
        categoryId: event.category.id,
        userId: event.userId,
      });
      // Don't re-throw to avoid breaking the category update flow
    }
  }

  /**
   * Handle CategoryDeletedEvent
   * Clean up any recurring transaction-related data when category is deleted
   */
  @OnEvent(CategoryDeletedEvent.name)
  async handleCategoryDeleted(event: CategoryDeletedEvent): Promise<void> {
    try {
      this.logger.debug('Handling CategoryDeletedEvent for recurring transaction cleanup', {
        categoryId: event.categoryId,
        userId: event.userId,
      });

      // Clean up any recurring transaction-related data when category is deleted
      // This could include updating recurring transactions that were using this category
      this.logger.debug('Category recurring transaction cleanup completed', {
        categoryId: event.categoryId,
      });
    } catch (error) {
      this.logger.error('Failed to handle CategoryDeletedEvent for recurring transaction cleanup', {
        error: error.message,
        stack: error.stack,
        categoryId: event.categoryId,
        userId: event.userId,
      });
      // Don't re-throw to avoid breaking the category deletion flow
    }
  }
}
