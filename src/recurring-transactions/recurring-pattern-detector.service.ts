import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { Logger } from '@nestjs/common';

export interface RecurringPattern {
  similarTransactions: Transaction[];
  isRecurring: boolean;
  suggestedFrequency?: string;
  confidence?: number;
}

/**
 * A simplified version of the pattern detector that only analyzes transaction patterns
 * without linking them to recurring transactions
 */
@Injectable()
export class RecurringPatternDetectorService {
  private readonly logger = new Logger(RecurringPatternDetectorService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}

  async detectAllRecurringPatterns(
    userId: number,
  ): Promise<RecurringPattern[]> {
    const transactions = await this.transactionRepository.find({
      where: { user: { id: userId } },
      order: { executionDate: 'ASC' },
      relations: ['category'],
    });

    const clusters: Map<string, Transaction[]> = new Map();

    for (const tx of transactions) {
      const normDesc = this.normalizeDescription(tx.description);
      let matchedKey: string | null = null;

      for (const key of clusters.keys()) {
        if (this.isFuzzyMatch(key, normDesc)) {
          matchedKey = key;
          break;
        }
      }

      const keyToUse = matchedKey || normDesc;
      if (!clusters.has(keyToUse)) clusters.set(keyToUse, []);
      clusters.get(keyToUse)!.push(tx);
    }

    const results: RecurringPattern[] = [];

    for (const group of clusters.values()) {
      if (group.length < 3) continue;

      // Allow flexible amounts
      const avgAmount =
        group.reduce((sum, tx) => sum + Number(tx.amount), 0) / group.length;
      const filtered = group.filter(
        (tx) =>
          Math.abs(Number(tx.amount) - avgAmount) <= Math.abs(avgAmount) * 0.4, // Allow more variation
      );

      if (filtered.length < 3) continue;

      const intervals = this.calculateIntervals(filtered);
      const pattern = this.classifyFrequency(intervals);
      if (pattern) {
        results.push({
          similarTransactions: filtered,
          isRecurring: true,
          suggestedFrequency: pattern.frequency,
          confidence: pattern.confidence,
        });
      }
    }

    return results.sort(
      (a, b) => b.similarTransactions.length - a.similarTransactions.length,
    );
  }

  async detectPatternForTransaction(
    transaction: Transaction,
  ): Promise<RecurringPattern> {
    const transactions = await this.transactionRepository.find({
      where: { user: { id: transaction.user.id } },
      order: { executionDate: 'ASC' },
    });

    const grouped = transactions.filter(
      (tx) =>
        this.isFuzzyMatch(tx.description, transaction.description) &&
        Math.abs(tx.amount - transaction.amount) <=
          Math.abs(transaction.amount) * 0.25,
    );

    if (grouped.length < 3) {
      return {
        similarTransactions: [],
        isRecurring: false,
      };
    }

    const intervals = this.calculateIntervals(grouped);
    const pattern = this.classifyFrequency(intervals);

    if (!pattern) {
      return {
        similarTransactions: [],
        isRecurring: false,
      };
    }

    return {
      similarTransactions: grouped,
      isRecurring: true,
      suggestedFrequency: pattern.frequency,
      confidence: pattern.confidence,
    };
  }

  private normalizeDescription(desc: string): string {
    return desc
      .toLowerCase()
      .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, '')
      .replace(/\d{1,2}\/\d{4}/g, '')
      .replace(/\d+/g, '')
      .replace(/[^a-z]+/g, ' ')
      .trim();
  }

  private isFuzzyMatch(desc1: string, desc2: string): boolean {
    if (!desc1 || !desc2) return false;

    const normalized1 = this.normalizeDescription(desc1);
    const normalized2 = this.normalizeDescription(desc2);

    return (
      normalized1 === normalized2 ||
      normalized1.includes(normalized2) ||
      normalized2.includes(normalized1)
    );
  }

  private calculateIntervals(transactions: Transaction[]): number[] {
    // Filter transactions that have executionDate before sorting
    const validTransactions = transactions.filter(
      (tx) => tx.executionDate !== undefined && tx.executionDate !== null,
    );

    const sortedTransactions = [...validTransactions].sort((a, b) => {
      const dateA = a.executionDate as Date; // TypeScript cast since we filtered out undefined/null
      const dateB = b.executionDate as Date; // TypeScript cast since we filtered out undefined/null
      return dateA.getTime() - dateB.getTime();
    });

    const intervals: number[] = [];
    for (let i = 1; i < sortedTransactions.length; i++) {
      const dateA = sortedTransactions[i - 1].executionDate as Date;
      const dateB = sortedTransactions[i].executionDate as Date;
      const daysDiff = Math.round(
        (dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24),
      );
      intervals.push(daysDiff);
    }

    return intervals;
  }

  private classifyFrequency(
    intervals: number[],
  ): { frequency: string; confidence: number } | null {
    if (intervals.length < 2) return null;

    // Calculate the average interval
    const avgInterval =
      intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;

    // Classify based on average interval
    if (avgInterval >= 25 && avgInterval <= 35)
      return { frequency: 'monthly', confidence: 0.8 };
    if (avgInterval >= 6 && avgInterval <= 8)
      return { frequency: 'weekly', confidence: 0.8 };
    if (avgInterval >= 350 && avgInterval <= 380)
      return { frequency: 'yearly', confidence: 0.7 };
    if (avgInterval >= 0 && avgInterval <= 3)
      return { frequency: 'daily', confidence: 0.6 };

    return null;
  }
}
