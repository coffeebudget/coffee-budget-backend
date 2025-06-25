import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      Category,
      Tag,
      BankAccount,
      CreditCard,
    ]),
  ],
  providers: [],
  exports: [TypeOrmModule],
})
export class SharedModule {}
