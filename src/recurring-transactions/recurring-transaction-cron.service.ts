import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThan, LessThan } from 'typeorm';
import { RecurringTransaction } from './entities/recurring-transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { RecurringTransactionGeneratorService } from './recurring-transaction-generator.service';

@Injectable()
export class RecurringTransactionCronService {
  constructor(
    @InjectRepository(RecurringTransaction)
    private recurringTransactionRepository: Repository<RecurringTransaction>,
    private transactionsService: TransactionsService,
    private generatorService: RecurringTransactionGeneratorService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleRecurringTransactions() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Find recurring transactions due today
    const dueRecurringTransactions = await this.recurringTransactionRepository.find({
      where: {
        status: 'SCHEDULED',
        nextOccurrence: LessThan(tomorrow),
      },
      relations: ['category', 'tags', 'bankAccount', 'creditCard', 'user'],
    });
    
    for (const recurringTransaction of dueRecurringTransactions) {
      // Create the transaction for today
      await this.transactionsService.createAndSaveTransaction({
        description: recurringTransaction.name,
        amount: recurringTransaction.amount,
        type: recurringTransaction.type as "expense" | "income",
        categoryId: recurringTransaction.category.id,
        bankAccountId: recurringTransaction.bankAccount?.id,
        creditCardId: recurringTransaction.creditCard?.id,
        tagIds: recurringTransaction.tags.map(tag => tag.id),
        executionDate: recurringTransaction.nextOccurrence || undefined,
        source: 'recurring',
        status: 'pending'
      }, recurringTransaction.user.id);
      
      // Calculate the next occurrence
      const nextDate = this.calculateNextOccurrence(recurringTransaction);
      
      // Update the recurring transaction with the new next occurrence
      if (nextDate && (!recurringTransaction.endDate || nextDate <= recurringTransaction.endDate)) {
        recurringTransaction.nextOccurrence = nextDate;
        await this.recurringTransactionRepository.save(recurringTransaction);
      } else {
        // Mark as completed if we've reached the end date
        recurringTransaction.status = 'COMPLETED';
        recurringTransaction.nextOccurrence = null;
        await this.recurringTransactionRepository.save(recurringTransaction);
      }
    }
  }

  private calculateNextOccurrence(recurringTransaction: RecurringTransaction): Date | null {
    const currentDate = new Date(recurringTransaction.nextOccurrence || new Date());
    return this.generatorService.calculateNextExecutionDate(currentDate, recurringTransaction); 
  }
} 