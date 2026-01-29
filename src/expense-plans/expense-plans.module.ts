import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpensePlansService } from './expense-plans.service';
import { ExpensePlansController } from './expense-plans.controller';
import { IncomeDistributionService } from './income-distribution.service';
import { IncomeDistributionController } from './income-distribution.controller';
import { ExpensePlanAdjustmentService } from './expense-plan-adjustment.service';
import { ExpensePlanAdjustmentSchedulerService } from './expense-plan-adjustment-scheduler.service';
import { TransactionLinkSuggestionService } from './transaction-link-suggestion.service';
import { TransactionLinkSuggestionsController } from './transaction-link-suggestions.controller';
import { TransactionLinkSuggestionEventHandler } from './event-handlers/transaction-link-suggestion.event-handler';
import { TransactionLinkingService } from './transaction-linking.service';
import { TransactionAutoLinkingEventHandler } from './event-handlers/transaction-auto-linking.event-handler';
import { ExpensePlan } from './entities/expense-plan.entity';
import { ExpensePlanPayment } from './entities/expense-plan-payment.entity';
import { IncomeDistributionRule } from './entities/income-distribution-rule.entity';
import { TransactionLinkSuggestion } from './entities/transaction-link-suggestion.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExpensePlan,
      ExpensePlanPayment,
      IncomeDistributionRule,
      TransactionLinkSuggestion,
      BankAccount,
      Transaction,
      User,
    ]),
    SharedModule,
  ],
  controllers: [
    ExpensePlansController,
    IncomeDistributionController,
    TransactionLinkSuggestionsController,
  ],
  providers: [
    ExpensePlansService,
    IncomeDistributionService,
    ExpensePlanAdjustmentService,
    ExpensePlanAdjustmentSchedulerService,
    TransactionLinkSuggestionService,
    TransactionLinkSuggestionEventHandler,
    TransactionLinkingService,
    TransactionAutoLinkingEventHandler,
  ],
  exports: [
    ExpensePlansService,
    IncomeDistributionService,
    ExpensePlanAdjustmentService,
    TransactionLinkSuggestionService,
    TransactionLinkingService,
    TypeOrmModule,
  ],
})
export class ExpensePlansModule {}
