import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { PendingDuplicate } from './entities/pending-duplicate.entity';
import { User } from '../users/user.entity';
import { PreventedDuplicatesService } from '../prevented-duplicates/prevented-duplicates.service';

export interface DuplicateDetectionResult {
  potentialDuplicatesFound: number;
  pendingDuplicatesCreated: number;
  preventedDuplicates: number;
  usersProcessed: number;
  executionTime: string;
  duplicateGroups: Array<{
    transactions: Transaction[];
    reason: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingTransaction?: Transaction;
  similarityScore: number;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  shouldPrevent: boolean; // true for 100% matches
  shouldCreatePending: boolean; // true for 80-99% matches
}

@Injectable()
export class DuplicateDetectionService {
  private readonly logger = new Logger(DuplicateDetectionService.name);
  private isRunning = false;

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(PendingDuplicate)
    private pendingDuplicateRepository: Repository<PendingDuplicate>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private preventedDuplicatesService: PreventedDuplicatesService,
  ) {}

  /**
   * Manual trigger for comprehensive duplicate detection
   * Can be called via API endpoint
   */
  async detectDuplicates(userId?: number): Promise<DuplicateDetectionResult> {
    if (this.isRunning) {
      throw new Error(
        'Duplicate detection is already running. Please wait for it to complete.',
      );
    }

    this.logger.log(
      `Starting duplicate detection${userId ? ` for user ${userId}` : ' for all users'}...`,
    );
    const startTime = Date.now();

    this.isRunning = true;

    try {
      const result = userId
        ? await this.detectDuplicatesForUser(userId)
        : await this.detectDuplicatesForAllUsers();

      const executionTime = `${((Date.now() - startTime) / 1000).toFixed(2)}s`;

      return {
        ...result,
        executionTime,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get the current status of duplicate detection
   */
  getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }

  /**
   * Check if a new transaction would be a duplicate before creating it
   * This is used during import to prevent obvious duplicates
   */
  async checkForDuplicateBeforeCreation(
    transactionData: {
      description: string;
      amount: number;
      type: 'income' | 'expense';
      executionDate: Date;
      source?: string;
    },
    userId: number,
  ): Promise<DuplicateCheckResult> {
    // Get recent transactions (within last 30 days) for performance
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const existingTransactions = await this.transactionRepository.find({
      where: {
        user: { id: userId },
      },
      order: { executionDate: 'DESC' },
    });

    let bestMatch: Transaction | undefined;
    let highestScore = 0;
    let bestReason = '';
    let bestConfidence: 'high' | 'medium' | 'low' = 'low';

    for (const existingTransaction of existingTransactions) {
      const score = this.calculateSimilarityScore(
        transactionData,
        existingTransaction,
      );

      if (score > highestScore) {
        highestScore = score;
        bestMatch = existingTransaction;

        // Determine reason and confidence based on score
        if (score === 100) {
          bestReason = 'Exact match (amount, description, same date)';
          bestConfidence = 'high';
        } else if (score >= 90) {
          bestReason = 'Very high similarity (likely duplicate with minor date/description variance)';
          bestConfidence = 'high';
        } else if (score >= 80) {
          bestReason = 'High similarity (same amount, type, similar description/date)';
          bestConfidence = 'high';
        } else if (score >= 70) {
          bestReason = 'Medium-high similarity (same amount, different date/description)';
          bestConfidence = 'medium';
        } else if (score >= 60) {
          bestReason = 'Medium similarity (partial match)';
          bestConfidence = 'medium';
        } else {
          bestReason = 'Low similarity';
          bestConfidence = 'low';
        }
      }
    }

    const isDuplicate = highestScore >= 60; // Consider 60%+ as potential duplicates
    const shouldPrevent = highestScore >= 98; // Prevent 98%+ matches (near-exact matches only)
    const shouldCreatePending = highestScore >= 70 && highestScore < 98; // Pending for 70-97%

    return {
      isDuplicate,
      existingTransaction: bestMatch,
      similarityScore: highestScore,
      reason: bestReason,
      confidence: bestConfidence,
      shouldPrevent,
      shouldCreatePending,
    };
  }

  /**
   * Calculate similarity score between two transactions
   */
  private calculateSimilarityScore(
    newTransaction: {
      description: string;
      amount: number;
      type: 'income' | 'expense';
      executionDate: Date;
      source?: string;
    },
    existingTransaction: Transaction,
  ): number {
    let score = 0;
    let maxScore = 0;

    // Early rejection: transactions with negative amounts are invalid data
    // Our system stores all amounts as positive values and uses type field to indicate direction
    // Negative amounts indicate data corruption or import issues
    if (newTransaction.amount < 0 || existingTransaction.amount < 0) {
      this.logger.warn(`Rejecting duplicate comparison - negative amount detected:
        New: ${newTransaction.description} | ${newTransaction.amount} | ${newTransaction.type}
        Existing: ${existingTransaction.description} | ${existingTransaction.amount} | ${existingTransaction.type}`);
      return 0; // Not a duplicate - invalid data
    }

    // Amount match (30 points)
    maxScore += 30;
    const amountMatch = this.amountsMatch(
      newTransaction.amount, 
      newTransaction.type,
      existingTransaction.amount, 
      existingTransaction.type
    );
    
    if (amountMatch) {
      score += 30;
    }

    // Type match (10 points)
    maxScore += 10;
    const typeMatch = newTransaction.type === existingTransaction.type;
    if (typeMatch) {
      score += 10;
    }

    // Description match (40 points)
    maxScore += 40;
    const descSimilarity = this.calculateDescriptionSimilarity(
      newTransaction.description,
      existingTransaction.description,
    );
    const descScore = Math.round(descSimilarity * 40);
    score += descScore;

    // Date match (20 points) - Graduated scoring based on date proximity
    maxScore += 20;
    let dateScore = 0;
    let daysDifference = 0;
    if (existingTransaction.executionDate) {
      const newDate = new Date(newTransaction.executionDate);
      const existingDate = new Date(existingTransaction.executionDate);

      // Calculate days difference
      daysDifference = Math.abs(
        Math.floor((newDate.getTime() - existingDate.getTime()) / (1000 * 60 * 60 * 24))
      );

      // Early rejection for transactions too far apart in time
      // Rationale: 14-day window captures bank delays and CSV import timing
      // while rejecting clearly unrelated transactions (recurring patterns from different months)
      if (daysDifference > 14) {
        return 0; // Not a duplicate - too far apart in time
      }

      // Graduated scoring based on date proximity (only for transactions within 14 days)
      if (daysDifference === 0) {
        dateScore = 20; // Same day - 100%
      } else if (daysDifference === 1) {
        dateScore = 16; // ±1 day - 80%
      } else if (daysDifference === 2) {
        dateScore = 12; // ±2 days - 60%
      } else if (daysDifference <= 7) {
        dateScore = 8;  // ±3-7 days - 40%
      }
      // else dateScore stays 0 for >7 days difference

      score += dateScore;
    }

    const finalScore = Math.round((score / maxScore) * 100);

    // Debug logging for transactions with high similarity
    if (finalScore >= 60) {
      const normalizedNew = this.normalizeAmount(newTransaction.amount, newTransaction.type);
      const normalizedExisting = this.normalizeAmount(existingTransaction.amount, existingTransaction.type);

      this.logger.debug(`Similarity calculation:
        New: ${newTransaction.description} | ${newTransaction.amount} | ${newTransaction.type} | ${newTransaction.executionDate}
        Existing: ${existingTransaction.description} | ${existingTransaction.amount} | ${existingTransaction.type} | ${existingTransaction.executionDate}
        Days difference: ${daysDifference}
        Amount comparison: ${newTransaction.amount} → ${normalizedNew} vs ${existingTransaction.amount} → ${normalizedExisting} (${amountMatch ? 'MATCH' : 'NO MATCH'})
        Scores: Amount(${amountMatch ? 30 : 0}/30) Type(${typeMatch ? 10 : 0}/10) Desc(${descScore}/40, ${descSimilarity.toFixed(3)}) Date(${dateScore}/20, ${daysDifference}d)
        Final: ${finalScore}%`);
    }

    return finalScore;
  }

  /**
   * Calculate description similarity using word overlap and Levenshtein distance
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

    // Levenshtein distance similarity
    const maxLength = Math.max(normalizedDesc1.length, normalizedDesc2.length);
    const levenshteinDistance = this.calculateLevenshteinDistance(
      normalizedDesc1,
      normalizedDesc2,
    );
    const levenshteinSimilarity = 1 - levenshteinDistance / maxLength;

    // Return the higher of the two similarities
    return Math.max(wordSimilarity, levenshteinSimilarity);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private calculateLevenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator,
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Process all users for duplicate detection
   */
  private async detectDuplicatesForAllUsers(): Promise<
    Omit<DuplicateDetectionResult, 'executionTime'>
  > {
    const users = await this.userRepository.find({
      select: ['id', 'email'],
    });

    this.logger.log(`Processing duplicate detection for ${users.length} users`);

    let totalPotentialDuplicates = 0;
    let totalPendingDuplicatesCreated = 0;
    const allDuplicateGroups: DuplicateDetectionResult['duplicateGroups'] = [];

    for (const user of users) {
      try {
        const userResult = await this.detectDuplicatesForUser(user.id);
        totalPotentialDuplicates += userResult.potentialDuplicatesFound;
        totalPendingDuplicatesCreated += userResult.pendingDuplicatesCreated;
        allDuplicateGroups.push(...userResult.duplicateGroups);

        if (userResult.potentialDuplicatesFound > 0) {
          this.logger.log(
            `User ${user.email}: Found ${userResult.potentialDuplicatesFound} potential duplicates`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error processing duplicates for user ${user.id}: ${error.message}`,
        );
      }
    }

    return {
      potentialDuplicatesFound: totalPotentialDuplicates,
      pendingDuplicatesCreated: totalPendingDuplicatesCreated,
      preventedDuplicates: 0, // This method is for post-import detection, not prevention
      usersProcessed: users.length,
      duplicateGroups: allDuplicateGroups,
    };
  }

  /**
   * Process a single user for duplicate detection
   */
  private async detectDuplicatesForUser(
    userId: number,
  ): Promise<Omit<DuplicateDetectionResult, 'executionTime'>> {
    // Get all transactions for the user
    const transactions = await this.transactionRepository.find({
      where: { user: { id: userId } },
      order: { executionDate: 'DESC', createdAt: 'DESC' },
      relations: ['bankAccount', 'creditCard', 'category'],
    });

    this.logger.debug(
      `Processing ${transactions.length} transactions for user ${userId}`,
    );

    const duplicateGroups: DuplicateDetectionResult['duplicateGroups'] = [];
    let pendingDuplicatesCreated = 0;

    // 1. Exact match duplicates (highest confidence)
    const exactMatches = await this.findExactMatches(transactions, userId);
    duplicateGroups.push(...exactMatches);

    // 2. Same amount and date (high confidence)
    const amountDateMatches = await this.findAmountDateMatches(
      transactions,
      userId,
    );
    duplicateGroups.push(...amountDateMatches);

    // 3. GoCardless source duplicates (medium confidence)
    const gocardlessMatches = await this.findGocardlessSourceDuplicates(
      transactions,
      userId,
    );
    duplicateGroups.push(...gocardlessMatches);

    // 4. Similar description and amount (medium confidence)
    const similarMatches = await this.findSimilarDescriptionMatches(
      transactions,
      userId,
    );
    duplicateGroups.push(...similarMatches);

    // Create pending duplicates for each group
    for (const group of duplicateGroups) {
      if (group.transactions.length >= 2) {
        // Sort by creation date to identify the original vs duplicates
        const sortedTransactions = [...group.transactions].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        const originalTransaction = sortedTransactions[0];
        const duplicateTransactions = sortedTransactions.slice(1);

        // Create pending duplicates for each duplicate transaction
        for (const duplicateTransaction of duplicateTransactions) {
          // Check if pending duplicate already exists (unresolved)
          const existingPending = await this.pendingDuplicateRepository.findOne(
            {
              where: {
                existingTransaction: { id: originalTransaction.id },
                user: { id: userId },
                resolved: false,
              },
            },
          );

          // Also check if this duplicate pair was already resolved
          // Since newTransactionData is stored as JSON, we need to check differently
          // Using PostgreSQL JSON operators: ->> for text extraction
          const resolvedDuplicates = await this.pendingDuplicateRepository
            .createQueryBuilder('pd')
            .where('pd.userId = :userId', { userId })
            .andWhere('pd.resolved = true')
            .andWhere(
              '((pd."existingTransactionId" = :originalId AND (pd."newTransactionData"->>\'id\')::int = :duplicateId) OR ' +
                '(pd."existingTransactionId" = :duplicateId AND (pd."newTransactionData"->>\'id\')::int = :originalId))',
              {
                originalId: originalTransaction.id,
                duplicateId: duplicateTransaction.id,
              },
            )
            .getOne();

          const alreadyResolved = resolvedDuplicates !== null;

          // Only create a new pending duplicate if neither unresolved nor already resolved
          if (!existingPending && !alreadyResolved) {
            await this.createPendingDuplicate(
              originalTransaction,
              duplicateTransaction,
              userId,
              group.reason,
              group.confidence,
            );
            pendingDuplicatesCreated++;
          }
        }
      }
    }

    const totalPotentialDuplicates = duplicateGroups.reduce(
      (sum, group) => sum + (group.transactions.length - 1), // Don't count the original
      0,
    );

    this.logger.debug(
      `User ${userId}: Found ${totalPotentialDuplicates} potential duplicates, created ${pendingDuplicatesCreated} pending duplicates`,
    );

    return {
      potentialDuplicatesFound: totalPotentialDuplicates,
      pendingDuplicatesCreated,
      preventedDuplicates: 0, // This method is for post-import detection, not prevention
      usersProcessed: 1,
      duplicateGroups,
    };
  }

  /**
   * Find exact matches (same amount, description, date, source)
   */
  private async findExactMatches(
    transactions: Transaction[],
    _userId: number,
  ): Promise<DuplicateDetectionResult['duplicateGroups']> {
    const groups: DuplicateDetectionResult['duplicateGroups'] = [];
    const processed = new Set<number>();

    for (const transaction of transactions) {
      if (processed.has(transaction.id) || !transaction.executionDate) continue;

      const exactMatches = transactions.filter(
        (t) =>
          t.id !== transaction.id &&
          !processed.has(t.id) &&
          t.executionDate &&
          t.amount === transaction.amount &&
          t.description === transaction.description &&
          t.type === transaction.type &&
          this.isSameDay(t.executionDate!, transaction.executionDate!) &&
          t.source === transaction.source,
      );

      if (exactMatches.length > 0) {
        const group = [transaction, ...exactMatches];
        group.forEach((t) => processed.add(t.id));

        groups.push({
          transactions: group,
          reason: 'Exact match (amount, description, date, source)',
          confidence: 'high',
        });
      }
    }

    return groups;
  }

  /**
   * Find transactions with same amount and date but different descriptions
   */
  private async findAmountDateMatches(
    transactions: Transaction[],
    _userId: number,
  ): Promise<DuplicateDetectionResult['duplicateGroups']> {
    const groups: DuplicateDetectionResult['duplicateGroups'] = [];
    const processed = new Set<number>();

    for (const transaction of transactions) {
      if (processed.has(transaction.id) || !transaction.executionDate) continue;

      const matches = transactions.filter(
        (t) =>
          t.id !== transaction.id &&
          !processed.has(t.id) &&
          t.executionDate &&
          this.amountsMatch(t.amount, t.type, transaction.amount, transaction.type) &&
          this.isSameDay(t.executionDate!, transaction.executionDate!) &&
          t.description !== transaction.description, // Different descriptions
      );

      if (matches.length > 0) {
        const group = [transaction, ...matches];
        group.forEach((t) => processed.add(t.id));

        groups.push({
          transactions: group,
          reason: 'Same amount and date, different descriptions',
          confidence: 'high',
        });
      }
    }

    return groups;
  }

  /**
   * Find potential GoCardless duplicates (same external transaction ID or very similar)
   */
  private async findGocardlessSourceDuplicates(
    transactions: Transaction[],
    _userId: number,
  ): Promise<DuplicateDetectionResult['duplicateGroups']> {
    const groups: DuplicateDetectionResult['duplicateGroups'] = [];
    const processed = new Set<number>();

    // Get GoCardless transactions
    const gocardlessTransactions = transactions.filter(
      (t) => t.source === 'gocardless',
    );

    for (const transaction of gocardlessTransactions) {
      if (processed.has(transaction.id) || !transaction.executionDate) continue;

      const matches = gocardlessTransactions.filter(
        (t) =>
          t.id !== transaction.id &&
          !processed.has(t.id) &&
          t.executionDate &&
          this.amountsMatch(t.amount, t.type, transaction.amount, transaction.type) &&
          this.isSameDay(t.executionDate!, transaction.executionDate!), // Same day only
      );

      if (matches.length > 0) {
        const group = [transaction, ...matches];
        group.forEach((t) => processed.add(t.id));

        groups.push({
          transactions: group,
          reason: 'GoCardless duplicates (same amount and date)',
          confidence: 'high',
        });
      }
    }

    return groups;
  }

  /**
   * Find transactions with similar descriptions and same amount
   */
  private async findSimilarDescriptionMatches(
    transactions: Transaction[],
    _userId: number,
  ): Promise<DuplicateDetectionResult['duplicateGroups']> {
    const groups: DuplicateDetectionResult['duplicateGroups'] = [];
    const processed = new Set<number>();

    for (const transaction of transactions) {
      if (processed.has(transaction.id) || !transaction.executionDate) continue;

      const matches = transactions.filter(
        (t) =>
          t.id !== transaction.id &&
          !processed.has(t.id) &&
          t.executionDate &&
          this.amountsMatch(t.amount, t.type, transaction.amount, transaction.type) &&
          this.isSameDay(t.executionDate!, transaction.executionDate!) && // Same day only
          this.isSimilarDescription(t.description, transaction.description),
      );

      if (matches.length > 0) {
        const group = [transaction, ...matches];
        group.forEach((t) => processed.add(t.id));

        groups.push({
          transactions: group,
          reason: 'Similar descriptions, same amount and date',
          confidence: 'medium',
        });
      }
    }

    return groups;
  }

  /**
   * Create a pending duplicate with detailed information
   */
  private async createPendingDuplicate(
    originalTransaction: Transaction,
    duplicateTransaction: Transaction,
    userId: number,
    reason: string,
    confidence: string,
  ): Promise<PendingDuplicate> {
    const pendingDuplicate = new PendingDuplicate();

    pendingDuplicate.existingTransaction = originalTransaction;
    // Store as object, not string - TypeORM 'json' column type expects objects
    pendingDuplicate.existingTransactionData = {
      ...originalTransaction,
      detectionReason: reason,
      confidence,
    };
    pendingDuplicate.newTransactionData = {
      ...duplicateTransaction,
      id: duplicateTransaction.id,
      detectionReason: reason,
      confidence,
    };
    pendingDuplicate.user = { id: userId } as User;
    pendingDuplicate.resolved = false;
    pendingDuplicate.source = 'api';
    pendingDuplicate.sourceReference = `duplicate_detection_${confidence}_${Date.now()}`;

    return this.pendingDuplicateRepository.save(pendingDuplicate);
  }

  /**
   * Helper methods
   */
  private isSameDay(date1: Date, date2: Date): boolean {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.toDateString() === d2.toDateString();
  }

  private normalizeAmount(amount: number, type: 'income' | 'expense'): number {
    if (type === 'expense') {
      return -Math.abs(amount); // Expenses should always be negative
    } else {
      return Math.abs(amount); // Income should always be positive
    }
  }

  private amountsMatch(
    amount1: number,
    type1: 'income' | 'expense',
    amount2: number,
    type2: 'income' | 'expense',
    tolerance: number = 0.01 // Default $0.01 tolerance for floating-point differences
  ): boolean {
    // Only compare if same transaction type
    if (type1 !== type2) return false;

    const normalized1 = this.normalizeAmount(amount1, type1);
    const normalized2 = this.normalizeAmount(amount2, type2);

    // Exact match
    if (normalized1 === normalized2) return true;

    // Near match within tolerance (handles floating-point rounding and currency conversion)
    return Math.abs(normalized1 - normalized2) <= tolerance;
  }

  private isSimilarDescription(desc1: string, desc2: string): boolean {
    if (!desc1 || !desc2) return false;

    // Normalize descriptions
    const normalize = (str: string) =>
      str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalized1 = normalize(desc1);
    const normalized2 = normalize(desc2);

    // Check if one contains the other or they share significant common words
    if (
      normalized1.includes(normalized2) ||
      normalized2.includes(normalized1)
    ) {
      return true;
    }

    // Check word similarity
    const words1 = desc1
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const words2 = desc2
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return false;

    const commonWords = words1.filter((w) => words2.includes(w));
    const similarity =
      commonWords.length / Math.max(words1.length, words2.length);

    return similarity >= 0.6; // 60% word similarity
  }


}
