import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RecurringTransaction } from './entities/recurring-transaction.entity';
import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';
import { UpdateRecurringTransactionDto } from './dto/update-recurring-transaction.dto';
import { User } from '../users/user.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { RecurringTransactionGeneratorService } from './recurring-transaction-generator.service';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { Logger } from '@nestjs/common';
import { RecurringPatternDetectorService } from './recurring-pattern-detector.service';
import { TransactionOperationsService } from '../shared/transaction-operations.service';

@Injectable()
export class RecurringTransactionsService {
  private readonly logger = new Logger(RecurringTransactionsService.name);

  constructor(
    @InjectRepository(RecurringTransaction)
    private recurringTransactionRepository: Repository<RecurringTransaction>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectRepository(Tag)
    private tagRepository: Repository<Tag>,
    @InjectRepository(BankAccount)
    private bankAccountRepository: Repository<BankAccount>,
    @InjectRepository(CreditCard)
    private creditCardRepository: Repository<CreditCard>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    private recurringTransactionGeneratorService: RecurringTransactionGeneratorService,
    private transactionsService: TransactionsService,
    private transactionOperationsService: TransactionOperationsService,
    private recurringPatternDetectorService: RecurringPatternDetectorService,
  ) {}

  async create(createRecurringTransactionDto: CreateRecurringTransactionDto, user: User): Promise<RecurringTransaction> {
    // Ensure name is not too long
    if (createRecurringTransactionDto.name && createRecurringTransactionDto.name.length > 255) {
      createRecurringTransactionDto.name = createRecurringTransactionDto.name.substring(0, 255);
    }

    if (!createRecurringTransactionDto.categoryId) {
      throw new BadRequestException('Category ID is required');
    }

    const category = await this.categoryRepository.findOne({
      where: { id: createRecurringTransactionDto.categoryId, user: { id: user.id } }
    });
    if (!category) {
      throw new NotFoundException(`Category with ID ${createRecurringTransactionDto.categoryId} not found`);
    }

    let tags: Tag[] = [];
    if (createRecurringTransactionDto.tagIds?.length) {
      tags = await this.tagRepository.find({
        where: { id: In(createRecurringTransactionDto.tagIds), user: { id: user.id } }
      });
      if (tags.length !== createRecurringTransactionDto.tagIds.length) {
        throw new NotFoundException('One or more tags not found');
      }
    }

    const bankAccount = createRecurringTransactionDto.bankAccountId ?
      await this.bankAccountRepository.findOne({ where: { id: createRecurringTransactionDto.bankAccountId, user: { id: user.id } } }) : null;
    const creditCard = createRecurringTransactionDto.creditCardId ?
      await this.creditCardRepository.findOne({ where: { id: createRecurringTransactionDto.creditCardId, user: { id: user.id } } }) : null;

    if (!bankAccount && !creditCard) {
      throw new BadRequestException('Either bankAccountId or creditCardId must be provided');
    }

    if (createRecurringTransactionDto.source === 'MANUAL') {
      createRecurringTransactionDto.userConfirmed = true; // This is a manual transaction, so it is confirmed by the user
    }

    const recurringTransaction = this.recurringTransactionRepository.create({
      ...createRecurringTransactionDto,
      user,
      category,
      tags,
      bankAccount,
      creditCard,
    });

    // Validate endDate if provided
    if (recurringTransaction.endDate) {
      const endDate = new Date(recurringTransaction.endDate);
      if (isNaN(endDate.getTime())) {
        this.logger.warn(`Invalid endDate detected in create: ${recurringTransaction.endDate}, setting to null`);
        recurringTransaction.endDate = null;
      }
    }

    // Save the recurring transaction first to get an ID
    const savedRecurringTransaction = await this.recurringTransactionRepository.save(recurringTransaction);

    let transactions: Transaction[] = [];

    if (savedRecurringTransaction.source !== 'PATTERN_DETECTOR' || savedRecurringTransaction.userConfirmed) {
      transactions = this.recurringTransactionGeneratorService.generateTransactions(savedRecurringTransaction);
    }

    if (transactions.length > 0) {  
      // Create proper transaction objects with all required fields
      const transactionsToCreate = transactions.map(transaction => {
        return {
          description: transaction.description,
          amount: transaction.amount,
          type: transaction.type,
          status: transaction.status,
          executionDate: transaction.executionDate,
          category: { id: category.id },
          bankAccount: bankAccount ? { id: bankAccount.id } : null,
          creditCard: creditCard ? { id: creditCard.id } : null,
          tags: tags.length > 0 ? tags.map(tag => ({ id: tag.id })) : [],
          user: { id: user.id },
          source: savedRecurringTransaction.source || 'recurring',      
          recurringTransaction: { id: savedRecurringTransaction.id }
        };
      });

        // Use TypeORM's save method to batch insert
      for (const transactionData of transactionsToCreate) {
        try {
          await this.transactionsService.createAutomatedTransaction(
            transactionData as Partial<Transaction>,
            user.id,
            'recurring',
            `recurring_id:${savedRecurringTransaction.id}`
          );
        } catch (error) {
          this.logger.error(`Error creating transaction: ${error.message}`);
        }
      }
    }
    
    const pendingTransaction = transactions.find(t => t.status === 'pending');
    if (pendingTransaction) {
      savedRecurringTransaction.nextOccurrence = this.recurringTransactionGeneratorService.calculateNextExecutionDate(
        pendingTransaction.executionDate || new Date(),
        savedRecurringTransaction
      );
      
      // Update the recurring transaction with the next occurrence date
      return this.recurringTransactionRepository.save(savedRecurringTransaction);
    }

    return savedRecurringTransaction;
  }

