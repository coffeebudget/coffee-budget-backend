import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FreeToSpendService } from './free-to-spend.service';
import { FreeToSpendController } from './free-to-spend.controller';
import { Transaction } from '../transactions/transaction.entity';
import { ExpensePlan } from '../expense-plans/entities/expense-plan.entity';
import { SharedModule } from '../shared/shared.module';
import { IncomePlansModule } from '../income-plans/income-plans.module';
import { ExpensePlansModule } from '../expense-plans/expense-plans.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, ExpensePlan]),
    SharedModule,
    IncomePlansModule,
    ExpensePlansModule,
    CategoriesModule,
  ],
  controllers: [FreeToSpendController],
  providers: [FreeToSpendService],
  exports: [FreeToSpendService],
})
export class FreeToSpendModule {}
