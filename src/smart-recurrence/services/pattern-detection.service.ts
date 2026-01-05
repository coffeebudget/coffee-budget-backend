import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { subMonths } from 'date-fns';
import { Transaction } from '../../transactions/transaction.entity';
import { SimilarityScorerService } from './similarity-scorer.service';
import { FrequencyAnalyzerService } from './frequency-analyzer.service';
import {
  TransactionGroup,
  DetectedPatternData,
  PatternDetectionCriteria,
} from '../interfaces/pattern.interface';
import { DEFAULT_SIMILARITY_WEIGHTS } from '../interfaces/similarity.interface';

@Injectable()
export class PatternDetectionService {
  private readonly logger = new Logger(PatternDetectionService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly similarityScorer: SimilarityScorerService,
    private readonly frequencyAnalyzer: FrequencyAnalyzerService,
  ) {}

  /**
   * Detect recurring patterns in user's transactions
   * Main entry point for pattern detection
   */
  async detectPatterns(
    criteria: PatternDetectionCriteria,
  ): Promise<DetectedPatternData[]> {
    this.logger.log(`Starting pattern detection for user ${criteria.userId}`);
    this.logger.log(`Analyzing ${criteria.monthsToAnalyze} months of history`);

    // 1. Fetch transactions for analysis period
    const transactions = await this.fetchTransactions(criteria);

    this.logger.log(`Fetched ${transactions.length} transactions for analysis`);

    if (transactions.length < criteria.minOccurrences) {
      this.logger.warn('Not enough transactions for pattern detection');
      return [];
    }

    // 2. Group transactions by similarity
    const groups = await this.groupBySimilarity(
      transactions,
      criteria.similarityThreshold,
    );

    this.logger.log(`Created ${groups.length} transaction groups`);

    // 3. Filter groups by minimum occurrences
    const validGroups = groups.filter(
      (g) => g.transactions.length >= criteria.minOccurrences,
    );

    this.logger.log(
      `${validGroups.length} groups meet minimum occurrence threshold`,
    );

    // 4. Analyze frequency and calculate confidence for each group
    const patterns: DetectedPatternData[] = [];

    for (const group of validGroups) {
      try {
        const frequency = this.frequencyAnalyzer.analyzeFrequency(
          group.transactions,
        );

        // Calculate overall confidence
        const confidence = this.calculateOverallConfidence(
          group,
          frequency,
          criteria,
        );

        // Only include patterns meeting minimum confidence
        if (confidence.overall >= criteria.minConfidence) {
          const pattern: DetectedPatternData = {
            group,
            frequency,
            confidence,
            firstOccurrence: this.getFirstOccurrence(group.transactions),
            lastOccurrence: this.getLastOccurrence(group.transactions),
            nextExpectedDate: frequency.nextExpectedDate,
          };

          patterns.push(pattern);
        }
      } catch (error) {
        this.logger.error(
          `Error analyzing group: ${error.message}`,
          error.stack,
        );
        // Continue with next group
      }
    }

    this.logger.log(
      `Detected ${patterns.length} patterns meeting confidence threshold`,
    );

    // Sort by confidence (highest first)
    return patterns.sort((a, b) => b.confidence.overall - a.confidence.overall);
  }

  /**
   * Fetch transactions for the specified time period
   */
  private async fetchTransactions(
    criteria: PatternDetectionCriteria,
  ): Promise<Transaction[]> {
    const startDate = subMonths(new Date(), criteria.monthsToAnalyze);

    return this.transactionRepository.find({
      where: {
        user: { id: criteria.userId },
        executionDate: MoreThanOrEqual(startDate),
      },
      relations: ['category'],
      order: {
        executionDate: 'ASC',
      },
    });
  }

