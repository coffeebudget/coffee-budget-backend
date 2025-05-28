import { Injectable, NotFoundException, BadRequestException, ConflictException, forwardRef, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, Not, IsNull, Stream, Like, FindOptionsWhere, Raw } from 'typeorm';
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
import { RecurringPatternDetectorService } from '../recurring-transactions/recurring-pattern-detector.service';
import { TransactionOperationsService } from '../shared/transaction-operations.service';
import { parseLocalizedAmount } from '../utils/amount.utils';
import { parseDate } from '../utils/date-utils';
import { parse } from 'csv-parse/sync';
import { Workbook } from 'exceljs';
import * as cheerio from 'cheerio';
import { DuplicateTransactionChoice } from './dto/duplicate-transaction-choice.dto';
import * as xlsx from 'xlsx';
import { BankFileParserFactory } from './parsers';
import { ImportLogsService } from './import-logs.service';
import { ImportStatus } from './entities/import-log.entity';

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
    @Inject(forwardRef(() => RecurringPatternDetectorService))
    private recurringPatternDetectorService: RecurringPatternDetectorService,
    private transactionOperationsService: TransactionOperationsService,
    private importLogsService: ImportLogsService,
  ) {}

  findAll(userId: number): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      where: { user: { id: userId } },
      relations: ['category', 'bankAccount', 'creditCard', 'tags']
    });
  }

  findByType(type: "income" | "expense", userId: number): Promise<Transaction[]> { 
    return this.transactionsRepository.find({ where: { type, user: { id: userId } } }); // ✅ Filter by type
  }

  async findOne(id: number, userId: number): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({ 
      where: { id, user: { id: userId } },
      relations: ['category', 'bankAccount', 'creditCard', 'tags']
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
    skipDuplicateCheck: boolean = false
  ): Promise<Transaction> {
    // First check if the category exists
    const { 
      bankAccountId, 
      creditCardId, 
      source, 
      executionDate, 
      tagIds
    } = createTransactionDto;

    // If no category is provided, try to auto-categorize
    if (!createTransactionDto.categoryId && createTransactionDto.description) {
      const suggestedCategory = await this.categoriesService.suggestCategoryForDescription(
        createTransactionDto.description,
        userId
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
        throw new NotFoundException(`Category with ID ${createTransactionDto.categoryId} not found`);
      }
    } else if (createTransactionDto.description) {
      // If no category is selected, still store a suggested category
      suggestedCategory = await this.categoriesService.suggestCategoryForDescription(
        createTransactionDto.description,
        userId
      );
    }

    // Validate payment method
    if ((bankAccountId && creditCardId) || (!bankAccountId && !creditCardId)) {
      throw new BadRequestException('You must provide either a bank account ID or a credit card ID, but not both.');
    }

    // Set default executionDate to current date if not provided
    const transactionExecutionDate = executionDate ? new Date(executionDate) : new Date();
    
    // Calculate billing date
    let billingDate: Date;
    if (creditCardId) {
      const creditCard = await this.creditCardsRepository.findOne({ 
        where: { id: creditCardId, user: { id: userId } } 
      });
      if (!creditCard) {
        throw new NotFoundException(`Credit Card with ID ${creditCardId} not found`);
      }
      billingDate = this.calculateBillingDate(transactionExecutionDate, creditCard.billingDay);
    } else {
      // For bank accounts, validate the bank account exists
      if (bankAccountId) {
        const bankAccount = await this.bankAccountsRepository.findOne({ 
          where: { id: bankAccountId, user: { id: userId } } 
        });
        if (!bankAccount) {
          throw new NotFoundException(`Bank Account with ID ${bankAccountId} not found`);
        }
      }
      billingDate = transactionExecutionDate; // For bank accounts
    }

    // Determine the status based on the execution date
    const status = transactionExecutionDate > new Date() ? 'pending' : 'executed';

    // Check for duplicates only if not skipped
    if (!skipDuplicateCheck) {
      const duplicateTransaction = await this.findPotentialDuplicate(
        createTransactionDto.amount,
        createTransactionDto.type,
        transactionExecutionDate,
        userId
      );

      if (duplicateTransaction) {
        return this.handleDuplicateConfirmation(
          duplicateTransaction, 
          createTransactionDto, 
          userId,
          duplicateChoice
        ) as Promise<Transaction>;
      }
    }

    // Check for tags if provided
    let tags: Tag[] = [];
    if (tagIds) {
      tags = await this.tagRepository.find({
        where: { id: In(tagIds), user: { id: userId } }
      });

      // Check if all tags exist
      if (tags.length !== tagIds.length) {
        throw new NotFoundException(`One or more tags with IDs ${tagIds.join(', ')} not found`);
      }
    }
    
    // Normalize the amount based on transaction type
    const normalizedAmount = this.normalizeAmount(
      createTransactionDto.amount,
      createTransactionDto.type
    );

    // Create the transaction
    const transaction = this.transactionsRepository.create({
      ...createTransactionDto,
      amount: normalizedAmount,
      user: { id: userId },
      category: category || undefined,
      suggestedCategory: !category && suggestedCategory ? suggestedCategory : undefined,
      suggestedCategoryName: !category && suggestedCategory ? suggestedCategory.name : undefined,
      bankAccount: bankAccountId ? { id: bankAccountId } : null,
      creditCard: creditCardId ? { id: creditCardId } : null,
      status: status,
      executionDate: transactionExecutionDate,
      billingDate,
      tags
    });

    return await this.transactionsRepository.save(transaction);
  }

  async delete(id: number, userId: number): Promise<void> {
    // First check if the transaction exists and belongs to the user
    const transaction = await this.transactionsRepository.findOne({
      where: { id, user: { id: userId } }
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    // Check if the transaction is referenced by any pending duplicates
    const pendingDuplicates = await this.pendingDuplicatesService.findAllByExistingTransactionId(id);
    // If there are unresolved pending duplicates, prevent deletion
    const unresolvedDuplicates = pendingDuplicates.filter(pd => !pd.resolved);
    if (unresolvedDuplicates.length > 0) {
      throw new ConflictException(
        `Cannot delete transaction: it is referenced by ${unresolvedDuplicates.length} unresolved pending duplicate(s)`
      );
    }

    // If there are only resolved pending duplicates, you can either:
    // Option 1: Allow deletion and set the existingTransaction to null in those records
    if (pendingDuplicates.length > 0) {
      // Update all resolved pending duplicates to remove the reference
      await this.pendingDuplicatesService.update(
        pendingDuplicates[0].id,
        { existingTransaction: null },
        userId
      );
    }

    // Now delete the transaction
    await this.transactionsRepository.delete({ id, user: { id: userId } });
  }

  async findPendingTransactionsByCreditCard(creditCardId: number, userId: number): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      where: { creditCard: { id: creditCardId }, status: 'pending', user: { id: userId } },
      relations: ['category', 'bankAccount', 'creditCard']
    });
  }

  async update(id: number, updateTransactionDto: any, userId: number): Promise<Transaction> {
    const { categoryId, bankAccountId, creditCardId, tagIds, ...updateData } = updateTransactionDto;
    
    // First find the transaction to ensure it exists and belongs to the user
    const transaction = await this.findOne(id, userId);
    
    // Handle category
    if (categoryId) {
      const category = await this.categoriesRepository.findOne({ 
        where: { id: categoryId, user: { id: userId } }
      });
      if (!category) {
        throw new NotFoundException(`Category with ID ${categoryId} not found`);
      }
      transaction.category = category;
    }

    // Handle credit card and bank account
    if (creditCardId) {
      const creditCard = await this.creditCardsRepository.findOne({
        where: { id: creditCardId, user: { id: userId } }
      });
      if (!creditCard) {
        throw new NotFoundException(`Credit Card with ID ${creditCardId} not found`);
      }
      transaction.creditCard = creditCard;
      transaction.bankAccount = null;  // Use null instead of undefined
      transaction.billingDate = this.calculateBillingDate(transaction.executionDate || new Date(), creditCard.billingDay);
    } else if (bankAccountId) {
      const bankAccount = await this.bankAccountsRepository.findOne({
        where: { id: bankAccountId, user: { id: userId } }
      });
      if (!bankAccount) {
        throw new NotFoundException(`Bank Account with ID ${bankAccountId} not found`);
      }
      transaction.bankAccount = bankAccount;
      transaction.creditCard = null;  // Use null instead of undefined
      transaction.billingDate = transaction.executionDate;
    } else {
      // If neither is provided, set both to null
      transaction.bankAccount = null;
      transaction.creditCard = null;
    }

    // Handle tags
    if (tagIds) {
      const tags = await this.tagRepository.find({
        where: { id: In(tagIds), user: { id: userId } }
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
        updateData.type
      );
    }

    // Update other fields
    Object.assign(transaction, updateData);

    // Save with explicit undefined values
    await this.transactionsRepository.save(transaction);
    
    return this.findOne(id, userId);
  }

  async transactionExists(transactionData: Partial<Transaction>, userId: number): Promise<boolean> {
    const { amount, description, executionDate, type } = transactionData;

    if (!executionDate) {
      throw new BadRequestException('Execution date is required for duplicate detection.');
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
        user: { id: userId }
      },
    });

    return !!existingTransaction;
  }

  // Extracted method to find potential duplicates
  private async findPotentialDuplicate(
    amount: number,
    type: string,
    executionDate: Date,
    userId: number
  ): Promise<Transaction | null> {
    const fourDaysBefore = new Date(executionDate);
    fourDaysBefore.setDate(fourDaysBefore.getDate() - 4);

    const fourDaysAfter = new Date(executionDate);
    fourDaysAfter.setDate(fourDaysAfter.getDate() + 4);

    return this.transactionsRepository.findOne({
      where: {
        amount,
        type: type as NonNullable<Transaction['type']>,
        executionDate: Between(fourDaysBefore, fourDaysAfter),
        user: { id: userId },
      },
    });
  }

  // Methods for creating automated transactions for imports and API
  async createAutomatedTransaction(
    transactionData: Partial<Transaction>,
    userId: number,
    source: 'csv_import' | 'api',
    sourceReference?: string
  ): Promise<Transaction> {
    return this.transactionOperationsService.createAutomatedTransaction(
      transactionData,
      userId,
      source,
      sourceReference
    );
  }

  // Method to handle duplicate resolution
  async handleDuplicateResolution(
    existingTransaction: Transaction | null,
    newTransactionData: any,
    userId: number,
    choice: DuplicateTransactionChoice
  ): Promise<{ existingTransaction: Transaction | null; newTransaction: Transaction | null }> {
    let result = {
      existingTransaction,
      newTransaction: null as Transaction | null
    };

    if (!existingTransaction) {
      // If there's no existing transaction, just create a new one
      const newTransaction = await this.createTransactionFromAnyFormat(newTransactionData, userId);
      result.newTransaction = newTransaction;
      return result;
    }

    switch (choice) {
      case DuplicateTransactionChoice.MAINTAIN_BOTH:
        // Create a new transaction with the data
        const newTransaction = await this.createTransactionFromAnyFormat(newTransactionData, userId);
        result.newTransaction = newTransaction;
        break;

      case DuplicateTransactionChoice.USE_NEW:
        // Update existing transaction with new data
        const updatedTransaction = await this.update(
          existingTransaction.id,
          newTransactionData,
          userId
        );
        result.existingTransaction = updatedTransaction;
        break;

      case DuplicateTransactionChoice.KEEP_EXISTING:
        // Do nothing, keep the existing transaction
        break;

      default:
        // Default to keeping the existing transaction
        break;
    }

    return result;
  }

  // Helper method to handle both DTO format and entity format when creating transactions
  private async createTransactionFromAnyFormat(
    transactionData: any,
    userId: number
  ): Promise<Transaction> {
    // Check if data is in entity format (has category.id) or DTO format (has categoryId)
    if (transactionData.category?.id && !transactionData.categoryId) {
      // Entity format - convert to repository format and save directly
      const transaction = this.transactionsRepository.create({
        description: transactionData.description,
        amount: transactionData.amount,
        type: transactionData.type,
        status: transactionData.status || 'executed',
        executionDate: transactionData.executionDate ? new Date(transactionData.executionDate) : new Date(),
        billingDate: transactionData.billingDate || transactionData.executionDate,
        user: { id: userId },
        category: { id: transactionData.category.id },
        bankAccount: transactionData.bankAccount?.id ? { id: transactionData.bankAccount.id } : null,
        creditCard: transactionData.creditCard?.id ? { id: transactionData.creditCard.id } : null,
        tags: transactionData.tags?.map(tag => ({ id: tag.id })) || [],
        source: transactionData.source || 'manual',
      });
      
      return this.transactionsRepository.save(transaction);
    } else {
      // DTO format - use the standard create method with duplicate check skipped
      return this.createAndSaveTransaction(transactionData, userId, undefined, true);
    }
  }

  // For backward compatibility
  async handleDuplicateConfirmation(
    duplicateTransaction: Transaction, 
    newTransactionData: CreateTransactionDto | any, 
    userId: number,
    userChoice?: DuplicateTransactionChoice
  ): Promise<Transaction | null> {
    // If no choice is provided, throw an exception with the duplicate transaction ID
    if (!userChoice) {
      throw new ConflictException({
        message: 'Duplicate transaction detected',
        duplicateTransactionId: duplicateTransaction.id,
        duplicateTransaction: {
          id: duplicateTransaction.id,
          description: duplicateTransaction.description,
          amount: duplicateTransaction.amount,
          executionDate: duplicateTransaction.executionDate,
          type: duplicateTransaction.type
        }
      });
    }

    const result = await this.handleDuplicateResolution(
      duplicateTransaction,
      newTransactionData,
      userId,
      userChoice
    );

    // Return the appropriate transaction based on the choice
    return result.newTransaction || result.existingTransaction;
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

  async importTransactions(importDto: ImportTransactionDto, userId: number): Promise<{
  transactions: Transaction[];
  importLogId: number;
  status: ImportStatus;
}> {
    this.logger.log(`Starting import for user ${userId} with format: ${importDto.bankFormat || 'generic'}`);
    
    // Create an import log entry
    const importLog = await this.importLogsService.create({
      userId,
      status: ImportStatus.PROCESSING,
      source: 'csv',
      format: importDto.bankFormat || 'generic',
      fileName: importDto.fileName || 'Unknown file',
      startTime: new Date(),
      logs: `Started import process for user ${userId} with format: ${importDto.bankFormat || 'generic'}`
    });
    
    try {
      // Bank-specific import formats
      if (importDto.bankFormat) {
        try {
          await this.importLogsService.appendToLog(importLog.id, `Using bank-specific parser: ${importDto.bankFormat}`);
          
          const parser = BankFileParserFactory.getParser(importDto.bankFormat);
          const parsedTransactions = await parser.parseFile(importDto.csvData || '', {
            bankAccountId: importDto.bankAccountId,
            creditCardId: importDto.creditCardId,
            userId
          });
          
          await this.importLogsService.appendToLog(importLog.id, `Successfully parsed ${parsedTransactions.length} transactions from ${importDto.bankFormat} file`);
          await this.importLogsService.update(importLog.id, { 
            totalRecords: parsedTransactions.length,
            processedRecords: 0,
            successfulRecords: 0,
            failedRecords: 0
          });
          
          // Process parsed transactions before saving
          for (const tx of parsedTransactions) {
            // Calculate billing date for credit card transactions
            if (tx.creditCard && tx.creditCard.id && tx.executionDate) {
              // Fetch the credit card to get the billing day
              const creditCard = await this.creditCardsRepository.findOne({
                where: { id: tx.creditCard.id, user: { id: userId } }
              });
              
              if (creditCard) {
                tx.billingDate = this.calculateBillingDate(
                  tx.executionDate,
                  creditCard.billingDay
                );
              }
            } else if (tx.bankAccount && tx.executionDate) {
              // For bank account transactions, billing date equals execution date
              tx.billingDate = new Date(tx.executionDate);
            }
            
            // Add category suggestion based on description
            if (!tx.category && tx.description) {
              const suggestedCategory = await this.categoriesService.suggestCategoryForDescription(
                tx.description,
                userId
              );
              
              if (suggestedCategory) {
                tx.category = suggestedCategory;
              }
            }

            // Process tagNames if provided by bank-specific parsers (e.g., Fineco)
            if ((tx as any).tagNames && Array.isArray((tx as any).tagNames)) {
              const tagNames = (tx as any).tagNames;
              const createdTags: Tag[] = [];
              
              for (const tagName of tagNames) {
                const existingTag = await this.tagsService.findByName(tagName, userId);
                if (existingTag) {
                  createdTags.push(existingTag);
                } else {
                  const newTag = await this.tagsService.create({ name: tagName }, { id: userId } as User);
                  createdTags.push(newTag);
                }
              }
              
              tx.tags = createdTags;
              // Remove the temporary tagNames property
              delete (tx as any).tagNames;
            }
          }
          
          // Save all the parsed transactions to the database
          const createdTransactions: Transaction[] = [];
          let successCount = 0;
          let failCount = 0;
          
          for (let i = 0; i < parsedTransactions.length; i++) {
            try {
              const tx = parsedTransactions[i];
              const transaction = await this.createAutomatedTransaction(tx, userId, 'csv_import');
              createdTransactions.push(transaction);
              successCount++;
              
              // Update import log every 10 transactions or at the end
              if (i % 10 === 0 || i === parsedTransactions.length - 1) {
                await this.importLogsService.incrementCounters(importLog.id, { 
                  processed: 1, 
                  successful: 1 
                });
              }
            } catch (error) {
              failCount++;
              await this.importLogsService.appendToLog(
                importLog.id, 
                `Error processing transaction ${i + 1}: ${error.message}`
              );
              
              await this.importLogsService.incrementCounters(importLog.id, { 
                processed: 1, 
                failed: 1 
              });
            }
          }
          
          const summary = `Import completed. Successfully imported ${successCount} of ${parsedTransactions.length} transactions.`;
          const finalStatus = successCount === parsedTransactions.length ? ImportStatus.COMPLETED : ImportStatus.PARTIALLY_COMPLETED;
          
          await this.importLogsService.updateStatus(
            importLog.id, 
            finalStatus,
            summary
          );
          
          return {
            transactions: createdTransactions,
            importLogId: importLog.id,
            status: finalStatus
          };
        } catch (error) {
          await this.importLogsService.appendToLog(
            importLog.id, 
            `Failed to import ${importDto.bankFormat} file: ${error.message}`
          );
          
          await this.importLogsService.updateStatus(
            importLog.id, 
            ImportStatus.FAILED,
            `Import failed: ${error.message}`
          );
          
          this.logger.error(`Failed to import ${importDto.bankFormat} file: ${error.message}`);
          throw new BadRequestException(`Failed to parse ${importDto.bankFormat} file: ${error.message}`);
        }
      }
      
      // Generic CSV import
      if (!importDto.csvData || !importDto.columnMappings) {
        await this.importLogsService.updateStatus(
          importLog.id, 
          ImportStatus.FAILED,
          'Import failed: Missing CSV data or column mappings'
        );
        
        throw new BadRequestException('Missing CSV data or column mappings');
      }
      
      // Check if the CSV data is base64 encoded and decode it if necessary
      let csvData = importDto.csvData;
      if (this.isBase64(csvData)) {
        try {
          csvData = Buffer.from(csvData, 'base64').toString('utf-8');
          await this.importLogsService.appendToLog(importLog.id, 'Successfully decoded base64 CSV data');
        } catch (error) {
          await this.importLogsService.appendToLog(
            importLog.id, 
            `Failed to decode base64 data: ${error.message}`
          );
          
          await this.importLogsService.updateStatus(
            importLog.id, 
            ImportStatus.FAILED,
            `Import failed: Invalid CSV data format`
          );
          
          this.logger.error(`Failed to decode base64 data: ${error.message}`);
          throw new BadRequestException('Invalid CSV data format');
        }
      }
      
      // Now parse the decoded CSV data
      const records = parse(csvData, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ',', // Explicitly set delimiter
        relax_column_count: true,
        trim: true
      });
      
      await this.importLogsService.appendToLog(importLog.id, `Successfully parsed ${records.length} records from CSV`);
      await this.importLogsService.update(importLog.id, { 
        totalRecords: records.length,
        processedRecords: 0,
        successfulRecords: 0,
        failedRecords: 0
      });
      
      this.logger.log(`Successfully parsed ${records.length} records from CSV`);
      if (records.length > 0) {
        this.logger.debug(`First record sample: ${JSON.stringify(records[0])}`);
        await this.importLogsService.appendToLog(importLog.id, `First record sample: ${JSON.stringify(records[0])}`);
      } else {
        this.logger.warn('No records found in CSV data');
        await this.importLogsService.appendToLog(importLog.id, 'No records found in CSV data');
        await this.importLogsService.updateStatus(
          importLog.id, 
          ImportStatus.COMPLETED,
          'Import completed: No records found in CSV data'
        );
        
        return {
          transactions: [],
          importLogId: importLog.id,
          status: ImportStatus.COMPLETED
        };
      }

      // Set a default date format if none is provided
      const dateFormat = importDto.dateFormat || 'yyyy-MM-dd';
      const bankAccountId = importDto.bankAccountId || null;
      const creditCardId = importDto.creditCardId || null;

      const transactions: Transaction[] = [];
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        try {
          await this.importLogsService.appendToLog(importLog.id, `Processing record ${i + 1}/${records.length}`);
          
          this.logger.debug(`Processing record: ${JSON.stringify(record)}`);
          const transactionData: Partial<Transaction> = {};
          
          // Map CSV columns to transaction fields based on columnMappings
          transactionData.description = record[importDto.columnMappings.description];
          this.logger.debug(`Mapped description: ${transactionData.description}`);
          
          // Parse amount with proper handling of different number formats
          const amountStr = record[importDto.columnMappings.amount];
          this.logger.debug(`Raw amount string: ${amountStr}`);

          const parsedAmount = parseLocalizedAmount(amountStr);
          this.logger.debug(`Parsed amount: ${parsedAmount}`);
          
          // Check if parsing was successful
          if (isNaN(parsedAmount)) {
            const errorMessage = `Invalid amount format: ${amountStr}`;
            this.logger.error(errorMessage);
            await this.importLogsService.appendToLog(importLog.id, errorMessage);
            await this.importLogsService.incrementCounters(importLog.id, { 
              processed: 1, 
              failed: 1 
            });
            failCount++;
            continue;
          }
          
          transactionData.amount = parsedAmount;

          // Determine transaction type
          transactionData.type = record[importDto.columnMappings.type] || 
                                (transactionData.amount >= 0 ? 'income' : 'expense');
          
          // Normalize the amount based on transaction type
          transactionData.amount = this.normalizeAmount(
            transactionData.amount,
            transactionData.type as 'income' | 'expense'
          );

          // Parse executionDate using the provided date format or default
          const executionDateString = record[importDto.columnMappings.executionDate];
          if (executionDateString) {
            try {
              transactionData.executionDate = parseDate(executionDateString, dateFormat, new Date());
            } catch (error) {
              const errorMessage = `Invalid date format for executionDate: ${executionDateString}. Expected format: ${dateFormat}`;
              await this.importLogsService.appendToLog(importLog.id, errorMessage);
              await this.importLogsService.incrementCounters(importLog.id, { 
                processed: 1, 
                failed: 1 
              });
              failCount++;
              continue;
            }
          }

          // Ensure description is not null or empty
          if (!transactionData.description) {
            const errorMessage = 'Description is required for each transaction.';
            await this.importLogsService.appendToLog(importLog.id, errorMessage);
            await this.importLogsService.incrementCounters(importLog.id, { 
              processed: 1, 
              failed: 1 
            });
            failCount++;
            continue;
          }

          // Handle bank account
          if (bankAccountId) {
            const bankAccount = await this.bankAccountsRepository.findOne({
              where: { id: bankAccountId, user: { id: userId } }
            });
            
            if (bankAccount) {
              transactionData.bankAccount = bankAccount;
            } else {
              const errorMessage = `Bank account "${bankAccountId}" not found. Please create it first.`;
              await this.importLogsService.appendToLog(importLog.id, errorMessage);
              await this.importLogsService.incrementCounters(importLog.id, { 
                processed: 1, 
                failed: 1 
              });
              failCount++;
              continue;
            }
          }

          // Handle credit card
          if (creditCardId) {
            const creditCard = await this.creditCardsRepository.findOne({
              where: { id: creditCardId, user: { id: userId } }
            });
            
            if (creditCard) {
              transactionData.creditCard = creditCard;
              
              // Calculate billing date if credit card is provided
              if (transactionData.executionDate) {
                transactionData.billingDate = this.calculateBillingDate(
                  transactionData.executionDate, 
                  creditCard.billingDay
                );
              }
            } else {
              const errorMessage = `Credit card "${creditCardId}" not found. Please create it first.`;
              await this.importLogsService.appendToLog(importLog.id, errorMessage);
              await this.importLogsService.incrementCounters(importLog.id, { 
                processed: 1, 
                failed: 1 
              });
              failCount++;
              continue;
            }
          }

          // Validate that either bank account or credit card is provided, but not both
          if (transactionData.bankAccount && transactionData.creditCard) {
            const errorMessage = 'A transaction cannot have both a bank account and a credit card.';
            await this.importLogsService.appendToLog(importLog.id, errorMessage);
            await this.importLogsService.incrementCounters(importLog.id, { 
              processed: 1, 
              failed: 1 
            });
            failCount++;
            continue;
          }

          // Handle category creation
          const categoryName = record[importDto.columnMappings.categoryName];
          if (categoryName) {
            const existingCategory = await this.categoriesService.findByName(categoryName, userId);
            if (!existingCategory) {
              const newCategory = await this.categoriesService.create({
                name: categoryName
              }, { id: userId } as User);
              transactionData.category = newCategory;
            } else {
              transactionData.category = existingCategory;
            }
          } else {
            const suggestedCategory = await this.categoriesService.suggestCategoryForDescription(
              transactionData.description,
              userId
            );
            if (suggestedCategory) {
              transactionData.category = suggestedCategory;
            }
          }

          // Handle tag creation
          const tagNames = record[importDto.columnMappings.tagNames];
          if (tagNames) {
            const tagNamesArray = tagNames.split(',').map(tag => tag.trim());
            const createdTags: Tag[] = [];

            for (const tagName of tagNamesArray) {
              const existingTag = await this.tagsService.findByName(tagName, userId);
              if (!existingTag) {
                const newTag = await this.tagsService.create({ name: tagName }, { id: userId } as User);
                createdTags.push(newTag);
              } else {
                createdTags.push(existingTag);
              }
            }
            transactionData.tags = createdTags;
          }

          try {
            const transaction = await this.createAutomatedTransaction(
              transactionData,
              userId,
              'csv_import'
            );

            this.logger.debug(`Created transaction: ${JSON.stringify(transaction)}`);
            await this.importLogsService.appendToLog(importLog.id, `Successfully created transaction for "${transactionData.description}"`);
            transactions.push(transaction);
            successCount++;
            
            await this.importLogsService.incrementCounters(importLog.id, { 
              processed: 1, 
              successful: 1 
            });
          } catch (error) {
            this.logger.error(`Error processing record: ${JSON.stringify(record)}`, error.stack);
            await this.importLogsService.appendToLog(importLog.id, `Error processing record: ${error.message}`);
            await this.importLogsService.incrementCounters(importLog.id, { 
              processed: 1, 
              failed: 1 
            });
            failCount++;
          }
        } catch (error) {
          this.logger.error(`Unexpected error processing record: ${error.message}`);
          await this.importLogsService.appendToLog(importLog.id, `Unexpected error: ${error.message}`);
          await this.importLogsService.incrementCounters(importLog.id, { 
            processed: 1, 
            failed: 1 
          });
          failCount++;
        }
      }

      // Process for recurring patterns
      await this.processForRecurringPatterns(transactions, userId);
      
      const summary = `Import completed. Successfully imported ${successCount} of ${records.length} transactions.`;
      this.logger.log(summary);
      
      const finalStatus = failCount > 0 ? ImportStatus.PARTIALLY_COMPLETED : ImportStatus.COMPLETED;
      
      await this.importLogsService.updateStatus(
        importLog.id, 
        finalStatus,
        summary
      );
      
      return {
        transactions,
        importLogId: importLog.id,
        status: finalStatus
      };
    } catch (error) {
      // Handle any uncaught errors
      const errorMessage = `Import failed with error: ${error.message}`;
      this.logger.error(errorMessage, error.stack);
      
      await this.importLogsService.updateStatus(
        importLog.id, 
        ImportStatus.FAILED,
        errorMessage
      );
      
      throw error;
    }
  }

  // Helper method to check if a string is base64 encoded
  private isBase64(str: string): boolean {
    // A simple check for base64 encoding pattern
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    // Additional check to avoid false positives with short strings
    return base64Regex.test(str) && str.length % 4 === 0 && str.length > 20;
  }

  async categorizeTransactionByDescription(transaction: Transaction, userId: number): Promise<Transaction> {
    if (!transaction.category && transaction.description) {
      const suggestedCategory = await this.categoriesService.suggestCategoryForDescription(
        transaction.description,
        userId
      );
      
      if (suggestedCategory) {
        transaction.category = suggestedCategory;
        return this.transactionsRepository.save(transaction);
      }
    }
    
    return transaction;
  }

  private async processForRecurringPatterns(transactions: Transaction[], userId: number): Promise<void> {
    try {
      // Only analyze patterns, don't create recurring transactions
      for (const transaction of transactions) {
        await this.detectRecurringPatternAsync(transaction);
      }
    } catch (error) {
      this.logger.error(`Error processing transactions for recurring patterns: ${error.message}`);
    }
  }

  async markTransactionAsRecurring(transaction: Transaction): Promise<void> {
    // This method is now a no-op since we're not linking transactions to recurring patterns
    this.logger.debug(`Recurring transaction marking is disabled for transaction ${transaction.id}`);
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

  private async detectRecurringPatternAsync(transaction: Transaction): Promise<void> {
    try {
      const pattern = await this.recurringPatternDetectorService.detectPatternForTransaction(transaction);
      
      if (pattern && pattern.isRecurring) {
        this.logger.debug(`Found recurring pattern for transaction ID ${transaction.id}`);
        // We don't link to recurring transactions anymore, just log the pattern
        this.logger.debug(`Pattern: ${pattern.suggestedFrequency} with confidence ${pattern.confidence}`);
      }
    } catch (error) {
      this.logger.error(`Error detecting recurring pattern: ${error.message}`);
    }
  }

  async findByRecurringTransactionId(recurringTransactionId: number, userId: number): Promise<Transaction[]> {
    this.logger.warn('findByRecurringTransactionId is deprecated and returns an empty array');
    return [];
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
    userId: number
  ): Promise<number> {
    if (!transactionIds || !transactionIds.length) {
      throw new BadRequestException('Transaction IDs array is required');
    }

    // Verify the category exists and belongs to the user
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId, user: { id: userId } },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }

    // Find all the transactions that belong to the user
    const transactions = await this.transactionsRepository.find({
      where: { 
        id: In(transactionIds),
        user: { id: userId } 
      },
      relations: ['category']
    });

    if (!transactions.length) {
      return 0;
    }

    // Update the category for each transaction
    for (const transaction of transactions) {
      transaction.category = category;
    }

    // Save all transactions
    await this.transactionsRepository.save(transactions);

    return transactions.length;
  }

  /**
   * Bulk uncategorize transactions by their IDs (remove category)
   * @param transactionIds Array of transaction IDs to uncategorize
   * @param userId User ID
   * @returns Number of transactions that were uncategorized
   */
  async bulkUncategorizeByIds(
    transactionIds: number[], 
    userId: number
  ): Promise<number> {
    if (!transactionIds || !transactionIds.length) {
      throw new BadRequestException('Transaction IDs array is required');
    }

    // First check if the transactions exist
    const transactions = await this.transactionsRepository.find({
      where: { 
        id: In(transactionIds),
        user: { id: userId } 
      }
    });

    if (!transactions.length) {
      return 0;
    }

    // Use a query runner to execute direct SQL
    const queryRunner = this.transactionsRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    
    try {
      await queryRunner.startTransaction();
      
      // Direct SQL to set categoryId to NULL
      const result = await queryRunner.manager.query(
        `UPDATE "transaction" 
         SET "categoryId" = NULL 
         WHERE "id" IN (${transactionIds.join(',')}) 
         AND "userId" = $1`,
        [userId]
      );
      
      await queryRunner.commitTransaction();
      
      // Count the number of affected rows
      return transactions.length;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Accept a suggested category for a specific transaction
   * @param transactionId The ID of the transaction to update
   * @param userId The user ID
   * @returns The updated transaction
   */
  async acceptSuggestedCategory(transactionId: number, userId: number): Promise<Transaction> {
    // Find the transaction with its suggested category
    const transaction = await this.transactionsRepository.findOne({
      where: { 
        id: transactionId,
        user: { id: userId }
      },
      relations: ['suggestedCategory', 'category', 'bankAccount', 'creditCard', 'tags']
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${transactionId} not found`);
    }

    if (!transaction.suggestedCategory) {
      throw new BadRequestException(`Transaction has no suggested category`);
    }

    // Update the category to the suggested one
    transaction.category = transaction.suggestedCategory;
    
    // Clear the suggested category after accepting it
    transaction.suggestedCategory = null;
    transaction.suggestedCategoryName = null;

    // Save the transaction
    return this.transactionsRepository.save(transaction);
  }

  async unlinkFromRecurringTransaction(
    transactionId: number, 
    recurringTransactionId: number, 
    userId: number
  ): Promise<Transaction> {
    const transaction = await this.findOne(transactionId, userId);
    this.logger.warn(`unlinkFromRecurringTransaction is deprecated for transaction ${transactionId}`);
    return transaction;
  }

  /**
   * Enriches bank transactions with PayPal transaction details
   * @param paypalTransactions Array of PayPal transactions
   * @param userId User ID
   * @param dateRangeForMatching Optional number of days to look forward for matching (default: 5)
   * @returns Number of transactions that were enriched
   */
  async enrichTransactionsWithPayPal(
    paypalTransactions: any[], 
    userId: number,
    dateRangeForMatching: number = 5
  ): Promise<number> {
    if (!paypalTransactions || paypalTransactions.length === 0) {
      this.logger.log('No PayPal transactions to process');
      return 0;
    }

    let enrichedCount = 0;
    
    // Filter out transactions with missing amounts or dates
    const validPaypalTransactions = paypalTransactions.filter(
      pt => pt.amount && pt.date
    );

    this.logger.log(`Processing ${validPaypalTransactions.length} valid PayPal transactions`);

    for (const paypalTx of validPaypalTransactions) {
      const amount = parseFloat(paypalTx.amount);
      // Get date and create a range to account for processing differences
      const txDate = new Date(paypalTx.date);
      
      // PayPal transaction dates often come before bank transaction dates
      // So we look forward from the PayPal date
      const startDate = new Date(txDate);
      
      const endDate = new Date(txDate);
      endDate.setDate(endDate.getDate() + dateRangeForMatching);
      
      // Check if we have an expense (negative amount) or income (positive amount)
      const isExpense = amount < 0;
      const absAmount = Math.abs(amount);
      
      // Define search range for amount with tolerance
      // For expenses (negative in PayPal), search for negative amounts in DB
      // For income (positive in PayPal), search for positive amounts in DB
      const searchAmount = isExpense ? -absAmount : absAmount;
      
      this.logger.debug(
        `Searching for matches with PayPal transaction: ${paypalTx.name}, ` +
        `amount ${amount} (${isExpense ? 'expense' : 'income'}, searching for ${searchAmount}), ` +
        `between ${startDate.toISOString()} and ${endDate.toISOString()}`
      );

      // Find bank transactions with PayPal in the description and matching amount
      const where: FindOptionsWhere<Transaction> = {
        description: Raw(alias => `LOWER(${alias}) LIKE LOWER('%PayPal%')`),
        amount: searchAmount, // Use the properly signed amount
        executionDate: Between(startDate, endDate),
        user: { id: userId },
      };

      const matchingTransactions = await this.transactionsRepository.find({
        where,
        relations: ['tags'],
      });

      if (matchingTransactions.length > 0) {
        this.logger.debug(`Found ${matchingTransactions.length} matching transactions for PayPal transaction: ${paypalTx.name}, ${amount}, ${txDate.toISOString()}`);
        
        for (const transaction of matchingTransactions) {
          // Store the original description
          const originalDescription = transaction.description;
          
          // Create a more detailed description using PayPal data
          const merchant = paypalTx.name || 'Unknown Merchant';
          
          // Append PayPal merchant info to the original description
          const updatedDescription = `${originalDescription} (PayPal: ${merchant})`;

          // Update the transaction description with more details
          transaction.description = updatedDescription;

          await this.transactionsRepository.save(transaction);
          enrichedCount++;
          
          this.logger.debug(`Enriched transaction ID ${transaction.id}: "${originalDescription}" -> "${updatedDescription}"`);
        }
      } else {
        this.logger.debug(`No matching transactions found for PayPal transaction: ${paypalTx.name}, ${amount}, ${txDate.toISOString()}`);
      }
    }

    this.logger.log(`Enriched ${enrichedCount} transactions with PayPal data`);
    return enrichedCount;
  }
}
