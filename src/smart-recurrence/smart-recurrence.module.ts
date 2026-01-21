import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Transaction } from '../transactions/transaction.entity';
import { DetectedPattern } from './entities/detected-pattern.entity';
import { ExpensePlanSuggestion } from './entities/expense-plan-suggestion.entity';
import { Category } from '../categories/entities/category.entity';
import { SimilarityScorerService } from './services/similarity-scorer.service';
import { FrequencyAnalyzerService } from './services/frequency-analyzer.service';
import { PatternDetectionService } from './services/pattern-detection.service';
import { PatternClassificationService } from './services/pattern-classification.service';
import { SuggestionGeneratorService } from './services/suggestion-generator.service';
import { CategoryFallbackSuggestionService } from './services/category-fallback-suggestion.service';
import { ExpensePlanSuggestionsController } from './controllers/expense-plan-suggestions.controller';
import { ExpensePlansModule } from '../expense-plans/expense-plans.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      DetectedPattern,
      ExpensePlanSuggestion,
      Category,
    ]),
    ConfigModule,
    ExpensePlansModule,
  ],
  controllers: [ExpensePlanSuggestionsController],
  providers: [
    SimilarityScorerService,
    FrequencyAnalyzerService,
    PatternDetectionService,
    PatternClassificationService,
    SuggestionGeneratorService,
    CategoryFallbackSuggestionService,
  ],
  exports: [
    SimilarityScorerService,
    FrequencyAnalyzerService,
    PatternDetectionService,
    PatternClassificationService,
    SuggestionGeneratorService,
    CategoryFallbackSuggestionService,
  ],
})
export class SmartRecurrenceModule {}
