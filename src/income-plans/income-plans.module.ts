import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncomePlansService } from './income-plans.service';
import { IncomePlansController } from './income-plans.controller';
import { TransferSuggestionsService } from './transfer-suggestions.service';
import { IncomePlan } from './entities/income-plan.entity';
import { IncomePlanEntry } from './entities/income-plan-entry.entity';
import { ExpensePlan } from '../expense-plans/entities/expense-plan.entity';
import { Transaction } from '../transactions/transaction.entity';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IncomePlan,
      IncomePlanEntry,
      ExpensePlan,
      Transaction,
    ]),
    SharedModule,
  ],
  controllers: [IncomePlansController],
  providers: [IncomePlansService, TransferSuggestionsService],
  exports: [IncomePlansService, TypeOrmModule],
})
export class IncomePlansModule {}
