import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  In,
  FindOptionsWhere,
  Raw,
  IsNull,
} from 'typeorm';
import { Transaction } from './transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ImportTransactionDto } from './dto/import-transaction.dto';
import { User } from '../users/user.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { PendingDuplicatesService } from '../pending-duplicates/pending-duplicates.service';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import { TransactionOperationsService } from './transaction-operations.service';
import { TransactionImportService } from './transaction-import.service';
import { TransactionCategorizationService } from './transaction-categorization.service';
import { TransactionBulkService } from './transaction-bulk.service';
import { TransactionDuplicateService } from './transaction-duplicate.service';
import { parseLocalizedAmount } from '../utils/amount.utils';
import { parseDate } from '../utils/date-utils';
import { parse } from 'csv-parse/sync';
import { DuplicateTransactionChoice } from './dto/duplicate-transaction-choice.dto';
import { BankFileParserFactory, GocardlessParser } from './parsers';
import { ImportLogsService } from './import-logs.service';
import { ImportStatus } from './entities/import-log.entity';
import { GocardlessService } from '../gocardless/gocardless.service';
import { EventPublisherService } from '../shared/services/event-publisher.service';
import { TransactionCreatedEvent } from '../shared/events/transaction.events';
// AI categorization service removed - focusing on keyword-based categorization only

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);
  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(BankAccount)
    private bankAccountsRepository: Repository<BankAccount>,
    @InjectRepository(CreditCard)
    private creditCardsRepository: Repository<CreditCard>,
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(Tag)
    private tagRepository: Repository<Tag>,
    private pendingDuplicatesService: PendingDuplicatesService,
    private categoriesService: CategoriesService,
    private tagsService: TagsService,
    private transactionOperationsService: TransactionOperationsService,
    private transactionImportService: TransactionImportService,
    private transactionCategorizationService: TransactionCategorizationService,
    private transactionBulkService: TransactionBulkService,
    private transactionDuplicateService: TransactionDuplicateService,
    private importLogsService: ImportLogsService,
    private gocardlessService: GocardlessService,
    private eventPublisher: EventPublisherService,
    // AI categorization service removed
  ) {}

  findAll(userId: number): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      where: { user: { id: userId } },
      relations: ['category', 'bankAccount', 'creditCard', 'tags'],
    });
  }

  findByType(
    type: 'income' | 'expense',
    userId: number,
  ): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      where: { type, user: { id: userId } },
    }); // ✅ Filter by type
  }

  async findOne(id: number, userId: number): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id, user: { id: userId } },
      relations: ['category', 'bankAccount', 'creditCard', 'tags'],
    });
    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }
    return transaction;
  }

  async createAndSaveTransaction(
    createTransactionDto: CreateTransactionDto,
    userId: number,
    duplicateChoice?: DuplicateTransactionChoice,
    skipDuplicateCheck: boolean = false,
  ): Promise<Transaction> {
    // First check if the category exists
    const { bankAccountId, creditCardId, source, executionDate, tagIds } =
      createTransactionDto;

    // If no category is provided, try to auto-categorize
    if (!createTransactionDto.categoryId && createTransactionDto.description) {
      const suggestedCategory =
        await this.categoriesService.suggestCategoryForDescription(
          createTransactionDto.description,
          userId,
        );

      if (suggestedCategory) {
        createTransactionDto.categoryId = suggestedCategory.id;
      }
    }
    // Validation logic
    // const category = await this.categoriesService.findOne(createTransactionDto.categoryId, userId);
    let category: Category | null = null;
    let suggestedCategory: Category | null = null;

    if (createTransactionDto.categoryId) {
      category = await this.categoriesRepository.findOne({
        where: { id: createTransactionDto.categoryId, user: { id: userId } },
      });

      if (!category) {
        throw new NotFoundException(
          `Category with ID ${createTransactionDto.categoryId} not found`,
        );
      }
    } else if (createTransactionDto.description) {
      // Try keyword-based categorization only
      suggestedCategory =
        await this.categoriesService.suggestCategoryForDescription(
          createTransactionDto.description,
          userId,
        );
    }

    // Validate payment method
    if ((bankAccountId && creditCardId) || (!bankAccountId && !creditCardId)) {
      throw new BadRequestException(
        'You must provide either a bank account ID or a credit card ID, but not both.',
      );
    }

    // Set default executionDate to current date if not provided
    const transactionExecutionDate = executionDate
      ? new Date(executionDate)
      : new Date();

    // Calculate billing date
    let billingDate: Date;
    if (creditCardId) {
      const creditCard = await this.creditCardsRepository.findOne({
        where: { id: creditCardId, user: { id: userId } },
      });
      if (!creditCard) {
        throw new NotFoundException(
          `Credit Card with ID ${creditCardId} not found`,
        );
      }
      billingDate = this.calculateBillingDate(
        transactionExecutionDate,
        creditCard.billingDay,
      );
    } else {
      // For bank accounts, validate the bank account exists
      if (bankAccountId) {
        const bankAccount = await this.bankAccountsRepository.findOne({
          where: { id: bankAccountId, user: { id: userId } },
        });
        if (!bankAccount) {
          throw new NotFoundException(
            `Bank Account with ID ${bankAccountId} not found`,
          );
        }
      }
      billingDate = transactionExecutionDate; // For bank accounts
    }

    // Determine the status based on the execution date
    const status =
      transactionExecutionDate > new Date() ? 'pending' : 'executed';

    // Check for duplicates only if not skipped
    if (!skipDuplicateCheck) {
      const duplicateTransaction =
        await this.transactionDuplicateService.findPotentialDuplicate(
          createTransactionDto.amount,
          createTransactionDto.type,
          transactionExecutionDate,
          userId,
        );

      if (duplicateTransaction) {
        return this.transactionDuplicateService.handleDuplicateConfirmation(
          duplicateTransaction,
          createTransactionDto,
          userId,
          duplicateChoice,
        );
      }
    }

    // Check for tags if provided
    let tags: Tag[] = [];
    if (tagIds) {
      tags = await this.tagRepository.find({
        where: { id: In(tagIds), user: { id: userId } },
      });

      // Check if all tags exist
      if (tags.length !== tagIds.length) {
        throw new NotFoundException(
          `One or more tags with IDs ${tagIds.join(', ')} not found`,
        );
      }
    }

    // Normalize the amount based on transaction type
    const normalizedAmount = this.normalizeAmount(
      createTransactionDto.amount,
      createTransactionDto.type,
    );

    // Create the transaction
    const transaction = this.transactionsRepository.create({
      ...createTransactionDto,
      amount: normalizedAmount,
      user: { id: userId },
      category: category || undefined,
      suggestedCategory:
        !category && suggestedCategory ? suggestedCategory : undefined,
      suggestedCategoryName:
        !category && suggestedCategory ? suggestedCategory.name : undefined,
      bankAccount: bankAccountId ? { id: bankAccountId } : null,
      creditCard: creditCardId ? { id: creditCardId } : null,
      status: status,
      executionDate: transactionExecutionDate,
      billingDate,
      tags,
    });

    const savedTransaction =
      await this.transactionsRepository.save(transaction);

    // Publish TransactionCreatedEvent for event-driven processing
    try {
      await this.eventPublisher.publish(
        new TransactionCreatedEvent(savedTransaction, userId),
      );
    } catch (error) {
      this.logger.error('Failed to publish TransactionCreatedEvent', {
        error: error.message,
        transactionId: savedTransaction.id,
        userId,
      });
      // Don't re-throw to avoid breaking the transaction creation flow
    }

    return savedTransaction;
  }

  async delete(id: number, userId: number): Promise<void> {
    // First check if the transaction exists and belongs to the user
    const transaction = await this.transactionsRepository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    // Check if the transaction is referenced by any pending duplicates
    const pendingDuplicates =
      await this.pendingDuplicatesService.findAllByExistingTransactionId(id);
    // If there are unresolved pending duplicates, prevent deletion
    const unresolvedDuplicates = pendingDuplicates.filter((pd) => !pd.resolved);
    if (unresolvedDuplicates.length > 0) {
      throw new ConflictException(
        `Cannot delete transaction: it is referenced by ${unresolvedDuplicates.length} unresolved pending duplicate(s)`,
      );
    }

    // If there are only resolved pending duplicates, you can either:
    // Option 1: Allow deletion and set the existingTransaction to null in those records
    if (pendingDuplicates.length > 0) {
      // Update all resolved pending duplicates to remove the reference
      await this.pendingDuplicatesService.update(
        pendingDuplicates[0].id,
        { existingTransaction: null },
        userId,
      );
    }

    // Now delete the transaction
    await this.transactionsRepository.delete({ id, user: { id: userId } });
  }

  async findPendingTransactionsByCreditCard(
    creditCardId: number,
    userId: number,
  ): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      where: {
        creditCard: { id: creditCardId },
        status: 'pending',
        user: { id: userId },
      },
      relations: ['category', 'bankAccount', 'creditCard'],
    });
  }

  async update(
    id: number,
    updateTransactionDto: any,
    userId: number,
  ): Promise<Transaction> {
    const { categoryId, bankAccountId, creditCardId, tagIds, ...updateData } =
      updateTransactionDto;

    // First find the transaction to ensure it exists and belongs to the user
    const transaction = await this.findOne(id, userId);

    // Handle category
    if (categoryId) {
      const category = await this.categoriesRepository.findOne({
        where: { id: categoryId, user: { id: userId } },
      });
      if (!category) {
        throw new NotFoundException(`Category with ID ${categoryId} not found`);
      }
      transaction.category = category;
    }

    // Handle credit card and bank account
    if (creditCardId) {
      const creditCard = await this.creditCardsRepository.findOne({
        where: { id: creditCardId, user: { id: userId } },
      });
      if (!creditCard) {
        throw new NotFoundException(
          `Credit Card with ID ${creditCardId} not found`,
        );
      }
      transaction.creditCard = creditCard;
      transaction.bankAccount = null; // Use null instead of undefined
      transaction.billingDate = this.calculateBillingDate(
        transaction.executionDate || new Date(),
        creditCard.billingDay,
      );
    } else if (bankAccountId) {
      const bankAccount = await this.bankAccountsRepository.findOne({
        where: { id: bankAccountId, user: { id: userId } },
      });
      if (!bankAccount) {
        throw new NotFoundException(
          `Bank Account with ID ${bankAccountId} not found`,
        );
      }
      transaction.bankAccount = bankAccount;
      transaction.creditCard = null; // Use null instead of undefined
      transaction.billingDate = transaction.executionDate;
    } else {
      // If neither is provided, set both to null
      transaction.bankAccount = null;
      transaction.creditCard = null;
    }

    // Handle tags
    if (tagIds) {
      const tags = await this.tagRepository.find({
        where: { id: In(tagIds), user: { id: userId } },
      });
      if (tags.length !== tagIds.length) {
        throw new NotFoundException('One or more tags not found');
      }
      transaction.tags = tags;
    }

    // Normalize the amount based on transaction type
    if (updateData.amount !== undefined && updateData.type !== undefined) {
      updateData.amount = this.normalizeAmount(
        updateData.amount,
        updateData.type,
      );
    }

    // Update other fields
    Object.assign(transaction, updateData);

    // Save with explicit undefined values
    await this.transactionsRepository.save(transaction);

    return this.findOne(id, userId);
  }

  async transactionExists(
    transactionData: Partial<Transaction>,
    userId: number,
  ): Promise<boolean> {
    const { amount, description, executionDate, type } = transactionData;

    if (!executionDate) {
      throw new BadRequestException(
        'Execution date is required for duplicate detection.',
      );
    }

    const fourDaysBefore = new Date(executionDate);
    fourDaysBefore.setDate(fourDaysBefore.getDate() - 4);

    const fourDaysAfter = new Date(executionDate);
    fourDaysAfter.setDate(fourDaysAfter.getDate() + 4);

    const existingTransaction = await this.transactionsRepository.findOne({
      where: {
        amount,
        // description,
        type,
        executionDate: Between(fourDaysBefore, fourDaysAfter),
        user: { id: userId },
      },
    });

    return !!existingTransaction;
  }

  // Delegate to TransactionDuplicateService
  private async findPotentialDuplicate(
    amount: number,
    type: 'income' | 'expense',
    executionDate: Date,
    userId: number,
  ): Promise<Transaction | null> {
    return this.transactionDuplicateService.findPotentialDuplicate(
      amount,
      type,
      executionDate,
      userId,
    );
  }

  // Methods for creating automated transactions for imports and API
  async createAutomatedTransaction(
    transactionData: Partial<Transaction>,
    userId: number,
    source: 'csv_import' | 'api',
    sourceReference?: string,
  ): Promise<Transaction | null> {
    return this.transactionOperationsService.createAutomatedTransaction(
      transactionData,
      userId,
      source,
      sourceReference,
    );
  }

  // Delegate to TransactionDuplicateService
  async handleDuplicateResolution(
    existingTransaction: Transaction | null,
    newTransactionData: any,
    userId: number,
    choice: DuplicateTransactionChoice,
  ): Promise<Transaction> {
    return this.transactionDuplicateService.handleDuplicateResolution(
      existingTransaction,
      newTransactionData,
      userId,
      choice,
    );
  }

  // Helper method to handle both DTO format and entity format when creating transactions
  private async createTransactionFromAnyFormat(
    transactionData: any,
    userId: number,
  ): Promise<Transaction> {
    // Check if data has entity format references (bankAccount.id, creditCard.id)
    // Convert to DTO format for consistent processing
    if (transactionData.bankAccount?.id || transactionData.creditCard?.id) {
      // Convert entity format to DTO format
      const dtoData = {
        ...transactionData,
        bankAccountId: transactionData.bankAccount?.id,
        creditCardId: transactionData.creditCard?.id,
        // Only set categoryId if category entity exists with valid ID
        // This allows automatic keyword categorization to work when no category is provided
        ...(transactionData.category?.id && {
          categoryId: transactionData.category.id,
        }),
      };

      // Remove entity references to avoid conflicts
      delete dtoData.bankAccount;
      delete dtoData.creditCard;
      delete dtoData.category;

      // Use the standard create method with duplicate check skipped
      return this.createAndSaveTransaction(dtoData, userId, undefined, true);
    } else {
      // Already in DTO format - use the standard create method with duplicate check skipped
      return this.createAndSaveTransaction(
        transactionData,
        userId,
        undefined,
        true,
      );
    }
  }

  // Delegate to TransactionDuplicateService
  async handleDuplicateConfirmation(
    duplicateTransaction: Transaction,
    newTransactionData: CreateTransactionDto | any,
    userId: number,
    userChoice?: DuplicateTransactionChoice,
  ): Promise<Transaction> {
    return this.transactionDuplicateService.handleDuplicateConfirmation(
      duplicateTransaction,
      newTransactionData,
      userId,
      userChoice,
    );
  }

  private calculateBillingDate(executionDate: Date, billingDay: number): Date {
    const billingDate = new Date(executionDate);
    billingDate.setMonth(billingDate.getMonth() + 1);
    billingDate.setDate(billingDay);
    return billingDate;
  }

  async updateMany(where: any, update: any): Promise<void> {
    await this.transactionsRepository.update(where, update);
  }

  async deleteMany(where: any): Promise<void> {
    await this.transactionsRepository.delete(where);
  }

  async importTransactions(
    importDto: ImportTransactionDto,
    userId: number,
  ): Promise<{
    transactions: Transaction[];
    importLogId: number;
    status: ImportStatus;
  }> {
    // Delegate to the dedicated TransactionImportService
    return this.transactionImportService.importTransactions(importDto, userId);
  }

  async categorizeTransactionByDescription(
    transaction: Transaction,
    userId: number,
  ): Promise<Transaction> {
    // Delegate to the dedicated TransactionCategorizationService
    return this.transactionCategorizationService.categorizeTransactionByDescription(
      transaction,
      userId,
    );
  }

  private async processForRecurringPatterns(
    transactions: Transaction[],
    userId: number,
  ): Promise<void> {
    // This method is now handled by event handlers
    // No direct processing needed here
    this.logger.debug(
      `Recurring pattern analysis is now handled by event handlers for ${transactions.length} transactions`,
    );
  }

  async markTransactionAsRecurring(transaction: Transaction): Promise<void> {
    // This method is now a no-op since we're not linking transactions to recurring patterns
    this.logger.debug(
      `Recurring transaction marking is disabled for transaction ${transaction.id}`,
    );
  }

  /**
   * Ensures the amount has the correct sign based on transaction type
   * @param amount The transaction amount
   * @param type The transaction type ('income' or 'expense')
   * @returns The amount with the correct sign
   */
  private normalizeAmount(amount: number, type: 'income' | 'expense'): number {
    const absAmount = Math.abs(amount);
    return type === 'income' ? absAmount : -absAmount;
  }

  /**
   * Bulk categorize transactions by their IDs
   * @param transactionIds Array of transaction IDs to categorize
   * @param categoryId ID of the category to assign
   * @param userId User ID
   * @returns Number of transactions that were categorized
   */
  async bulkCategorizeByIds(
    transactionIds: number[],
    categoryId: number,
    userId: number,
  ): Promise<number> {
    // Delegate to the dedicated TransactionCategorizationService
    return this.transactionCategorizationService.bulkCategorizeByIds(
      transactionIds,
      categoryId,
      userId,
    );
  }

  /**
   * Bulk uncategorize transactions by their IDs (remove category)
   * @param transactionIds Array of transaction IDs to uncategorize
   * @param userId User ID
   * @returns Number of transactions that were uncategorized
   */
  async bulkUncategorizeByIds(
    transactionIds: number[],
    userId: number,
  ): Promise<number> {
    // Delegate to the dedicated TransactionCategorizationService
    return this.transactionCategorizationService.bulkUncategorizeByIds(
      transactionIds,
      userId,
    );
  }

  /**
   * Bulk delete transactions by their IDs
   * @param transactionIds Array of transaction IDs to delete
   * @param userId User ID
   * @returns Number of transactions that were deleted
   */
  async bulkDeleteByIds(
    transactionIds: number[],
    userId: number,
  ): Promise<number> {
    // Delegate to the dedicated TransactionBulkService
    return this.transactionBulkService.bulkDeleteByIds(transactionIds, userId);
  }

  /**
   * Accept a suggested category for a specific transaction
   */
  async acceptSuggestedCategory(
    transactionId: number,
    userId: number,
  ): Promise<Transaction> {
    // Delegate to the dedicated TransactionCategorizationService
    return this.transactionCategorizationService.acceptSuggestedCategory(
      transactionId,
      userId,
    );
  }

  /**
   * Reject a suggested category for a specific transaction
   */
  async rejectSuggestedCategory(
    transactionId: number,
    userId: number,
  ): Promise<Transaction> {
    // Delegate to the dedicated TransactionCategorizationService
    return this.transactionCategorizationService.rejectSuggestedCategory(
      transactionId,
      userId,
    );
  }

  /**
   * Bulk categorization using keywords only (AI categorization removed)
   */
  async bulkAiCategorizeUncategorized(
    userId: number,
    batchSize: number = 50,
  ): Promise<{
    totalProcessed: number;
    keywordMatched: number;
    aiSuggestions: number;
    errors: number;
    estimatedCost: number;
  }> {
    // Delegate to the dedicated TransactionBulkService
    return this.transactionBulkService.bulkCategorizeUncategorized(
      userId,
      batchSize,
    );
  }

  /**
   * Import transactions from GoCardless
   */
  async importFromGoCardless(
    accountId: string,
    userId: number,
    options: {
      bankAccountId?: number;
      creditCardId?: number;
      skipDuplicateCheck?: boolean; // New option to force import
      createPendingForDuplicates?: boolean; // New option to create pending duplicates
      dateFrom?: Date; // Date range support
      dateTo?: Date; // Date range support
    } = {},
  ): Promise<{
    transactions: Transaction[];
    importLogId: number;
    status: ImportStatus;
    duplicatesCount: number;
    newTransactionsCount: number;
    pendingDuplicatesCreated: number;
  }> {
    const dateRangeInfo =
      options.dateFrom && options.dateTo
        ? ` from ${options.dateFrom.toISOString().split('T')[0]} to ${options.dateTo.toISOString().split('T')[0]}`
        : options.dateFrom
          ? ` from ${options.dateFrom.toISOString().split('T')[0]}`
          : options.dateTo
            ? ` until ${options.dateTo.toISOString().split('T')[0]}`
            : '';

    this.logger.log(
      `Starting GoCardless import for account ${accountId}, user ${userId}${dateRangeInfo}`,
    );

    // Create import log
    const importLog = await this.importLogsService.create({
      userId,
      status: ImportStatus.PROCESSING,
      source: 'gocardless',
      format: 'gocardless_api',
      fileName: `GoCardless Account ${accountId}${dateRangeInfo}`,
      startTime: new Date(),
      logs: `Started GoCardless import process${dateRangeInfo}`,
    });

    try {
      // Fetch transactions from GoCardless with date range
      const gocardlessData =
        await this.gocardlessService.getAccountTransactions(
          accountId,
          options.dateFrom,
          options.dateTo,
        );

      // Parse transactions
      const parser = new GocardlessParser();
      const parsedTransactions = await parser.parseTransactions(
        gocardlessData,
        {
          userId,
          bankAccountId: options.bankAccountId,
          creditCardId: options.creditCardId,
        },
      );

      // Process transactions with improved duplicate handling
      const savedTransactions: Transaction[] = [];
      let duplicatesCount = 0;
      let newTransactionsCount = 0;
      let pendingDuplicatesCreated = 0;

      for (const transactionData of parsedTransactions) {
        try {
          if (options.skipDuplicateCheck) {
            // Force import without duplicate checking
            const transaction = await this.createTransactionFromAnyFormat(
              transactionData,
              userId,
            );
            savedTransactions.push(transaction);
            newTransactionsCount++;
            continue;
          }

          // PRIORITY 1: Check for exact match using transactionIdOpenBankAPI (100% accurate)
          if (transactionData.transactionIdOpenBankAPI) {
            const existingByApiId = await this.transactionsRepository.findOne({
              where: {
                user: { id: userId },
                transactionIdOpenBankAPI:
                  transactionData.transactionIdOpenBankAPI,
                source: 'gocardless',
              },
            });

            if (existingByApiId) {
              duplicatesCount++;
              this.logger.log(
                `Prevented duplicate using API ID: ${transactionData.description} (API ID: ${transactionData.transactionIdOpenBankAPI})`,
              );
              await this.importLogsService.appendToLog(
                importLog.id,
                `Prevented duplicate using API ID: ${transactionData.description}`,
              );
              continue; // Skip this transaction - exact duplicate found
            }
          }

          // PRIORITY 2: Use similarity-based duplicate detection for transactions without API ID
          const duplicateCheck =
            await this.transactionOperationsService.duplicateDetectionService.checkForDuplicateBeforeCreation(
              {
                description: transactionData.description || '',
                amount: transactionData.amount || 0,
                type: transactionData.type || 'expense',
                executionDate: transactionData.executionDate || new Date(),
                source: 'gocardless',
              },
              userId,
            );

          if (duplicateCheck.shouldPrevent) {
            // 100% match - skip completely
            duplicatesCount++;
            await this.importLogsService.appendToLog(
              importLog.id,
              `Skipped exact duplicate: ${transactionData.description} (${transactionData.amount})`,
            );
            continue;
          }

          if (
            duplicateCheck.shouldCreatePending ||
            (options.createPendingForDuplicates && duplicateCheck.isDuplicate)
          ) {
            // Create pending duplicate for manual review
            await this.pendingDuplicatesService.createPendingDuplicate(
              duplicateCheck.existingTransaction!,
              {
                ...transactionData,
                source: 'gocardless',
                userId,
              },
              userId,
              'gocardless',
              `gocardless_import_${Date.now()}`,
            );

            pendingDuplicatesCreated++;
            duplicatesCount++;

            await this.importLogsService.appendToLog(
              importLog.id,
              `Created pending duplicate for review: ${transactionData.description} (${duplicateCheck.similarityScore}% match)`,
            );
            continue;
          }

          // No significant duplicate found, create the transaction
          const transaction = await this.createTransactionFromAnyFormat(
            transactionData,
            userId,
          );
          savedTransactions.push(transaction);
          newTransactionsCount++;
        } catch (error) {
          this.logger.error(`Error processing transaction: ${error.message}`);
          await this.importLogsService.appendToLog(
            importLog.id,
            `Error processing transaction: ${error.message}`,
          );
        }
      }

      // Process recurring patterns
      if (savedTransactions.length > 0) {
        await this.processForRecurringPatterns(savedTransactions, userId);
      }

      const summary = `Import completed. ${newTransactionsCount} new transactions, ${duplicatesCount} duplicates handled, ${pendingDuplicatesCreated} pending duplicates created for review.`;
      await this.importLogsService.updateStatus(
        importLog.id,
        ImportStatus.COMPLETED,
        summary,
      );

      return {
        transactions: savedTransactions,
        importLogId: importLog.id,
        status: ImportStatus.COMPLETED,
        duplicatesCount,
        newTransactionsCount,
        pendingDuplicatesCreated,
      };
    } catch (error) {
      await this.importLogsService.updateStatus(
        importLog.id,
        ImportStatus.FAILED,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Enrich transactions with PayPal data
   */
  async enrichTransactionsWithPayPal(
    paypalTransactions: any[],
    userId: number,
    dateRangeForMatching: number = 5,
  ): Promise<number> {
    if (!paypalTransactions || paypalTransactions.length === 0) {
      return 0;
    }

    let enrichedCount = 0;

    for (const paypalTx of paypalTransactions) {
      const amount = parseFloat(paypalTx.amount);
      const txDate = new Date(paypalTx.date);

      const startDate = new Date(txDate);
      const endDate = new Date(txDate);
      endDate.setDate(endDate.getDate() + dateRangeForMatching);

      const isExpense = amount < 0;
      const searchAmount = isExpense ? -Math.abs(amount) : Math.abs(amount);

      const matchingTransactions = await this.transactionsRepository.find({
        where: {
          description: Raw((alias) => `LOWER(${alias}) LIKE LOWER('%PayPal%')`),
          amount: searchAmount,
          executionDate: Between(startDate, endDate),
          user: { id: userId },
        },
      });

      for (const transaction of matchingTransactions) {
        const merchant = paypalTx.name || 'Unknown Merchant';
        transaction.description = `${transaction.description} (PayPal: ${merchant})`;
        await this.transactionsRepository.save(transaction);
        enrichedCount++;
      }
    }

    return enrichedCount;
  }
}
