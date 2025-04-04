import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { DuplicateTransactionChoice } from '../transactions/dto/duplicate-transaction-choice.dto';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';
import { User } from '../users/user.entity';
import { Between } from 'typeorm';
import { Logger } from '@nestjs/common';

@Injectable()
export class TransactionOperationsService {
  private readonly logger = new Logger(TransactionOperationsService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(RecurringTransaction)
    private recurringTransactionRepository: Repository<RecurringTransaction>,
    @InjectRepository(PendingDuplicate)
    private pendingDuplicateRepository: Repository<PendingDuplicate>,
  ) {}

  /**
   * Links transactions to a recurring transaction
   */
  async linkTransactionsToRecurring(
    transactions: Transaction[], 
    recurringTransaction: RecurringTransaction
  ): Promise<void> {
    this.logger.debug(`Linking ${transactions.length} transactions to recurring transaction ID: ${recurringTransaction.id}`);
    
    for (const transaction of transactions) {
      try {
        this.logger.debug(`Updating transaction ID: ${transaction.id} to link to recurring transaction ID: ${recurringTransaction.id}`);
        
        // Log the transaction object to see what we're working with
        this.logger.debug(`Transaction before update: ${JSON.stringify({
          id: transaction.id,
          description: transaction.description,
          amount: transaction.amount,
          hasRecurringTransaction: !!transaction.recurringTransaction
        })}`);
        
        // Here's where the update happens - this is likely where the error occurs
        transaction.recurringTransaction = recurringTransaction;
        await this.transactionRepository.save(transaction);
        
        this.logger.debug(`Successfully linked transaction ID: ${transaction.id} to recurring transaction ID: ${recurringTransaction.id}`);
      } catch (error) {
        this.logger.error(`Error linking transaction ID: ${transaction.id}: ${error.message}`);
        this.logger.error(`Error stack: ${error.stack}`);
        
        // Log the query that failed if possible
        if (error.query) {
          this.logger.error(`Failed query: ${error.query}`);
        }
      }
    }
    
    this.logger.debug('Finished linking transactions to recurring transaction');
  }

  /**
   * Creates an automated transaction
   */
  async createAutomatedTransaction(
    transactionData: Partial<Transaction>, 
    userId: number,
    source: 'recurring' | 'csv_import' | 'api',
    sourceReference?: string
  ): Promise<Transaction> {
    // Normalize the amount if type is provided
    if (transactionData.amount !== undefined && transactionData.type) {
      transactionData.amount = this.normalizeAmount(
        transactionData.amount,
        transactionData.type
      );
    }
    
    // Check for duplicates
    if (!transactionData.executionDate) {
      transactionData.executionDate = new Date();
    }

    if (!transactionData.type) {
      transactionData.type = transactionData.amount && transactionData.amount >= 0 ? 'income' : 'expense';
    }

    const duplicateTransaction = await this.findPotentialDuplicate(
      transactionData.amount || 0,
      transactionData.type,
      transactionData.executionDate,
      userId
    );

    if (duplicateTransaction) {
      // Instead of auto-resolving, create a pending duplicate
      await this.createPendingDuplicate(
        duplicateTransaction,
        transactionData,
        userId,
        source,
        sourceReference
      );

      // Return the existing transaction to indicate a duplicate was found
      return duplicateTransaction;
    }

    transactionData.source = source;

    // No duplicate, create the transaction normally
    const transaction = this.transactionRepository.create({
      ...transactionData,
      user: { id: userId }
    });

    const savedTransaction = await this.transactionRepository.save(transaction);

    return savedTransaction;
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
    userId: number
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
        user: { id: userId }
      },
      order: { createdAt: 'DESC' }
    });

    return duplicates.length > 0 ? duplicates[0] : null;
  }

  /**
   * Finds transactions matching specific criteria
   */
  async findMatchingTransactions(
    userId: number,
    description: string,
    amount: number
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
   * Finds recurring transactions matching specific criteria
   */
  async findMatchingRecurringTransaction(
    userId: number,
    description: string,
    amount: number,
    frequencyType: string
  ): Promise<RecurringTransaction | null> {
    return this.recurringTransactionRepository.findOne({
      where: {
        user: { id: userId },
        name: description,
        amount,
        frequencyType: frequencyType as NonNullable<RecurringTransaction['frequencyType']>,
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
    sourceReference: string | null = null
  ): Promise<PendingDuplicate> {
    // Create a basic entity first
    const pendingDuplicate = new PendingDuplicate();
    
    // Then set properties
    pendingDuplicate.existingTransactionData = existingTransaction ? JSON.stringify(existingTransaction) : null;
    pendingDuplicate.newTransactionData = newTransactionData;
    pendingDuplicate.user = { id: userId } as User;
    pendingDuplicate.resolved = false;
    pendingDuplicate.source = source as 'recurring' | 'csv_import' | 'api';
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
    choice: DuplicateTransactionChoice
  ) {
    let newTransaction: Transaction | null = null;

    switch (choice) {
      case DuplicateTransactionChoice.MAINTAIN_BOTH:
        // Create a new transaction with the data
        const createdTransaction = this.transactionRepository.create({
          ...newTransactionData,
          user: { id: userId }
        });
        
        // Save the new transaction and ensure it's a single entity
        const savedTransaction = await this.transactionRepository.save(createdTransaction);
        newTransaction = Array.isArray(savedTransaction) ? savedTransaction[0] : savedTransaction;
        break;

      case DuplicateTransactionChoice.REPLACE:
        // Delete the existing transaction
        await this.transactionRepository.delete({ id: existingTransaction.id });
        
        // Create a new transaction with the data
        const replacementTransaction = this.transactionRepository.create({
          ...newTransactionData,
          user: { id: userId }
        });
        
        // Save the new transaction and ensure it's a single entity
        const savedReplacement = await this.transactionRepository.save(replacementTransaction);
        newTransaction = Array.isArray(savedReplacement) ? savedReplacement[0] : savedReplacement;
        break;

      case DuplicateTransactionChoice.IGNORE:
        // Do nothing, just return the existing transaction
        break;

      default:
        throw new Error(`Invalid choice: ${choice}`);
    }

    return {
      existingTransaction,
      newTransaction
    };
  }

  /**
   * Finds a transaction by ID
   */
  async findTransactionById(id: number, userId: number): Promise<Transaction | null> {
    return this.transactionRepository.findOne({
      where: { id, user: { id: userId } },
      relations: ['category', 'bankAccount', 'creditCard', 'tags', 'user', 'recurringTransaction'],
    });
  }
} 