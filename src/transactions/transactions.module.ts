import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { Transaction } from './transaction.entity';
import { ImportLog } from './entities/import-log.entity';
import { ImportLogsService } from './import-logs.service';
import { ImportLogsController } from './import-logs.controller';
import { CategoriesModule } from '../categories/categories.module';
import { TagsModule } from '../tags/tags.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { CreditCardsModule } from '../credit-cards/credit-cards.module';
import { SharedModule } from '../shared/shared.module';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { PendingDuplicatesModule } from '../pending-duplicates/pending-duplicates.module';
import { PreventedDuplicatesModule } from '../prevented-duplicates/prevented-duplicates.module';
import { RecurringTransactionsModule } from '../recurring-transactions/recurring-transactions.module';
import { GocardlessModule } from '../gocardless/gocardless.module';
import { TransactionOperationsService } from './transaction-operations.service';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      ImportLog,
      BankAccount,
      CreditCard,
      Category,
      Tag,
      PendingDuplicate,
    ]),
    CategoriesModule,
    forwardRef(() => TagsModule),
    forwardRef(() => PendingDuplicatesModule),
    PreventedDuplicatesModule,
    forwardRef(() => RecurringTransactionsModule),
    SharedModule,
    BankAccountsModule,
    CreditCardsModule,
    GocardlessModule,
  ],
  controllers: [TransactionsController, ImportLogsController],
  providers: [
    TransactionsService,
    ImportLogsService,
    TransactionOperationsService,
  ],
  exports: [
    TransactionsService,
    ImportLogsService,
    TransactionOperationsService,
    TypeOrmModule,
  ],
})
export class TransactionsModule {}
