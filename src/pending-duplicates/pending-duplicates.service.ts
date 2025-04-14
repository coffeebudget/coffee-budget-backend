import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PendingDuplicate } from './entities/pending-duplicate.entity';
import { Transaction } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';
import { CreatePendingDuplicateDto } from './dto/create-pending-duplicate.dto';
import { TransactionOperationsService } from '../shared/transaction-operations.service';
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
      relations: ['existingTransaction', 'existingTransaction.category', 'existingTransaction.tags', 'existingTransaction.bankAccount', 'existingTransaction.creditCard'],
      order: { createdAt: 'DESC' }
    });
  }

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

    return this.pendingDuplicatesRepository.save(pendingDuplicate);
  }

  async resolvePendingDuplicate(
    pendingDuplicateId: number,
    userId: number,
    choice: DuplicateTransactionChoice
  ): Promise<any> {
    const pendingDuplicate = await this.findOne(pendingDuplicateId, userId);
    
    if (!pendingDuplicate) {
      throw new NotFoundException(`Pending duplicate with ID ${pendingDuplicateId} not found`);
    }
    
    let result: {
      existingTransaction: Transaction | null;
      newTransaction: Transaction | null;
      resolved: boolean;
    } = {
      existingTransaction: pendingDuplicate.existingTransaction,
      newTransaction: null,
      resolved: true
    };
    
    if (choice !== DuplicateTransactionChoice.IGNORE) {
      try {
        // Use the shared service instead
        const operationResult = await this.transactionOperationsService.handleDuplicateResolution(
          pendingDuplicate.existingTransaction as Transaction, // Cast to non-null
          pendingDuplicate.newTransactionData,
          userId,
          choice
        );
        
        // Add the resolved property to the result
        result   = {
          ...operationResult,
          resolved: true
        };
      } catch (error) {
        throw error;
      }
    }
    
    // Mark the pending duplicate as resolved
    await this.pendingDuplicatesRepository.save({
      ...pendingDuplicate,
      resolved: true
    });
    
    return result;
  }

  // Use the shared service for operations that were causing circular dependencies
  async findMatchingTransactions(
    userId: number,
    description: string,
    amount: number
  ): Promise<Transaction[]> {
    return this.transactionOperationsService.findMatchingTransactions(
      userId,
      description,
      amount
    );
  }

  async findAllByExistingTransactionId(transactionId: number): Promise<PendingDuplicate[]> {
    return this.pendingDuplicatesRepository.find({
      where: { existingTransaction: { id: transactionId } },
      relations: ['existingTransaction']
    });
  }

  async update(id: number, updateData: Partial<PendingDuplicate>, userId: number): Promise<PendingDuplicate> {
    const pendingDuplicate = await this.pendingDuplicatesRepository.findOne({
      where: { id, user: { id: userId } }
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
        resolved: false 
      },
      relations: ['existingTransaction']
    });
  }

  async delete(id: number, userId: number): Promise<void> {
    const pendingDuplicate = await this.findOne(id, userId);
    
    await this.pendingDuplicatesRepository.delete(id);
  }
}