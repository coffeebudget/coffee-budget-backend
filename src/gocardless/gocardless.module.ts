import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GocardlessController } from './gocardless.controller';
import { GocardlessService } from './gocardless.service';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([BankAccount, CreditCard]),
    forwardRef(() =>
      import('../transactions/transactions.module').then(
        (m) => m.TransactionsModule,
      ),
    ),
  ],
  controllers: [GocardlessController],
  providers: [GocardlessService],
  exports: [GocardlessService],
})
export class GocardlessModule {}
