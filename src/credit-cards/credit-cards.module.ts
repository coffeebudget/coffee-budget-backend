import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditCardsService } from './credit-cards.service';
import { CreditCardsController } from './credit-cards.controller';
import { CreditCard } from './entities/credit-card.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { SharedModule } from '../shared/shared.module';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreditCard,
      BankAccount,
      Transaction,
      RecurringTransaction,
    ]),
    SharedModule,
  ],
  controllers: [CreditCardsController],
  providers: [CreditCardsService],
  exports: [TypeOrmModule, CreditCardsService],
})
export class CreditCardsModule {}
