import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { Category } from './entities/category.entity';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { SharedModule } from '../shared/shared.module';
import { KeywordExtractionService } from './keyword-extraction.service';
import { DefaultCategoriesService } from './default-categories.service';
import { KeywordStats } from './entities/keyword-stats.entity';
import { KeywordStatsService } from './keyword-stats.service';
import { ExpenseAnalysisService } from './expense-analysis.service';
import { BudgetManagementService } from './budget-management.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Category,
      Transaction,
      RecurringTransaction,
      KeywordStats,
    ]),
    SharedModule,
  ],
  controllers: [CategoriesController],
  providers: [
    CategoriesService,
    KeywordExtractionService,
    DefaultCategoriesService,
    KeywordStatsService,
    ExpenseAnalysisService,
    BudgetManagementService,
  ],
  exports: [
    CategoriesService,
    TypeOrmModule,
    DefaultCategoriesService,
    KeywordStatsService,
    ExpenseAnalysisService,
  ],
})
export class CategoriesModule {}
