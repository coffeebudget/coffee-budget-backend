import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanLifecycleService } from './plan-lifecycle.service';
import { ExpensePlan } from '../../expense-plans/entities/expense-plan.entity';
import { IncomePlan } from '../../income-plans/entities/income-plan.entity';
import { SharedModule } from '../shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExpensePlan, IncomePlan]),
    SharedModule,
  ],
  providers: [PlanLifecycleService],
  exports: [PlanLifecycleService],
})
export class PlanLifecycleModule {}
