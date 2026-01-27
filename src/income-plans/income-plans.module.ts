import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncomePlansService } from './income-plans.service';
import { IncomePlansController } from './income-plans.controller';
import { IncomePlan } from './entities/income-plan.entity';
import { IncomePlanEntry } from './entities/income-plan-entry.entity';
import { Transaction } from '../transactions/transaction.entity';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IncomePlan, IncomePlanEntry, Transaction]),
    SharedModule,
  ],
  controllers: [IncomePlansController],
  providers: [IncomePlansService],
  exports: [IncomePlansService, TypeOrmModule],
})
export class IncomePlansModule {}
