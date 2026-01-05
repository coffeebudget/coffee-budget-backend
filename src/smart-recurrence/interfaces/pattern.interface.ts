import { Transaction } from '../../transactions/transaction.entity';
import { FrequencyPattern } from './frequency.interface';
import { SimilarityScore } from './similarity.interface';

export interface TransactionGroup {
  id: string;
  transactions: Transaction[];
  averageAmount: number;
  categoryId: number | null;
  categoryName: string | null;
  merchantName: string | null;
  representativeDescription: string;
}

export interface DetectedPatternData {
  group: TransactionGroup;
  frequency: FrequencyPattern;
  confidence: {
    overall: number; // 0-100
    breakdown: {
      similarity: number;
      frequency: number;
      occurrenceCount: number;
    };
  };
  firstOccurrence: Date;
  lastOccurrence: Date;
  nextExpectedDate: Date;
}

export interface PatternDetectionCriteria {
  userId: number;
  monthsToAnalyze: number; // Default: 12
  minOccurrences: number; // Default: 2
  minConfidence: number; // Default: 60
  similarityThreshold: number; // Default: 60
}
