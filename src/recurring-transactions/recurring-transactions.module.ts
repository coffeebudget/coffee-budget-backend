import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecurringTransactionsService } from './recurring-transactions.service';
import { RecurringTransactionCronService } from './recurring-transaction-cron.service';
import { RecurringTransactionGeneratorService } from './recurring-transaction-generator.service';
import { RecurringTransaction } from './entities/recurring-transaction.entity';
import { RecurringTransactionsController } from './recurring-transactions.controller';
import { CategoriesModule } from '../categories/categories.module';
import { TagsModule } from '../tags/tags.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { CreditCardsModule } from '../credit-cards/credit-cards.module';
import { SharedModule } from '../shared/shared.module';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringPatternDetectorService } from './recurring-pattern-detector.service';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RecurringTransaction,
      Transaction,
      Category,
      Tag,
      PendingDuplicate,
      BankAccount,
      CreditCard
    ]),
    forwardRef(() => CategoriesModule),
    forwardRef(() => TagsModule),
    BankAccountsModule,
    CreditCardsModule,
    SharedModule,
    forwardRef(() => TransactionsModule),
  ],
  controllers: [RecurringTransactionsController],
  providers: [
    RecurringTransactionsService,
    RecurringTransactionCronService,
    RecurringTransactionGeneratorService,
    RecurringPatternDetectorService,
  ],
  exports: [
    RecurringTransactionsService,
    RecurringTransactionGeneratorService,
    RecurringPatternDetectorService
  ],
})
export class RecurringTransactionsModule {}
