import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpensePlansService } from './expense-plans.service';
import { ExpensePlansController } from './expense-plans.controller';
import { IncomeDistributionService } from './income-distribution.service';
import { IncomeDistributionController } from './income-distribution.controller';
import { ExpensePlanAdjustmentService } from './expense-plan-adjustment.service';
import { ExpensePlanAdjustmentSchedulerService } from './expense-plan-adjustment-scheduler.service';
import { ExpensePlan } from './entities/expense-plan.entity';
import { ExpensePlanTransaction } from './entities/expense-plan-transaction.entity';
import { IncomeDistributionRule } from './entities/income-distribution-rule.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExpensePlan,
      ExpensePlanTransaction,
      IncomeDistributionRule,
      BankAccount,
      Transaction,
      User,
    ]),
    SharedModule,
  ],
  controllers: [ExpensePlansController, IncomeDistributionController],
  providers: [
    ExpensePlansService,
    IncomeDistributionService,
    ExpensePlanAdjustmentService,
    ExpensePlanAdjustmentSchedulerService,
  ],
  exports: [
    ExpensePlansService,
    IncomeDistributionService,
    ExpensePlanAdjustmentService,
    TypeOrmModule,
  ],
})
export class ExpensePlansModule {}
