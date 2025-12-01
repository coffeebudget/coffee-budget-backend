import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Transaction } from './transaction.entity';
import { DuplicateDetectionService } from '../pending-duplicates/duplicate-detection.service';
import { PendingDuplicatesService } from '../pending-duplicates/pending-duplicates.service';
import { TransactionCreationService } from './transaction-creation.service';
import { DuplicateTransactionChoice } from './dto/duplicate-transaction-choice.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Injectable()
export class TransactionDuplicateService {
  private readonly logger = new Logger(TransactionDuplicateService.name);
  private duplicateThreshold = 60; // Default threshold

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly duplicateDetectionService: DuplicateDetectionService,
    private readonly pendingDuplicatesService: PendingDuplicatesService,
    private readonly transactionCreationService: TransactionCreationService,
  ) {}

  /**
   * Find potential duplicate transaction based on amount, type, and execution date
   * Uses $0.01 tolerance for amount matching to handle floating-point precision
   */
  async findPotentialDuplicate(
    amount: number,
    type: 'income' | 'expense',
    executionDate: Date,
    userId: number,
  ): Promise<Transaction | null> {
    if (!executionDate) {
      throw new BadRequestException('Execution date is required for duplicate detection.');
    }

    // Calculate date range for duplicate detection (±1 day)
    const startDate = new Date(executionDate);
    startDate.setDate(startDate.getDate() - 1);

    const endDate = new Date(executionDate);
    endDate.setDate(endDate.getDate() + 1);

    // Use QueryBuilder to apply amount tolerance
    const tolerance = 0.01; // $0.01 tolerance
    const duplicateTransaction = await this.transactionRepository
      .createQueryBuilder('transaction')
      .innerJoin('transaction.user', 'user')
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type })
      .andWhere('transaction.executionDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('ABS(transaction.amount - :amount) <= :tolerance', {
        amount,
        tolerance,
      })
      .orderBy('transaction.createdAt', 'DESC')
      .getOne();

    return duplicateTransaction;
  }

  /**
   * Detect similar transactions using the DuplicateDetectionService
   */
  async detectSimilarTransactions(
    transaction: Transaction,
    userId: number,
  ): Promise<Transaction[]> {
    try {
      // Use the existing DuplicateDetectionService for comprehensive detection
      const result = await this.duplicateDetectionService.detectDuplicates(userId);
      
      // Filter transactions that are similar to the given transaction
      const similarTransactions: Transaction[] = [];
      
      for (const group of result.duplicateGroups) {
        if (group.transactions.some(t => t.id === transaction.id)) {
          similarTransactions.push(...group.transactions.filter(t => t.id !== transaction.id));
        }
      }
      
      return similarTransactions;
    } catch (error) {
      this.logger.error(`Error detecting similar transactions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate similarity score between two transactions
   */
  async calculateSimilarityScore(
    transaction1: Transaction,
    transaction2: Transaction,
  ): Promise<number> {
    try {
      // Use the DuplicateDetectionService's internal calculation
      const result = await this.duplicateDetectionService.checkForDuplicateBeforeCreation(
        {
          description: transaction1.description,
          amount: transaction1.amount,
          type: transaction1.type,
          executionDate: transaction1.executionDate!,
          source: transaction1.source,
        },
        1, // userId - not used in this context
      );

      // If the existing transaction matches transaction2, return the similarity score
      if (result.existingTransaction?.id === transaction2.id) {
        return result.similarityScore;
      }

      // If no existing transaction found, return 0
      if (!result.existingTransaction) {
        return 0;
      }

      // Otherwise, calculate similarity using basic criteria
      return this.calculateBasicSimilarity(transaction1, transaction2);
    } catch (error) {
      this.logger.error(`Error calculating similarity score: ${error.message}`);
      return 0;
    }
  }

  /**
   * Handle duplicate resolution based on user choice
   */
  async handleDuplicateResolution(
    existingTransaction: Transaction | null,
    newTransactionData: any,
    userId: number,
    choice: DuplicateTransactionChoice,
  ): Promise<Transaction> {
    switch (choice) {
      case DuplicateTransactionChoice.MAINTAIN_BOTH:
        // Create new transaction alongside existing one
        return this.transactionCreationService.createAndSaveTransaction(
          newTransactionData,
          userId,
        );

      case DuplicateTransactionChoice.USE_NEW:
        // Create new transaction (existing will be handled separately)
        return this.transactionCreationService.createAndSaveTransaction(
          newTransactionData,
          userId,
        );

      case DuplicateTransactionChoice.KEEP_EXISTING:
        // Return existing transaction without creating new one
        if (!existingTransaction) {
          throw new BadRequestException('No existing transaction to keep');
        }
        return existingTransaction;

      default:
        throw new BadRequestException(`Invalid duplicate choice: ${choice}`);
    }
  }

  /**
   * Handle duplicate confirmation with error details
   */
  async handleDuplicateConfirmation(
    duplicateTransaction: Transaction,
    newTransactionData: CreateTransactionDto | any,
    userId: number,
    userChoice?: DuplicateTransactionChoice,
  ): Promise<Transaction> {
    // If no choice is provided, throw an exception with the duplicate transaction ID
    if (!userChoice) {
      const error = new BadRequestException('Duplicate transaction detected');
      (error as any).duplicateTransactionId = duplicateTransaction.id;
      (error as any).duplicateTransaction = {
        id: duplicateTransaction.id,
        description: duplicateTransaction.description,
        amount: duplicateTransaction.amount,
        executionDate: duplicateTransaction.executionDate,
        type: duplicateTransaction.type,
      };
      throw error;
    }

    const result = await this.handleDuplicateResolution(
      duplicateTransaction,
      newTransactionData,
      userId,
      userChoice,
    );

    return result;
  }

  /**
   * Prevent duplicate creation by checking for existing duplicates
   */
  async preventDuplicateCreation(
    transaction: Transaction,
    userId: number,
  ): Promise<boolean> {
    try {
      const result = await this.duplicateDetectionService.checkForDuplicateBeforeCreation(
        {
          description: transaction.description,
          amount: transaction.amount,
          type: transaction.type,
          executionDate: transaction.executionDate!,
          source: transaction.source,
        },
        userId,
      );

      // Prevent creation if should be prevented, or if it's a duplicate with high similarity
      return result.shouldPrevent || (result.isDuplicate && result.similarityScore >= 90);
    } catch (error) {
      this.logger.error(`Error checking for duplicate prevention: ${error.message}`);
      return false; // Allow creation if check fails
    }
  }

  /**
   * Get current duplicate threshold
   */
  async getDuplicateThreshold(): Promise<number> {
    return this.duplicateThreshold;
  }

  /**
   * Update duplicate threshold
   */
  async updateDuplicateThreshold(threshold: number): Promise<void> {
    if (threshold < 0 || threshold > 100) {
      throw new BadRequestException('Threshold must be between 0 and 100');
    }
    
    this.duplicateThreshold = threshold;
    this.logger.log(`Duplicate threshold updated to ${threshold}%`);
  }

  /**
   * Calculate basic similarity between two transactions
   */
  private calculateBasicSimilarity(transaction1: Transaction, transaction2: Transaction): number {
    let score = 0;
    let maxScore = 0;

    // Amount match (40 points)
    maxScore += 40;
    if (transaction1.amount === transaction2.amount) {
      score += 40;
    }

    // Type match (20 points)
    maxScore += 20;
    if (transaction1.type === transaction2.type) {
      score += 20;
    }

    // Description similarity (30 points)
    maxScore += 30;
    const descSimilarity = this.calculateDescriptionSimilarity(
      transaction1.description,
      transaction2.description,
    );
    score += Math.round(descSimilarity * 30);

    // Date similarity (10 points)
    maxScore += 10;
    if (transaction1.executionDate && transaction2.executionDate) {
      const date1 = new Date(transaction1.executionDate);
      const date2 = new Date(transaction2.executionDate);
      
      if (date1.toDateString() === date2.toDateString()) {
        score += 10;
      }
    }

    return Math.round((score / maxScore) * 100);
  }

  /**
   * Calculate description similarity using basic string comparison
   */
  private calculateDescriptionSimilarity(desc1: string, desc2: string): number {
    if (desc1 === desc2) return 1.0;

    const normalize = (str: string) =>
      str.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const normalizedDesc1 = normalize(desc1);
    const normalizedDesc2 = normalize(desc2);

    if (normalizedDesc1 === normalizedDesc2) return 1.0;

    // Word overlap similarity
    const words1 = normalizedDesc1.split(/\s+/);
    const words2 = normalizedDesc2.split(/\s+/);
    const commonWords = words1.filter((word) => words2.includes(word));
    const wordSimilarity =
      (commonWords.length * 2) / (words1.length + words2.length);

    return Math.max(0, wordSimilarity);
  }
}
