import { Injectable } from '@nestjs/common';
import { RecurringTransaction } from './entities/recurring-transaction.entity';
import { Transaction } from '../transactions/transaction.entity';

@Injectable()
export class RecurringTransactionGeneratorService {
  
  generateTransactions(recurringTransaction: RecurringTransaction): Transaction[] {
    const transactions: Transaction[] = [];
    const today = this.stripTime(new Date());
    let currentDate = this.stripTime(new Date(recurringTransaction.startDate));
    let generatedCount = 0;

    if (recurringTransaction.status !== 'SCHEDULED') {
      return transactions;
    }

    const effectiveEndDate = recurringTransaction.endDate ? this.stripTime(new Date(recurringTransaction.endDate)) : null;

    while (this.isSameOrBefore(currentDate, today)) {
      if (effectiveEndDate && this.isAfter(currentDate, effectiveEndDate)) {
        break;
      }

      if (recurringTransaction.occurrences && generatedCount >= recurringTransaction.occurrences) {
        break;
      }

      const transaction = this.createTransaction(recurringTransaction, currentDate, 'executed');
      transactions.push(transaction);
      generatedCount++;

      currentDate = this.calculateNextExecutionDate(currentDate, recurringTransaction);
    }

    if (this.canAddPendingTransaction(currentDate, effectiveEndDate, generatedCount, recurringTransaction)) {
      const pendingTransaction = this.createTransaction(recurringTransaction, currentDate, 'pending');
      transactions.push(pendingTransaction);
    }

    return transactions;
  }

  private stripTime(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private isSameOrBefore(date1: Date, date2: Date): boolean {
    return date1.getTime() <= date2.getTime();
  }

  private isAfter(date1: Date, date2: Date): boolean {
    return date1.getTime() > date2.getTime();
  }

  private canAddPendingTransaction(currentDate: Date, effectiveEndDate: Date | null, generatedCount: number, recurringTransaction: RecurringTransaction): boolean {
    return (!recurringTransaction.occurrences || generatedCount < recurringTransaction.occurrences) &&
           (!effectiveEndDate || this.isSameOrBefore(currentDate, effectiveEndDate));
  }

  public calculateNextExecutionDate(currentDate: Date, recurringTransaction: RecurringTransaction): Date {
    const nextDate = new Date(Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      currentDate.getUTCDate()
    ));


    switch (recurringTransaction.frequencyType) {
      case 'monthly':
        nextDate.setUTCMonth(nextDate.getUTCMonth() + recurringTransaction.frequencyEveryN);
        break;
      case 'weekly':
        nextDate.setUTCDate(nextDate.getUTCDate() + (recurringTransaction.frequencyEveryN * 7));
        break;
      case 'daily':
        nextDate.setUTCDate(nextDate.getUTCDate() + recurringTransaction.frequencyEveryN);
        break;
      case 'yearly':
        nextDate.setUTCFullYear(nextDate.getUTCFullYear() + recurringTransaction.frequencyEveryN);
        break;
    }
    return this.stripTime(nextDate);
  }

  private createTransaction(
    recurringTransaction: RecurringTransaction,
    executionDate: Date,
    status: 'executed' | 'pending'
  ): Transaction {
    return {
      description: recurringTransaction.name,
      amount: recurringTransaction.amount,
      type: recurringTransaction.type,
      status,
      executionDate,
      category: recurringTransaction.category,
      bankAccount: recurringTransaction.bankAccount,
      creditCard: recurringTransaction.creditCard,
      tags: recurringTransaction.tags,
      user: recurringTransaction.user,
      source: 'recurring',
      recurringTransaction: recurringTransaction
    } as Transaction;
  }
}
