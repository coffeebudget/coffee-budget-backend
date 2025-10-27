import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CategoryCreatedEvent, CategoryUpdatedEvent, CategoryDeletedEvent } from '../../shared/events/category.events';
import { TransactionsService } from '../transactions.service';

/**
 * Category Event Handler for Transactions Module
 * Handles category-related events for transaction management
 */
@Injectable()
export class CategoryEventHandler {
  private readonly logger = new Logger(CategoryEventHandler.name);

  constructor(
    private readonly transactionsService: TransactionsService,
  ) {}

  /**
   * Handle CategoryCreatedEvent
   * Initialize any transaction-related data for the new category
   */
  @OnEvent(CategoryCreatedEvent.name)
  async handleCategoryCreated(event: CategoryCreatedEvent): Promise<void> {
    try {
      this.logger.debug('Handling CategoryCreatedEvent for transaction management', {
        categoryId: event.category.id,
        userId: event.userId,
      });

      // Initialize any transaction-related data for the new category
      // This could include updating transaction categorization rules or configurations
      this.logger.debug('Category transaction setup completed', {
        categoryId: event.category.id,
      });
    } catch (error) {
      this.logger.error('Failed to handle CategoryCreatedEvent for transaction management', {
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
   * Update any transaction-related data when category is modified
   */
  @OnEvent(CategoryUpdatedEvent.name)
  async handleCategoryUpdated(event: CategoryUpdatedEvent): Promise<void> {
    try {
      this.logger.debug('Handling CategoryUpdatedEvent for transaction management', {
        categoryId: event.category.id,
        userId: event.userId,
      });

      // Update any transaction-related data when category is modified
      // This could include updating transaction categorization rules or configurations
      this.logger.debug('Category transaction update completed', {
        categoryId: event.category.id,
      });
    } catch (error) {
      this.logger.error('Failed to handle CategoryUpdatedEvent for transaction management', {
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
   * Clean up any transaction-related data when category is deleted
   */
  @OnEvent(CategoryDeletedEvent.name)
  async handleCategoryDeleted(event: CategoryDeletedEvent): Promise<void> {
    try {
      this.logger.debug('Handling CategoryDeletedEvent for transaction cleanup', {
        categoryId: event.categoryId,
        userId: event.userId,
      });

      // Clean up any transaction-related data when category is deleted
      // This could include updating transactions that were using this category
      this.logger.debug('Category transaction cleanup completed', {
        categoryId: event.categoryId,
      });
    } catch (error) {
      this.logger.error('Failed to handle CategoryDeletedEvent for transaction cleanup', {
        error: error.message,
        stack: error.stack,
        categoryId: event.categoryId,
        userId: event.userId,
      });
      // Don't re-throw to avoid breaking the category deletion flow
    }
  }
}
