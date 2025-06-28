import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { DuplicateTransactionChoice } from '../transactions/dto/duplicate-transaction-choice.dto';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';
import { User } from '../users/user.entity';
import { Between } from 'typeorm';
import { Logger } from '@nestjs/common';
import { DuplicateDetectionService } from '../pending-duplicates/duplicate-detection.service';
import { PreventedDuplicatesService } from '../prevented-duplicates/prevented-duplicates.service';

@Injectable()
export class TransactionOperationsService {
  private readonly logger = new Logger(TransactionOperationsService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(PendingDuplicate)
    private pendingDuplicateRepository: Repository<PendingDuplicate>,
    public duplicateDetectionService: DuplicateDetectionService,
    private preventedDuplicatesService: PreventedDuplicatesService,
  ) {}

  /**
   * Creates an automated transaction with improved duplicate detection
   */
  async createAutomatedTransaction(
    transactionData: Partial<Transaction>,
    userId: number,
    source: 'csv_import' | 'api',
    sourceReference?: string,
  ): Promise<Transaction | null> {
    // Normalize the amount if type is provided
    if (transactionData.amount !== undefined && transactionData.type) {
      transactionData.amount = this.normalizeAmount(
        transactionData.amount,
        transactionData.type,
      );
    }

    // Set defaults
    if (!transactionData.executionDate) {
      transactionData.executionDate = new Date();
    }

    if (!transactionData.type) {
      transactionData.type =
        transactionData.amount && transactionData.amount >= 0
          ? 'income'
          : 'expense';
    }

    // Use the improved duplicate detection
    const duplicateCheck =
      await this.duplicateDetectionService.checkForDuplicateBeforeCreation(
        {
          description: transactionData.description || '',
          amount: transactionData.amount || 0,
          type: transactionData.type,
          executionDate: transactionData.executionDate,
          source,
        },
        userId,
      );

    if (duplicateCheck.shouldPrevent) {
      // 100% match - prevent creation and log it
      await this.preventedDuplicatesService.createPreventedDuplicate(
        duplicateCheck.existingTransaction!,
        transactionData,
        source,
        sourceReference || null,
        duplicateCheck.similarityScore,
        duplicateCheck.reason,
        { id: userId } as User,
      );

      this.logger.log(
        `Prevented 100% duplicate transaction for user ${userId}: ${transactionData.description} (${transactionData.amount})`,
      );

      // Return null to indicate transaction was prevented
      return null;
    }

    if (duplicateCheck.shouldCreatePending) {
      // 80-99% match - create pending duplicate for manual review
      await this.createPendingDuplicate(
        duplicateCheck.existingTransaction!,
        transactionData,
        userId,
        source,
        sourceReference,
      );

      this.logger.log(
        `Created pending duplicate for user ${userId}: ${transactionData.description} (${duplicateCheck.similarityScore}% match)`,
      );

      // Return the existing transaction to indicate a duplicate was found
      return duplicateCheck.existingTransaction!;
    }

    // No significant duplicate found, create the transaction normally
    transactionData.source = source;

    const transaction = this.transactionRepository.create({
      ...transactionData,
      user: { id: userId },
    });

    return await this.transactionRepository.save(transaction);
  }

  /**
   * Normalizes the amount based on transaction type
   */
  private normalizeAmount(amount: number, type: string): number {
    if (type === 'expense' && amount > 0) {
      return -amount;
    } else if (type === 'income' && amount < 0) {
      return Math.abs(amount);
    }
    return amount;
  }

  /**
   * Finds potential duplicate transactions
   */
  private async findPotentialDuplicate(
    amount: number,
    type: string,
    executionDate: Date,
    userId: number,
  ): Promise<Transaction | null> {
    // Create date range for comparison (same day)
    const startDate = new Date(executionDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(executionDate);
    endDate.setHours(23, 59, 59, 999);

    // Find transactions with the same amount, type, and date
    const duplicates = await this.transactionRepository.find({
      where: {
        amount,
        type: type as NonNullable<Transaction['type']>,
        executionDate: Between(startDate, endDate),
        user: { id: userId },
      },
      order: { createdAt: 'DESC' },
    });

    return duplicates.length > 0 ? duplicates[0] : null;
  }

  /**
   * Finds transactions matching specific criteria
   */
  async findMatchingTransactions(
    userId: number,
    description: string,
    amount: number,
  ): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: {
        user: { id: userId },
        description,
        amount,
      },
      relations: ['category', 'bankAccount', 'creditCard', 'user'],
    });
  }

  /**
   * Creates a pending duplicate
   */
  async createPendingDuplicate(
    existingTransaction: Transaction,
    newTransactionData: any,
    userId: number,
    source: string = 'manual',
    sourceReference: string | null = null,
  ): Promise<PendingDuplicate> {
    // Create a basic entity first
    const pendingDuplicate = new PendingDuplicate();

    // Then set properties
    pendingDuplicate.existingTransactionData = existingTransaction
      ? JSON.stringify(existingTransaction)
      : null;
    pendingDuplicate.newTransactionData = newTransactionData;
    pendingDuplicate.user = { id: userId } as User;
    pendingDuplicate.resolved = false;
    pendingDuplicate.source = source as 'csv_import' | 'api';
    pendingDuplicate.sourceReference = sourceReference || null;

    // Set the relation separately
    if (existingTransaction) {
      pendingDuplicate.existingTransaction = existingTransaction;
    }

    return this.pendingDuplicateRepository.save(pendingDuplicate);
  }

  /**
   * Handles duplicate resolution
   */
  async handleDuplicateResolution(
    existingTransaction: Transaction,
    newTransactionData: any,
    userId: number,
    choice: DuplicateTransactionChoice,
  ): Promise<Transaction> {
    let result: Transaction;

    switch (choice) {
      case DuplicateTransactionChoice.MAINTAIN_BOTH: {
        // Create a new transaction with the data
        const createdTransaction = this.transactionRepository.create({
          ...newTransactionData,
          user: { id: userId },
        });
        const savedTransaction =
          await this.transactionRepository.save(createdTransaction);
        // Ensure we're returning a single entity
        result = Array.isArray(savedTransaction)
          ? savedTransaction[0]
          : savedTransaction;
        break;
      }

      case DuplicateTransactionChoice.KEEP_EXISTING: {
        // Do nothing, keep the existing transaction
        result = existingTransaction;
        break;
      }

      case DuplicateTransactionChoice.USE_NEW: {
        // Update existing transaction with new data
        const updatedTransaction = {
          ...existingTransaction,
          ...newTransactionData,
        };
        const savedUpdated =
          await this.transactionRepository.save(updatedTransaction);
        // Ensure we're returning a single entity
        result = Array.isArray(savedUpdated) ? savedUpdated[0] : savedUpdated;
        break;
      }

      default: {
        // Default to keeping existing
        result = existingTransaction;
      }
    }

    return result;
  }

  /**
   * Find a transaction by ID
   */
  async findTransactionById(
    id: number,
    userId: number,
  ): Promise<Transaction | null> {
    return this.transactionRepository.findOne({
      where: { id, user: { id: userId } },
      relations: ['category', 'bankAccount', 'creditCard', 'tags'],
    });
  }
}
