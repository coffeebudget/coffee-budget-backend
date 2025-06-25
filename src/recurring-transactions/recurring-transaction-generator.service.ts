import { Injectable, Logger } from '@nestjs/common';
import { RecurringTransaction } from './entities/recurring-transaction.entity';
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  startOfMonth,
  endOfMonth,
  getDay,
  setDate,
} from 'date-fns';

/**
 * Service for recurring transaction date calculations
 * Simplified to only handle date calculations for analytics
 */
@Injectable()
export class RecurringTransactionGeneratorService {
  private readonly logger = new Logger(
    RecurringTransactionGeneratorService.name,
  );

  /**
   * Calculate the next execution date for a recurring transaction
   * Used primarily for forecasting in the dashboard
   *
   * @param startDate The reference date to calculate from
   * @param recurringTransaction The recurring transaction to calculate for
   * @returns The calculated execution date
   */
  calculateNextExecutionDate(
    startDate: Date,
    recurringTransaction: RecurringTransaction,
  ): Date {
    // If nextExecutionDate is already set on the recurring transaction and is after startDate, return it
    if (
      recurringTransaction.nextOccurrence &&
      new Date(recurringTransaction.nextOccurrence) > startDate
    ) {
      return new Date(recurringTransaction.nextOccurrence);
    }

    // For analytics purposes, use the frequency to calculate a next date
    const frequency = recurringTransaction.frequencyType;
    const everyN = recurringTransaction.frequencyEveryN || 1;

    try {
      switch (frequency) {
        case 'daily':
          return addDays(startDate, everyN);

        case 'weekly': {
          // If day of week is specified, use it
          if (recurringTransaction.dayOfWeek !== undefined) {
            const date = new Date(startDate);
            const currentDay = getDay(date);
            const targetDay = recurringTransaction.dayOfWeek;
            const daysToAdd = (targetDay - currentDay + 7) % 7;

            // If daysToAdd is 0 and we're on the target day, add a week
            return daysToAdd === 0
              ? addWeeks(date, everyN)
              : addDays(date, daysToAdd);
          }
          return addWeeks(startDate, everyN);
        }

        case 'monthly': {
          // If day of month is specified, use it
          if (recurringTransaction.dayOfMonth !== undefined) {
            const date = addMonths(startDate, everyN);
            const daysInMonth = endOfMonth(date).getDate();
            const targetDay = Math.min(
              recurringTransaction.dayOfMonth,
              daysInMonth,
            );
            return setDate(date, targetDay);
          }
          return addMonths(startDate, everyN);
        }

        case 'yearly': {
          // If month and day are specified, use them
          if (
            recurringTransaction.month !== undefined &&
            recurringTransaction.dayOfMonth !== undefined
          ) {
            const date = addYears(startDate, everyN);
            date.setMonth(recurringTransaction.month);

            const daysInMonth = endOfMonth(date).getDate();
            const targetDay = Math.min(
              recurringTransaction.dayOfMonth,
              daysInMonth,
            );
            return setDate(date, targetDay);
          }
          return addYears(startDate, everyN);
        }

        default:
          // Default to returning the start date if we can't calculate
          this.logger.warn(`Unknown frequency type: ${frequency}`);
          return startDate;
      }
    } catch (error) {
      this.logger.error(
        `Error calculating next execution date: ${error.message}`,
      );
      return startDate;
    }
  }
}