  /**
   * Group transactions by similarity using multi-criteria scoring
   */
  private async groupBySimilarity(
    transactions: Transaction[],
    threshold: number,
  ): Promise<TransactionGroup[]> {
    const groups: TransactionGroup[] = [];

    for (const transaction of transactions) {
      let matched = false;

      // Try to find existing group with high similarity
      for (const group of groups) {
        const avgSimilarity = this.similarityScorer.calculateGroupSimilarity(
          transaction,
          group.transactions,
          DEFAULT_SIMILARITY_WEIGHTS,
        );

        if (avgSimilarity >= threshold) {
          // Add to existing group
          group.transactions.push(transaction);
          // Update group statistics
          this.updateGroupStatistics(group);
          matched = true;
          break;
        }
      }

      // Create new group if no match found
      if (!matched) {
        const newGroup: TransactionGroup = {
          id: this.generateGroupId(),
          transactions: [transaction],
          averageAmount: Math.abs(Number(transaction.amount)),
          categoryId: transaction.category?.id || null,
          categoryName: transaction.category?.name || null,
          merchantName: transaction.merchantName,
          representativeDescription: transaction.description,
        };

        groups.push(newGroup);
      }
    }

    return groups;
  }

  /**
   * Update group statistics after adding a transaction
   */
  private updateGroupStatistics(group: TransactionGroup): void {
    const amounts = group.transactions.map((t) => Math.abs(Number(t.amount)));
    group.averageAmount =
      amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;

    // Update merchant name to most common
    const merchantCounts = new Map<string, number>();
    for (const t of group.transactions) {
      if (t.merchantName) {
        const count = merchantCounts.get(t.merchantName) || 0;
        merchantCounts.set(t.merchantName, count + 1);
      }
    }

    if (merchantCounts.size > 0) {
      const mostCommon = Array.from(merchantCounts.entries()).sort(
        (a, b) => b[1] - a[1],
      )[0];
      group.merchantName = mostCommon[0];
    }
  }

  /**
   * Calculate overall confidence score for a pattern
   * Combines similarity confidence, frequency confidence, and occurrence count
   */
  private calculateOverallConfidence(
    group: TransactionGroup,
    frequency: any,
    criteria: PatternDetectionCriteria,
  ): {
    overall: number;
    breakdown: {
      similarity: number;
      frequency: number;
      occurrenceCount: number;
    };
  } {
    // 1. Similarity confidence (based on group cohesion)
    const similarityConfidence = this.calculateGroupCohesion(group);

    // 2. Frequency confidence (from frequency analyzer)
    const frequencyConfidence = frequency.confidence;

    // 3. Occurrence count boost
    const occurrenceBoost = this.frequencyAnalyzer.calculateOccurrenceBoost(
      group.transactions.length,
    );

    // Combined confidence with weights
    const baseConfidence =
      similarityConfidence * 0.4 + // 40% weight
      frequencyConfidence * 0.6; // 60% weight

    // Add occurrence boost (capped at 100)
    const overall = Math.min(100, baseConfidence + occurrenceBoost);

    return {
      overall: Math.round(overall),
      breakdown: {
        similarity: Math.round(similarityConfidence),
        frequency: Math.round(frequencyConfidence),
        occurrenceCount: group.transactions.length,
      },
    };
  }

  /**
   * Calculate group cohesion (how similar transactions are to each other)
   */
  private calculateGroupCohesion(group: TransactionGroup): number {
    if (group.transactions.length < 2) return 100;

    const similarities: number[] = [];

    // Calculate pairwise similarities
    for (let i = 0; i < group.transactions.length; i++) {
      for (let j = i + 1; j < group.transactions.length; j++) {
        const score = this.similarityScorer.calculateSimilarity(
          group.transactions[i],
          group.transactions[j],
          DEFAULT_SIMILARITY_WEIGHTS,
        );
        similarities.push(score.total);
      }
    }

    // Average of all pairwise similarities
    const avgCohesion =
      similarities.reduce((sum, s) => sum + s, 0) / similarities.length;

    return avgCohesion;
  }

  private getFirstOccurrence(transactions: Transaction[]): Date {
    const sorted = [...transactions].sort((a, b) => {
      const dateA = a.executionDate || a.createdAt;
      const dateB = b.executionDate || b.createdAt;
      return dateA.getTime() - dateB.getTime();
    });

    return sorted[0].executionDate || sorted[0].createdAt;
  }

  private getLastOccurrence(transactions: Transaction[]): Date {
    const sorted = [...transactions].sort((a, b) => {
      const dateA = a.executionDate || a.createdAt;
      const dateB = b.executionDate || b.createdAt;
      return dateB.getTime() - dateA.getTime();
    });

    return sorted[0].executionDate || sorted[0].createdAt;
  }

  private generateGroupId(): string {
    return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
