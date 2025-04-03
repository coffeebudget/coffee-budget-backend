import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { RecurringTransactionGeneratorService } from '../recurring-transactions/recurring-transaction-generator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Category, Tag, BankAccount, RecurringTransaction, CreditCard]),  
  ],
  controllers: [DashboardController],
  providers: [DashboardService, RecurringTransactionGeneratorService],
  exports: [DashboardService],
})
export class DashboardModule {} 