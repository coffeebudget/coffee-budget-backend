import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { ExpensePlan } from '../expense-plans/entities/expense-plan.entity';
import { IncomePlan } from '../income-plans/entities/income-plan.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      Category,
      Tag,
      BankAccount,
      CreditCard,
      ExpensePlan,
      IncomePlan,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
