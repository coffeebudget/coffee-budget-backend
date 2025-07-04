import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccountsService } from './bank-accounts.service';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccount } from './entities/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';
import { UsersModule } from '../users/users.module';
import { CategoriesModule } from '../categories/categories.module';
import { TagsModule } from '../tags/tags.module';
import { SharedModule } from '../shared/shared.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { PendingDuplicatesModule } from '../pending-duplicates/pending-duplicates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankAccount,
      Transaction,
      RecurringTransaction,
      CreditCard,
      Category,
      Tag,
      PendingDuplicate,
    ]),
    UsersModule,
    forwardRef(() => CategoriesModule),
    forwardRef(() => TagsModule),
    SharedModule,
    forwardRef(() => TransactionsModule),
    forwardRef(() => PendingDuplicatesModule),
  ],
  controllers: [BankAccountsController],
  providers: [BankAccountsService],
  exports: [BankAccountsService, TypeOrmModule],
})
export class BankAccountsModule {}
