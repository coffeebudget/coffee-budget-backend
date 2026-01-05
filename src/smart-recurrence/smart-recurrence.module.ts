import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { DetectedPattern } from './entities/detected-pattern.entity';
import { SimilarityScorerService } from './services/similarity-scorer.service';
import { FrequencyAnalyzerService } from './services/frequency-analyzer.service';
import { PatternDetectionService } from './services/pattern-detection.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, DetectedPattern])],
  providers: [
    SimilarityScorerService,
    FrequencyAnalyzerService,
    PatternDetectionService,
  ],
  exports: [
    SimilarityScorerService,
    FrequencyAnalyzerService,
    PatternDetectionService,
  ],
})
export class SmartRecurrenceModule {}
