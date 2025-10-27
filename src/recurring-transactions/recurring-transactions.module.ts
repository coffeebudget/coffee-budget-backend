import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecurringTransactionsService } from './recurring-transactions.service';
import { RecurringTransactionGeneratorService } from './recurring-transaction-generator.service';
import { RecurringTransaction } from './entities/recurring-transaction.entity';
import { RecurringTransactionsController } from './recurring-transactions.controller';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { CreditCardsModule } from '../credit-cards/credit-cards.module';
import { SharedModule } from '../shared/shared.module';
import { RecurringPatternDetectorService } from './recurring-pattern-detector.service';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { TransactionEventHandler } from './event-handlers/transaction.event-handler';
import { CategoryEventHandler } from './event-handlers/category.event-handler';

/**
 * Module for recurring transactions - simplified for analytics only
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      RecurringTransaction,
      Category,
      Tag,
      BankAccount,
      CreditCard,
    ]),
    BankAccountsModule,
    CreditCardsModule,
    SharedModule,
  ],
  controllers: [RecurringTransactionsController],
  providers: [
    RecurringTransactionsService,
    RecurringTransactionGeneratorService,
    RecurringPatternDetectorService,
    TransactionEventHandler,
    CategoryEventHandler,
  ],
  exports: [
    RecurringTransactionsService,
    RecurringTransactionGeneratorService,
    RecurringPatternDetectorService,
  ],
})
export class RecurringTransactionsModule {}
