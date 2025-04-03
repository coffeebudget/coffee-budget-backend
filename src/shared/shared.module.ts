import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionOperationsService } from './transaction-operations.service';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      RecurringTransaction,
      Category,
      Tag,
      BankAccount,
      CreditCard,
      PendingDuplicate
    ]),
  ],
  providers: [TransactionOperationsService],
  exports: [TransactionOperationsService, TypeOrmModule],
})
export class SharedModule {} 