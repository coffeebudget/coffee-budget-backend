import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { PendingDuplicate } from './entities/pending-duplicate.entity';
import { Transaction } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';
import { CreatePendingDuplicateDto } from './dto/create-pending-duplicate.dto';
import { TransactionOperationsService } from '../transactions/transaction-operations.service';
import { DuplicateTransactionChoice } from '../transactions/dto/duplicate-transaction-choice.dto';

@Injectable()
export class PendingDuplicatesService {
  constructor(
    @InjectRepository(PendingDuplicate)
    private pendingDuplicatesRepository: Repository<PendingDuplicate>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    private transactionOperationsService: TransactionOperationsService,
  ) {}

  async findPendingDuplicates(userId: number): Promise<PendingDuplicate[]> {
    return this.pendingDuplicatesRepository.find({
      where: { user: { id: userId }, resolved: false },
      relations: [
        'existingTransaction',
        'existingTransaction.category',
        'existingTransaction.tags',
        'existingTransaction.bankAccount',
        'existingTransaction.creditCard',
      ],
      order: { createdAt: 'DESC' },
    });
  }

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

    return this.pendingDuplicatesRepository.save(pendingDuplicate);
  }

  async resolvePendingDuplicate(
    pendingDuplicateId: number,
    userId: number,
    choice: DuplicateTransactionChoice,
  ): Promise<any> {
    const pendingDuplicate = await this.findOne(pendingDuplicateId, userId);

    if (!pendingDuplicate) {
      throw new NotFoundException(
        `Pending duplicate with ID ${pendingDuplicateId} not found`,
      );
    }

    // Determine if this is a post-import duplicate detection vs import-time duplicate
    const isPostImportDetection = pendingDuplicate.sourceReference?.startsWith(
      'duplicate_detection_',
    );

    // Default result structure
    const result = {
      existingTransaction: pendingDuplicate.existingTransaction,
      newTransaction: null as Transaction | null,
      resolved: true,
    };

    if (isPostImportDetection) {
      // Post-import duplicate detection - both transactions already exist
      await this.handlePostImportDuplicateResolution(
        pendingDuplicate,
        choice,
        userId,
        result,
      );
    } else {
      // Import-time duplicate - new transaction hasn't been created yet
      await this.handleImportTimeDuplicateResolution(
        pendingDuplicate,
        choice,
        userId,
        result,
      );
    }

    // Mark the pending duplicate as resolved
    await this.pendingDuplicatesRepository.save({
      ...pendingDuplicate,
      resolved: true,
    });

    return result;
  }

  /**
   * Handle resolution for post-import duplicate detection (both transactions exist)
   */
  private async handlePostImportDuplicateResolution(
    pendingDuplicate: PendingDuplicate,
    choice: DuplicateTransactionChoice,
    userId: number,
    result: any,
  ): Promise<void> {
    // Find the "new" transaction (which is actually an existing transaction)
    const newTransactionData = pendingDuplicate.newTransactionData;
    const newTransaction = await this.transactionRepository.findOne({
      where: { id: newTransactionData.id, user: { id: userId } },
    });

    if (!newTransaction) {
      throw new NotFoundException('New transaction not found');
    }

    switch (choice) {
      case DuplicateTransactionChoice.MAINTAIN_BOTH:
        // Keep both transactions - do nothing
        result.newTransaction = newTransaction;
        break;

      case DuplicateTransactionChoice.KEEP_EXISTING: {
        // Keep existing transaction, delete the "new" duplicate one
        // CRITICAL FIX: We should only delete newTransaction if it's actually a duplicate
        // For post-import detection, both transactions already exist and are legitimate
        // We should NOT delete any transactions in this case

        // Instead, just mark this duplicate as resolved without deleting anything
        // The user wants to keep the existing transaction and ignore this duplicate detection
        result.newTransaction = null; // Indicate we're not keeping the "new" one
        break;
      }

      case DuplicateTransactionChoice.USE_NEW: {
        // Keep new transaction, delete the existing one
        // CRITICAL FIX: For post-import detection, both transactions are legitimate
        // We should NOT delete any existing transactions that are already in the system

        // Instead, just mark the duplicate as resolved without deleting anything
        // The user prefers the "new" transaction over the "existing" one
        result.existingTransaction = null; // Indicate we're not keeping the existing one
        result.newTransaction = newTransaction; // Keep the "new" one
        break;
      }

      default:
        // Default to keeping both
        result.newTransaction = newTransaction;
    }
  }

  /**
   * Handle resolution for import-time duplicates (new transaction not created yet)
   */
  private async handleImportTimeDuplicateResolution(
    pendingDuplicate: PendingDuplicate,
    choice: DuplicateTransactionChoice,
    userId: number,
    result: any,
  ): Promise<void> {
    // Process based on user choice - use the new enum values
    if (choice !== DuplicateTransactionChoice.KEEP_EXISTING) {
      try {
        // Use the TransactionOperationsService to handle the resolution
        const resolvedTransaction =
          await this.transactionOperationsService.handleDuplicateResolution(
            pendingDuplicate.existingTransaction as Transaction,
            pendingDuplicate.newTransactionData,
            userId,
            choice,
          );

        // Update the result with the resolved transaction
        if (choice === DuplicateTransactionChoice.MAINTAIN_BOTH) {
          result.newTransaction = resolvedTransaction;
        } else if (choice === DuplicateTransactionChoice.USE_NEW) {
          result.existingTransaction = resolvedTransaction;
        }
      } catch (error) {
        throw error;
      }
    }
    // For KEEP_EXISTING, do nothing - the new transaction is simply not created
  }

  // Use the shared service for operations that were causing circular dependencies
  async findMatchingTransactions(
    userId: number,
    description: string,
    amount: number,
  ): Promise<Transaction[]> {
    return this.transactionOperationsService.findMatchingTransactions(
      userId,
      description,
      amount,
    );
  }

  async findAllByExistingTransactionId(
    transactionId: number,
  ): Promise<PendingDuplicate[]> {
    return this.pendingDuplicatesRepository.find({
      where: { existingTransaction: { id: transactionId } },
      relations: ['existingTransaction'],
    });
  }

  async update(
    id: number,
    updateData: Partial<PendingDuplicate>,
    userId: number,
  ): Promise<PendingDuplicate> {
    const pendingDuplicate = await this.pendingDuplicatesRepository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!pendingDuplicate) {
      throw new NotFoundException(`Pending duplicate with ID ${id} not found`);
    }

    Object.assign(pendingDuplicate, updateData);
    return this.pendingDuplicatesRepository.save(pendingDuplicate);
  }

  async findOne(id: number, userId: number): Promise<PendingDuplicate | null> {
    return this.pendingDuplicatesRepository.findOne({
      where: {
        id,
        user: { id: userId },
        resolved: false,
      },
      relations: ['existingTransaction'],
    });
  }

  async delete(id: number, userId: number): Promise<void> {
    const pendingDuplicate = await this.findOne(id, userId);
    if (!pendingDuplicate) {
      throw new NotFoundException(`Pending duplicate with ID ${id} not found`);
    }

    await this.pendingDuplicatesRepository.delete({
      id,
      user: { id: userId },
    });
  }

  /**
   * Bulk resolve multiple pending duplicates with the same choice
   */
  async bulkResolvePendingDuplicates(
    duplicateIds: number[],
    userId: number,
    choice: string,
  ): Promise<{
    resolved: number;
    errors: number;
    details: Array<{ id: number; success: boolean; error?: string }>;
  }> {
    const results: Array<{ id: number; success: boolean; error?: string }> = [];
    let resolved = 0;
    let errors = 0;

    for (const duplicateId of duplicateIds) {
      try {
        await this.resolvePendingDuplicate(duplicateId, userId, choice as any);
        results.push({ id: duplicateId, success: true });
        resolved++;
      } catch (error) {
        results.push({
          id: duplicateId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        errors++;
      }
    }

    return {
      resolved,
      errors,
      details: results,
    };
  }

  /**
   * Bulk delete multiple pending duplicates without resolving them
   */
  async bulkDeletePendingDuplicates(
    duplicateIds: number[],
    userId: number,
  ): Promise<{
    deleted: number;
    errors: number;
  }> {
    let deleted = 0;
    let errors = 0;

    for (const duplicateId of duplicateIds) {
      try {
        await this.delete(duplicateId, userId);
        deleted++;
      } catch {
        errors++;
      }
    }

    return {
      deleted,
      errors,
    };
  }
}