  async findAll(userId: number): Promise<RecurringTransaction[]> {
    return this.recurringTransactionRepository.find({
      where: { user: { id: userId } },
      relations: ['category', 'tags', 'bankAccount', 'creditCard'],
    });
  }

  async findOne(id: number, userId: number): Promise<RecurringTransaction> {
    const recurringTransaction = await this.recurringTransactionRepository.findOne({
      where: { id, user: { id: userId } },
      relations: ['category', 'tags', 'bankAccount', 'creditCard'],
    });

    if (!recurringTransaction) {
      throw new NotFoundException(`Recurring Transaction with ID ${id} not found`);
    }
    return recurringTransaction;
  }

  async update(id: number, updateDto: UpdateRecurringTransactionDto, userId: number): Promise<RecurringTransaction> {
    const existingTransaction = await this.recurringTransactionRepository.findOne({ 
      where: { id, user: { id: userId } },
      relations: ['category', 'tags', 'bankAccount', 'creditCard']
    });

    if (!existingTransaction) {
      throw new NotFoundException('Recurring transaction not found');
    }

    // Store original values for comparison
    const originalStartDate = new Date(existingTransaction.startDate);
    const originalFrequencyType = existingTransaction.frequencyType;
    const originalFrequencyEveryN = existingTransaction.frequencyEveryN;

    // Handle category update if provided
    if (updateDto.categoryId && updateDto.categoryId !== existingTransaction.category?.id) {
      const category = await this.categoryRepository.findOne({
        where: { id: updateDto.categoryId, user: { id: userId } }
      });
      if (!category) {
        throw new NotFoundException(`Category with ID ${updateDto.categoryId} not found`);
      }
      existingTransaction.category = category;
    }

    // Handle tags update if provided
    if (updateDto.tagIds) {
      const tags = await this.tagRepository.find({
        where: { id: In(updateDto.tagIds), user: { id: userId } }
      });
      if (tags.length !== updateDto.tagIds.length) {
        throw new NotFoundException('One or more tags not found');
      }
      existingTransaction.tags = tags;
    }

    // Handle bank account update if provided
    if (updateDto.bankAccountId) {
      const bankAccount = await this.bankAccountRepository.findOne({
        where: { id: updateDto.bankAccountId, user: { id: userId } }
      });
      if (!bankAccount) {
        throw new NotFoundException(`Bank account with ID ${updateDto.bankAccountId} not found`);
      }
      existingTransaction.bankAccount = bankAccount;
    }

    // Handle credit card update if provided
    if (updateDto.creditCardId) {
      const creditCard = await this.creditCardRepository.findOne({
        where: { id: updateDto.creditCardId, user: { id: userId } }
      });
      if (!creditCard) {
        throw new NotFoundException(`Credit card with ID ${updateDto.creditCardId} not found`);
      }
      existingTransaction.creditCard = creditCard;
    }

    // Update other fields
    if (updateDto.name) existingTransaction.name = updateDto.name;
    if (updateDto.description) existingTransaction.description = updateDto.description;
    if (updateDto.amount) existingTransaction.amount = updateDto.amount;
    if (updateDto.status) existingTransaction.status = updateDto.status;
    if (updateDto.type) existingTransaction.type = updateDto.type;
    if (updateDto.frequencyEveryN) existingTransaction.frequencyEveryN = updateDto.frequencyEveryN;
    if (updateDto.frequencyType) existingTransaction.frequencyType = updateDto.frequencyType;
    if (updateDto.occurrences) existingTransaction.occurrences = updateDto.occurrences;
    if (updateDto.startDate) existingTransaction.startDate = updateDto.startDate;
    
    // Handle endDate in update method
    if (updateDto.endDate !== undefined) {
      // Handle empty string or null case
      if (updateDto.endDate === null || String(updateDto.endDate).trim() === '') {
        existingTransaction.endDate = null;
      } else {
        try {
          // Convert to string explicitly if needed
          const dateValue = typeof updateDto.endDate === 'string' 
            ? updateDto.endDate 
            : String(updateDto.endDate);
          
          const parsedDate = new Date(dateValue);
          if (!isNaN(parsedDate.getTime())) {
            existingTransaction.endDate = parsedDate;
          } else {
            this.logger.warn(`Invalid endDate detected: ${dateValue}, not updating this field`);
          }
        } catch (err) {
          this.logger.warn(`Error parsing endDate: ${err.message}, not updating this field`);
        }
      }
    }

    // Save the updated recurring transaction
    try {
      const updatedTransaction = await this.recurringTransactionRepository.save(existingTransaction);
      
      // Check if timing-related properties have changed
      const timingChanged = updateDto.startDate || 
                            updateDto.frequencyType || 
                            updateDto.frequencyEveryN;

      // Handle past transactions if needed
      if (updateDto.applyToPast) {
        if (timingChanged) {
          // If timing has changed and we need to apply to past, we should:
          // 1. Delete all existing transactions for this recurring transaction
          // 2. Regenerate all transactions based on the new configuration
          
          // Delete all existing transactions (both pending and executed)
          await this.transactionRepository.delete({ recurringTransaction: { id } });
          
          // Generate all transactions from the start date until now
          const allTransactions = this.recurringTransactionGeneratorService.generateTransactions(updatedTransaction);
          
          if (allTransactions.length > 0) {
            const transactionsToCreate = allTransactions.map(transaction => {
              return {
                description: transaction.description,
                amount: transaction.amount,
                type: transaction.type,
                status: transaction.status,
                executionDate: transaction.executionDate,
                category: { id: updatedTransaction.category.id },
                bankAccount: updatedTransaction.bankAccount ? { id: updatedTransaction.bankAccount.id } : null,
                creditCard: updatedTransaction.creditCard ? { id: updatedTransaction.creditCard.id } : null,
                tags: updatedTransaction.tags.map(tag => ({ id: tag.id })),
                user: { id: userId },
                source: 'recurring',
                recurringTransaction: { id: updatedTransaction.id }
              };
            });

            for (const transactionData of transactionsToCreate) {
              try {
                await this.transactionsService.createAutomatedTransaction(
                  transactionData as Partial<Transaction>,
                  userId,
                  'recurring',
                  `recurring_id:${updatedTransaction.id}`
                );
              } catch (error) {
                this.logger.error(`Error creating transaction: ${error.message}`);
              }
            }
          }
        } else {
          // If timing hasn't changed, just update the properties of past transactions
          const pastTransactions = await this.transactionRepository.find({ 
            where: { recurringTransaction: { id }, status: 'executed' },
            relations: ['category', 'tags', 'bankAccount', 'creditCard']
          });
          
          if (pastTransactions.length > 0) {
            const updatedPastTransactions = pastTransactions.map(transaction => {
              if (updateDto.name) transaction.description = updateDto.name;
              if (updateDto.amount) transaction.amount = updateDto.amount;
              if (updateDto.type) transaction.type = updateDto.type as NonNullable<Transaction['type']>;
              if (updateDto.categoryId) transaction.category = { id: updateDto.categoryId } as Category;
              return transaction;
            });
            
            for (const transactionData of updatedPastTransactions) {
              try {
                await this.transactionsService.createAutomatedTransaction(
                  transactionData as Partial<Transaction>,
                  userId,
                  'recurring',
                  `recurring_id:${updatedTransaction.id}`
                );
              } catch (error) {
                this.logger.error(`Error creating transaction: ${error.message}`);
              }
            }
          }
        }
      } else if (timingChanged) {
        // If timing has changed but we don't need to apply to past:
        // Just delete and regenerate pending transactions
        await this.transactionRepository.delete({ recurringTransaction: { id }, status: 'pending' });
        const newTransactions = this.recurringTransactionGeneratorService.generateTransactions(updatedTransaction);
        
        if (newTransactions.length > 0) {
          const transactionsToCreate = newTransactions.map(transaction => {
            return {
              description: transaction.description,
              amount: transaction.amount,
              type: transaction.type,
              status: transaction.status,
              executionDate: transaction.executionDate,
              category: { id: updatedTransaction.category.id },
              bankAccount: updatedTransaction.bankAccount ? { id: updatedTransaction.bankAccount.id } : null,
              creditCard: updatedTransaction.creditCard ? { id: updatedTransaction.creditCard.id } : null,
              tags: updatedTransaction.tags.map(tag => ({ id: tag.id })),
              user: { id: userId },
              source: 'recurring',
              recurringTransaction: { id: updatedTransaction.id }
            };
          });

          for (const transactionData of transactionsToCreate) {
            try {
              await this.transactionsService.createAutomatedTransaction(
                transactionData as Partial<Transaction>,
                userId,
                'recurring',
                `recurring_id:${updatedTransaction.id}`
              );
            } catch (error) {
              this.logger.error(`Error creating transaction: ${error.message}`);
            }
          }
        }
      }

      return updatedTransaction;
    } catch (error) {
      // Transform database errors into user-friendly errors
      if (error.name === 'QueryFailedError' && error.code === '22007') {
        throw new BadRequestException('Invalid date format in the update data. Please check your endDate field.');
      }
      throw error;
    }
  }

