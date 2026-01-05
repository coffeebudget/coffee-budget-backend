import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Transaction } from '../transactions/transaction.entity';
import { DetectedPattern } from './entities/detected-pattern.entity';
import { SimilarityScorerService } from './services/similarity-scorer.service';
import { FrequencyAnalyzerService } from './services/frequency-analyzer.service';
import { PatternDetectionService } from './services/pattern-detection.service';
import { PatternClassificationService } from './services/pattern-classification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, DetectedPattern]),
    ConfigModule,
  ],
  providers: [
    SimilarityScorerService,
    FrequencyAnalyzerService,
    PatternDetectionService,
    PatternClassificationService,
  ],
  exports: [
    SimilarityScorerService,
    FrequencyAnalyzerService,
    PatternDetectionService,
    PatternClassificationService,
  ],
})
export class SmartRecurrenceModule {}
