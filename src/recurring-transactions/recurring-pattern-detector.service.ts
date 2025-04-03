import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { RecurringTransactionsService } from './recurring-transactions.service';
import { RecurringTransaction } from './entities/recurring-transaction.entity';
import { TransactionOperationsService } from '../shared/transaction-operations.service';

export interface RecurringPattern {
  similarTransactions: Transaction[];
  isRecurring: boolean;
  suggestedFrequency?: string;
  confidence?: number;
  // Add other properties as needed
}

@Injectable()
export class RecurringPatternDetectorService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(RecurringTransaction)
    private recurringTransactionRepository: Repository<RecurringTransaction>,
    @Inject(forwardRef(() => TransactionsService))
    private transactionsService: TransactionsService,
    private transactionOperationsService: TransactionOperationsService,
  ) {}

  async detectAllRecurringPatterns(userId: number): Promise<RecurringPattern[]> {
    const transactions = await this.transactionRepository.find({
      where: { user: { id: userId } },
      order: { executionDate: 'ASC' },
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
      const avgAmount = group.reduce((sum, tx) => sum + Number(tx.amount), 0) / group.length;
      const filtered = group.filter(tx =>
        Math.abs(Number(tx.amount) - avgAmount) <= Math.abs(avgAmount) * 0.4 // Allow more variation
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

    return results.sort((a, b) => b.similarTransactions.length - a.similarTransactions.length);
  }

  async detectPatternForTransaction(transaction: Transaction): Promise<RecurringPattern> {
    const transactions = await this.transactionRepository.find({
      where: { user: { id: transaction.user.id } },
      order: { executionDate: 'ASC' },
    });

    const grouped = transactions.filter(tx =>
      this.isFuzzyMatch(tx.description, transaction.description) &&
      Math.abs(tx.amount - transaction.amount) <= Math.abs(transaction.amount) * 0.25
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

  async detectAndProcessRecurringTransaction(transaction: Transaction): Promise<RecurringTransaction | null> {
    const patternResult = await this.detectPatternForTransaction(transaction);

    if (patternResult.similarTransactions.length < 3) return null;

    const existing = await this.recurringTransactionRepository.findOne({
      where: {
        user: { id: transaction.user.id },
        name: transaction.description,
        amount: transaction.amount,
        frequencyType: transaction.type as 'daily' | 'weekly' | 'monthly' | 'yearly',
      },
      relations: ['category', 'bankAccount', 'creditCard', 'user'],
    });

    if (existing) {
      await this.transactionOperationsService.linkTransactionsToRecurring(patternResult.similarTransactions, existing);
      return existing;
    }

    const name = transaction.description ? 
    (transaction.description.length > 255 ? 
      transaction.description.substring(0, 255) : 
      transaction.description) : 
    'Recurring Transaction';
    const newRecurring = await this.recurringTransactionRepository.save(
      this.recurringTransactionRepository.create({
        name: name,
        amount: transaction.amount,
        category: { id: transaction.category.id },
        startDate: this.findEarliestDate(patternResult.similarTransactions, transaction),
        type: transaction.type,
        frequencyType: transaction.type as 'daily' | 'weekly' | 'monthly' | 'yearly',
        frequencyEveryN: 1,
        status: 'SCHEDULED',
        user: { id: transaction.user.id },
        userConfirmed: false,
        bankAccount: { id: transaction.bankAccount?.id },
        creditCard: { id: transaction.creditCard?.id },
        source: 'PATTERN_DETECTOR',
      })
    );

    await this.transactionOperationsService.linkTransactionsToRecurring(patternResult.similarTransactions, newRecurring);
    return newRecurring;
  }

  async createRecurringTransactionFromPattern(
    pattern: RecurringPattern,
    userId: number
  ): Promise<RecurringTransaction | null> {
    if (!pattern.isRecurring || pattern.similarTransactions.length < 2) {
      return null;
    }

    // Get the first transaction as a template
    const templateTransaction = pattern.similarTransactions[0];
    
    // Create the recurring transaction
    const recurringTransaction = this.recurringTransactionRepository.create({
      name: templateTransaction.description,
      description: `Auto-detected recurring transaction: ${templateTransaction.description}`,
      amount: templateTransaction.amount,
      type: templateTransaction.type,
      frequencyType: pattern.suggestedFrequency as 'daily' | 'weekly' | 'monthly' | 'yearly',
      frequencyEveryN: 1,
      user: { id: userId },
      category: { id: templateTransaction.category.id },
      bankAccount: { id: templateTransaction.bankAccount?.id },
      creditCard: { id: templateTransaction.creditCard?.id },
      source: 'PATTERN_DETECTOR',
      status: 'SCHEDULED',
      userConfirmed: false,
      tags: [],
      startDate: this.findEarliestDate(pattern.similarTransactions, templateTransaction),
    });
    
    // Save the recurring transaction
    const savedRecurringTransaction = await this.recurringTransactionRepository.save(recurringTransaction);
    
    // Link the transactions to the recurring transaction
    await this.transactionOperationsService.linkTransactionsToRecurring(
      pattern.similarTransactions,
      savedRecurringTransaction
    );
    
    return savedRecurringTransaction;
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
    const tokens1 = new Set(this.normalizeDescription(desc1).split(/\s+/));
    const tokens2 = new Set(this.normalizeDescription(desc2).split(/\s+/));

    const intersection = [...tokens1].filter(word => tokens2.has(word)).length;
    const union = new Set([...tokens1, ...tokens2]).size;

    const jaccard = intersection / union;
    return jaccard >= 0.6; // threshold slightly raised for monthly grouping
  }

  private calculateIntervals(transactions: Transaction[]): number[] {
    const dates = transactions
      .map(tx => tx.executionDate)
      .filter(d => d)
      .sort((a, b) => (a!.getTime() - b!.getTime())) as Date[];

    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const diff = Math.round((dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24));
      intervals.push(diff);
    }
    return intervals;
  }

  private classifyFrequency(intervals: number[]): { frequency: string, confidence: number } | null {
    if (intervals.length === 0) return null;

    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const stdDev = Math.sqrt(intervals.map(i => Math.pow(i - avg, 2)).reduce((a, b) => a + b, 0) / intervals.length);

    let frequency: string | null = null;
    if (avg >= 1 && avg <= 3) frequency = 'daily';
    else if (avg >= 6 && avg <= 10) frequency = 'weekly';
    else if (avg >= 25 && avg <= 40) frequency = 'monthly';
    else if (avg >= 360 && avg <= 370) frequency = 'yearly';

    if (!frequency) return null;

    const confidence = Math.max(0.5, 1 - stdDev / avg);
    return { frequency, confidence };
  }

  private findEarliestDate(transactions: Transaction[], currentTransaction: Transaction): Date {
    const dates = transactions
      .map(t => t.executionDate)
      .filter(d => !!d) as Date[];

    if (currentTransaction.executionDate) {
      dates.push(currentTransaction.executionDate);
    }

    return dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : new Date();
  }
}