  async remove(id: number, userId: number, deleteOption: 'all' | 'pending' | 'none'): Promise<void> {
    const recurringTransaction = await this.findOne(id, userId);

    if (deleteOption === 'all') {
      await this.transactionRepository.delete({ recurringTransaction: { id } });
    } else if (deleteOption === 'pending') {
      await this.transactionRepository.delete({ recurringTransaction: { id }, status: 'pending' });
    }

    await this.recurringTransactionRepository.remove(recurringTransaction);
  }

  async findMatchingRecurringTransaction(
    userId: number,
    description: string,
    amount: number,
    frequencyType: string
  ): Promise<RecurringTransaction | null> {
    return this.transactionOperationsService.findMatchingRecurringTransaction(
      userId,
      description,
      amount,
      frequencyType
    );
  }

  async getUnconfirmedPatterns(userId: number): Promise<RecurringTransaction[]> {
    return this.recurringTransactionRepository.find({
      where: { user: { id: userId }, userConfirmed: false },
      order: { startDate: 'DESC' },
    });
  }
  

  async confirmPattern(id: number, userId: number): Promise<RecurringTransaction> {
    const recurringTransaction = await this.recurringTransactionRepository.findOne({
      where: { id, user: { id: userId } }
    });

    if (!recurringTransaction) {
      throw new NotFoundException('Recurring transaction not found');
    }

    // Mark as confirmed by user
    recurringTransaction.userConfirmed = true;
    
    return this.recurringTransactionRepository.save(recurringTransaction);
  }

