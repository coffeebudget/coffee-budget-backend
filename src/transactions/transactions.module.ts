import { Module } from '@nestjs/common';
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
import { MerchantCategorizationModule } from '../merchant-categorization/merchant-categorization.module';
import { TransactionOperationsService } from './transaction-operations.service';
import { TransactionCreationService } from './transaction-creation.service';
import { TransactionImportService } from './transaction-import.service';
import { TransactionCategorizationService } from './transaction-categorization.service';
import { TransactionBulkService } from './transaction-bulk.service';
import { TransactionDuplicateService } from './transaction-duplicate.service';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';
import { BankAccountEventHandler } from './event-handlers/bank-account.event-handler';
import { CategoryEventHandler } from './event-handlers/category.event-handler';
import { TransactionCategorizationTestService } from './transaction-categorization-test.service';
import { TransactionCategorizationTestController } from './transaction-categorization-test.controller';
import { TransactionMerchantEnrichmentService } from './transaction-merchant-enrichment.service';
import { TransactionMerchantEnrichmentController } from './transaction-merchant-enrichment.controller';

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
    TagsModule,
    PendingDuplicatesModule,
    PreventedDuplicatesModule,
    RecurringTransactionsModule,
    SharedModule,
    BankAccountsModule,
    CreditCardsModule,
    GocardlessModule,
    MerchantCategorizationModule,
  ],
  controllers: [TransactionsController, ImportLogsController, TransactionCategorizationTestController, TransactionMerchantEnrichmentController],
  providers: [
    TransactionsService,
    ImportLogsService,
    TransactionOperationsService,
    TransactionCreationService,
    TransactionImportService,
    TransactionCategorizationService,
    TransactionBulkService,
    TransactionDuplicateService,
    TransactionCategorizationTestService,
    TransactionMerchantEnrichmentService,
    BankAccountEventHandler,
    CategoryEventHandler,
  ],
  exports: [
    TransactionsService,
    ImportLogsService,
    TransactionOperationsService,
    TransactionImportService,
    TransactionCategorizationService,
    TransactionBulkService,
    TransactionDuplicateService,
    TypeOrmModule,
  ],
})
export class TransactionsModule {}
