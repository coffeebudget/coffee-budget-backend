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

@Module({
  imports: [
    TypeOrmModule.forFeature([Category, Transaction, RecurringTransaction]),
    SharedModule,
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService, KeywordExtractionService, DefaultCategoriesService],
  exports: [CategoriesService, TypeOrmModule, DefaultCategoriesService],
})
export class CategoriesModule {}