  async adjustPattern(
    id: number, 
    updateDto: UpdateRecurringTransactionDto, 
    userId: number
  ): Promise<RecurringTransaction> {
    const recurringTransaction = await this.recurringTransactionRepository.findOne({
      where: { id, user: { id: userId } }
    });

    if (!recurringTransaction) {
      throw new NotFoundException('Recurring transaction not found');
    }

    // Handle endDate in adjustPattern method
    if (updateDto.endDate !== undefined) {
      // Handle empty string or null case
      if (updateDto.endDate === null || String(updateDto.endDate).trim() === '') {
        recurringTransaction.endDate = null;
        delete updateDto.endDate;
      } else {
        try {
          // Convert to string explicitly if needed
          const dateValue = typeof updateDto.endDate === 'string' 
            ? updateDto.endDate 
            : String(updateDto.endDate);
          
          const parsedDate = new Date(dateValue);
          if (!isNaN(parsedDate.getTime())) {
            recurringTransaction.endDate = parsedDate;
          } else {
            this.logger.warn(`Invalid endDate detected in adjustPattern: ${dateValue}, not updating this field`);
            delete updateDto.endDate;
          }
        } catch (err) {
          this.logger.warn(`Error parsing endDate in adjustPattern: ${err.message}, not updating this field`);
          delete updateDto.endDate;
        }
      }
    }

    // Update the recurring transaction with new pattern details
    Object.assign(recurringTransaction, updateDto);
    
    // Mark as confirmed by user since they adjusted it
    recurringTransaction.userConfirmed = true;
    
    try {
      return await this.recurringTransactionRepository.save(recurringTransaction);
    } catch (error) {
      // Transform database errors into user-friendly errors
      if (error.name === 'QueryFailedError' && error.code === '22007') {
        throw new BadRequestException('Invalid date format in the update data. Please check your endDate field.');
      }
      throw error;
    }
  }

  async detectAllPatterns(userId: number) {
    return this.recurringPatternDetectorService.detectAllRecurringPatterns(userId);
  }
}