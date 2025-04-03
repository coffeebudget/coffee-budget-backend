import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { Transaction } from './transaction.entity';
import { CategoriesModule } from '../categories/categories.module';
import { TagsModule } from '../tags/tags.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { CreditCardsModule } from '../credit-cards/credit-cards.module';
import { SharedModule } from '../shared/shared.module';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';
import { PendingDuplicatesModule } from '../pending-duplicates/pending-duplicates.module';
import { RecurringTransactionsModule } from '../recurring-transactions/recurring-transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      BankAccount,
      CreditCard,
      Category,
      Tag,
      RecurringTransaction
    ]),
    forwardRef(() => CategoriesModule),
    forwardRef(() => TagsModule),
    forwardRef(() => PendingDuplicatesModule),
    forwardRef(() => RecurringTransactionsModule),
    SharedModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService, TypeOrmModule],
})
export class TransactionsModule {}
