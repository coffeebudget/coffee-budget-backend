import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GocardlessController } from './gocardless.controller';
import { GocardlessService } from './gocardless.service';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([BankAccount, CreditCard]),
    TransactionsModule,
  ],
  controllers: [GocardlessController],
  providers: [GocardlessService],
  exports: [GocardlessService],
})
export class GocardlessModule {}
