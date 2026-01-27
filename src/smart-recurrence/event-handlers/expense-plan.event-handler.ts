import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ExpensePlanDeletedEvent } from '../../shared/events/expense-plan.events';
import { SuggestionGeneratorService } from '../services/suggestion-generator.service';

/**
 * Expense Plan Event Handler for Smart Recurrence Module
 * Handles expense plan lifecycle events to maintain suggestion consistency
 */
@Injectable()
export class ExpensePlanEventHandler {
  private readonly logger = new Logger(ExpensePlanEventHandler.name);

  constructor(
    private readonly suggestionGenerator: SuggestionGeneratorService,
  ) {}

  /**
   * Handle ExpensePlanDeletedEvent
   * Reset linked suggestion to pending when expense plan is deleted
   */
  @OnEvent(ExpensePlanDeletedEvent.name)
  async handleExpensePlanDeleted(
    event: ExpensePlanDeletedEvent,
  ): Promise<void> {
    try {
      this.logger.debug(
        'Handling ExpensePlanDeletedEvent for suggestion reset',
        {
          expensePlanId: event.expensePlanId,
          userId: event.userId,
        },
      );

      await this.suggestionGenerator.resetSuggestionForDeletedExpensePlan(
        event.userId,
        event.expensePlanId,
      );

      this.logger.debug('Suggestion reset completed for deleted expense plan', {
        expensePlanId: event.expensePlanId,
      });
    } catch (error) {
      this.logger.error(
        'Failed to handle ExpensePlanDeletedEvent for suggestion reset',
        {
          error: error.message,
          stack: error.stack,
          expensePlanId: event.expensePlanId,
          userId: event.userId,
        },
      );
      // Don't re-throw to avoid breaking the deletion flow
    }
  }
}
