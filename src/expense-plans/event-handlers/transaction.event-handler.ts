import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import {
  TransactionCreatedEvent,
  TransactionCategorizedEvent,
  TransactionUpdatedEvent,
  TransactionDeletedEvent,
  TransactionImportedEvent,
} from '../../shared/events/transaction.events';
import { ExpensePlan } from '../entities/expense-plan.entity';
import { Transaction } from '../../transactions/transaction.entity';

/**
 * Transaction Event Handler for Expense Plans Module
 *
 * Handles auto-tracking of spending for spending budgets:
 * - When a transaction is created/categorized with a matching category
 * - Updates the spentThisMonth field on the corresponding expense plan
 */
@Injectable()
export class ExpensePlanTransactionEventHandler {
  private readonly logger = new Logger(ExpensePlanTransactionEventHandler.name);

  constructor(
    @InjectRepository(ExpensePlan)
    private readonly expensePlanRepository: Repository<ExpensePlan>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  /**
   * Get the current month in YYYY-MM format
   */
  private getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Get start and end dates for the current month
   */
  private getCurrentMonthDateRange(): { start: Date; end: Date } {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  /**
   * Recalculate spentThisMonth for a spending budget
   * by summing all transactions in the linked category for the current month
   */
  private async recalculateSpentThisMonth(
    expensePlan: ExpensePlan,
    userId: number,
  ): Promise<void> {
    const { start, end } = this.getCurrentMonthDateRange();

    // Find all transactions in this category for the current month
    const transactions = await this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.user', 'user')
      .leftJoinAndSelect('transaction.category', 'category')
      .where('user.id = :userId', { userId })
      .andWhere('category.id = :categoryId', { categoryId: expensePlan.categoryId })
      .andWhere('transaction.executionDate BETWEEN :start AND :end', { start, end })
      .getMany();

    // Sum the absolute values of expenses (negative amounts)
    const totalSpent = transactions.reduce((sum, tx) => {
      const amount = Number(tx.amount);
      // Only count expenses (negative amounts)
      if (amount < 0) {
        return sum + Math.abs(amount);
      }
      return sum;
    }, 0);

    // Update the expense plan
    expensePlan.spentThisMonth = totalSpent;
    await this.expensePlanRepository.save(expensePlan);

    this.logger.debug('Updated spentThisMonth for expense plan', {
      planId: expensePlan.id,
      planName: expensePlan.name,
      spentThisMonth: totalSpent,
      transactionCount: transactions.length,
    });
  }

  /**
   * Find spending budgets that track a specific category
   */
  private async findSpendingBudgetsForCategory(
    categoryId: number,
    userId: number,
  ): Promise<ExpensePlan[]> {
    return this.expensePlanRepository.find({
      where: {
        userId,
        categoryId,
        purpose: 'spending_budget',
        autoTrackCategory: true,
        status: 'active',
      },
    });
  }

  /**
   * Handle TransactionCreatedEvent
   * Update spending tracking if transaction has a category that matches a spending budget
   */
  @OnEvent(TransactionCreatedEvent.name)
  async handleTransactionCreated(event: TransactionCreatedEvent): Promise<void> {
    try {
      const { transaction, userId } = event;

      // Only process if transaction has a category
      if (!transaction.category?.id) {
        return;
      }

      const plans = await this.findSpendingBudgetsForCategory(
        transaction.category.id,
        userId,
      );

      for (const plan of plans) {
        await this.recalculateSpentThisMonth(plan, userId);
      }

      if (plans.length > 0) {
        this.logger.debug(
          `Updated ${plans.length} spending budgets for new transaction`,
          {
            transactionId: transaction.id,
            categoryId: transaction.category.id,
          },
        );
      }
    } catch (error) {
      this.logger.error('Failed to handle TransactionCreatedEvent', {
        error: error.message,
        stack: error.stack,
        transactionId: event.transaction.id,
      });
    }
  }

  /**
   * Handle TransactionCategorizedEvent
   * Update spending tracking when a transaction is categorized
   */
  @OnEvent(TransactionCategorizedEvent.name)
  async handleTransactionCategorized(
    event: TransactionCategorizedEvent,
  ): Promise<void> {
    try {
      const { categoryId, userId } = event;

      const plans = await this.findSpendingBudgetsForCategory(categoryId, userId);

      for (const plan of plans) {
        await this.recalculateSpentThisMonth(plan, userId);
      }

      if (plans.length > 0) {
        this.logger.debug(
          `Updated ${plans.length} spending budgets for categorized transaction`,
          {
            transactionId: event.transactionId,
            categoryId,
          },
        );
      }
    } catch (error) {
      this.logger.error('Failed to handle TransactionCategorizedEvent', {
        error: error.message,
        stack: error.stack,
        transactionId: event.transactionId,
      });
    }
  }

  /**
   * Handle TransactionUpdatedEvent
   * Recalculate spending if transaction category or amount changed
   */
  @OnEvent(TransactionUpdatedEvent.name)
  async handleTransactionUpdated(event: TransactionUpdatedEvent): Promise<void> {
    try {
      const { transaction, userId } = event;

      if (!transaction.category?.id) {
        return;
      }

      const plans = await this.findSpendingBudgetsForCategory(
        transaction.category.id,
        userId,
      );

      for (const plan of plans) {
        await this.recalculateSpentThisMonth(plan, userId);
      }
    } catch (error) {
      this.logger.error('Failed to handle TransactionUpdatedEvent', {
        error: error.message,
        stack: error.stack,
        transactionId: event.transaction.id,
      });
    }
  }

  /**
   * Handle TransactionDeletedEvent
   * Recalculate spending for all spending budgets for the user
   * (we don't know the category, so recalculate all)
   */
  @OnEvent(TransactionDeletedEvent.name)
  async handleTransactionDeleted(event: TransactionDeletedEvent): Promise<void> {
    try {
      const { userId } = event;

      // Find all active spending budgets for this user
      const plans = await this.expensePlanRepository.find({
        where: {
          userId,
          purpose: 'spending_budget',
          autoTrackCategory: true,
          status: 'active',
        },
      });

      for (const plan of plans) {
        if (plan.categoryId) {
          await this.recalculateSpentThisMonth(plan, userId);
        }
      }
    } catch (error) {
      this.logger.error('Failed to handle TransactionDeletedEvent', {
        error: error.message,
        stack: error.stack,
        transactionId: event.transactionId,
      });
    }
  }

  /**
   * Handle TransactionImportedEvent
   * Recalculate spending for all spending budgets when bulk import occurs
   */
  @OnEvent(TransactionImportedEvent.name)
  async handleTransactionImported(event: TransactionImportedEvent): Promise<void> {
    try {
      const { userId } = event;

      // Find all active spending budgets for this user
      const plans = await this.expensePlanRepository.find({
        where: {
          userId,
          purpose: 'spending_budget',
          autoTrackCategory: true,
          status: 'active',
        },
      });

      for (const plan of plans) {
        if (plan.categoryId) {
          await this.recalculateSpentThisMonth(plan, userId);
        }
      }

      this.logger.debug(
        `Recalculated ${plans.length} spending budgets after bulk import`,
        {
          importedCount: event.transactions.length,
        },
      );
    } catch (error) {
      this.logger.error('Failed to handle TransactionImportedEvent', {
        error: error.message,
        stack: error.stack,
      });
    }
  }
}
