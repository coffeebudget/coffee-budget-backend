import { Injectable, NotFoundException, BadRequestException, ConflictException, forwardRef, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, Not, IsNull } from 'typeorm';
import { Transaction } from './transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ImportTransactionDto } from './dto/import-transaction.dto';
import { User } from '../users/user.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
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
    @InjectRepository(RecurringTransaction)
    private recurringTransactionRepository: Repository<RecurringTransaction>,
    private categoriesService: CategoriesService,
    private tagsService: TagsService,
    @Inject(forwardRef(() => RecurringPatternDetectorService))
    private recurringPatternDetectorService: RecurringPatternDetectorService,
    private transactionOperationsService: TransactionOperationsService,
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

  async create(
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
      tagIds, 
      recurringTransactionId
    } = createTransactionDto;

    // Check if source is 'recurring' and recurringTransactionId is not provided
    if (source === 'recurring' && !recurringTransactionId) {
      throw new BadRequestException('Recurring transaction ID must be provided when the source is recurring.');
    }

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
    if (createTransactionDto.categoryId) {
      category = await this.categoriesRepository.findOne({
        where: { id: createTransactionDto.categoryId, user: { id: userId } },
      });

      if (!category) {
        throw new NotFoundException(`Category with ID ${createTransactionDto.categoryId} not found`);
      }
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
      bankAccount: bankAccountId ? { id: bankAccountId } : null,
      creditCard: creditCardId ? { id: creditCardId } : null,
      status: status,
      executionDate: transactionExecutionDate,
      billingDate,
      tags,
      recurringTransaction: recurringTransactionId ? { id: recurringTransactionId } : null
    });

    const savedTransaction = await this.transactionsRepository.save(transaction);
    
    // After saving, check if this might be part of a recurring pattern
    // Only do this for manual transactions, not for imports or automated ones
    if (savedTransaction.source === 'manual') {
      // Run this asynchronously to not block the response
      this.detectRecurringPatternAsync(savedTransaction);
    }
    
    return savedTransaction;
  }

  async createTransaction(transactionData: Partial<Transaction>, userId: number): Promise<Transaction> {
    const transaction = this.transactionsRepository.create({
      ...transactionData,
      user: { id: userId }
    });
    return this.transactionsRepository.save(transaction);
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
      where: {
        creditCard: { id: creditCardId, user: { id: userId } },
        status: "pending",
      },
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

  async createAutomatedTransaction(
    transactionData: Partial<Transaction>,
    userId: number,
    source: 'recurring' | 'csv_import' | 'api',
    sourceReference?: string
  ): Promise<Transaction> {
    return this.transactionOperationsService.createAutomatedTransaction(
      transactionData,
      userId,
      source,
      sourceReference
    );
  }

  // Combined duplicate handling method
  async handleDuplicateResolution(
    existingTransaction: Transaction | null,
    newTransactionData: any,
    userId: number,
    choice: DuplicateTransactionChoice
  ): Promise<{ existingTransaction: Transaction | null; newTransaction: Transaction | null }> {
    let result: {
      existingTransaction: Transaction | null;
      newTransaction: Transaction | null;
    } = {
      existingTransaction,
      newTransaction: null
    };

    switch (choice) {
      case DuplicateTransactionChoice.MERGE:
        result.existingTransaction = await this.mergeTransactions(
          existingTransaction,
          newTransactionData
        );
        break;

      case DuplicateTransactionChoice.REPLACE:
        await this.delete(existingTransaction?.id || 0, userId);
        result.existingTransaction = null;
        // Ensure the amount is normalized before creating the new transaction
        if (newTransactionData.amount !== undefined && newTransactionData.type) {
          newTransactionData.amount = this.normalizeAmount(
            newTransactionData.amount,
            newTransactionData.type
          );
        }
        result.newTransaction = await this.createTransactionFromAnyFormat(newTransactionData, userId);
        break;

      case DuplicateTransactionChoice.MAINTAIN_BOTH:
        // Ensure the amount is normalized before creating the new transaction
        if (newTransactionData.amount !== undefined && newTransactionData.type) {
          newTransactionData.amount = this.normalizeAmount(
            newTransactionData.amount,
            newTransactionData.type
          );
        }
        result.newTransaction = await this.createTransactionFromAnyFormat(newTransactionData, userId);
        break;

      case DuplicateTransactionChoice.IGNORE:
        // Keep existing transaction
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
        recurringTransaction: transactionData.recurringTransaction?.id ? 
          { id: transactionData.recurringTransaction.id } : null
      });
      
      return this.transactionsRepository.save(transaction);
    } else {
      // DTO format - use the standard create method with duplicate check skipped
      return this.create(transactionData, userId, undefined, true);
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

  private async mergeTransactions(duplicateTransaction: Transaction | null, newTransactionData: any): Promise<Transaction | null> {
    if (!duplicateTransaction) return null;
    
    // Create a clean object with only the fields we want to update
    const updateData: Partial<Transaction> = {};
    
    // Only include fields that are present in newTransactionData
    if (newTransactionData.description) updateData.description = newTransactionData.description;
    if (newTransactionData.amount !== undefined) updateData.amount = newTransactionData.amount;
    if (newTransactionData.type) updateData.type = newTransactionData.type;
    if (newTransactionData.status) updateData.status = newTransactionData.status;
    if (newTransactionData.executionDate) updateData.executionDate = new Date(newTransactionData.executionDate);
    
    // Only update if we have fields to update
    if (Object.keys(updateData).length > 0) {
      // Update the entity
      await this.transactionsRepository.update(duplicateTransaction.id, updateData);
      
      // Fetch the updated entity
      return this.transactionsRepository.findOne({ where: { id: duplicateTransaction.id } }) as Promise<Transaction>;
    }
    
    return duplicateTransaction;
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

  async importTransactions(importDto: ImportTransactionDto, userId: number): Promise<Transaction[]> {
    this.logger.log(`Starting import for user ${userId} with format: ${importDto.bankFormat || 'generic'}`);
    
    // Log a shorter version of the import data to avoid console flooding
    this.logger.debug(`Import DTO summary: bankFormat=${importDto.bankFormat}, bankAccountId=${importDto.bankAccountId}, dateFormat=${importDto.dateFormat}`);

    if (importDto.bankFormat) {
      switch (importDto.bankFormat) {
        case 'bnl_txt':
          return this.importFromBnlTxt(importDto, userId);
        case 'bnl_xls':
          return this.importFromBnlXls(importDto, userId);
        case 'webank':
          return this.importFromWebankHtmlXls(importDto, userId);
        case 'fineco':
          return this.importFromFinecoXls(importDto, userId);
        default:
          throw new BadRequestException(`Unsupported bank format: ${importDto.bankFormat}`);
      }
    }

    if (!importDto.csvData || !importDto.columnMappings) {
      throw new BadRequestException('Missing CSV data or column mappings');
    }

    // Check if the CSV data is base64 encoded and decode it if necessary
    let csvData = importDto.csvData;
    if (this.isBase64(csvData)) {
      try {
        csvData = Buffer.from(csvData, 'base64').toString('utf-8');
        this.logger.log('Successfully decoded base64 CSV data');
      } catch (error) {
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
    
    this.logger.log(`Successfully parsed ${records.length} records from CSV`);
    if (records.length > 0) {
      this.logger.debug(`First record sample: ${JSON.stringify(records[0])}`);
    } else {
      this.logger.warn('No records found in CSV data');
    }

    // Set a default date format if none is provided
    const dateFormat = importDto.dateFormat || 'yyyy-MM-dd'; // Default ISO format
    const bankAccountId = importDto.bankAccountId || null;
    const creditCardId = importDto.creditCardId || null;

    const transactions: Transaction[] = [];

    for (const record of records) {
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
        this.logger.error(`Invalid amount format: ${amountStr}`);
        throw new BadRequestException(`Invalid amount format: ${amountStr}`);
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
          throw new BadRequestException(`Invalid date format for executionDate: ${executionDateString}. Expected format: ${dateFormat}`);
        }
      }

      // Ensure description is not null or empty
      if (!transactionData.description) {
        throw new BadRequestException('Description is required for each transaction.');
      }

      // Handle bank account
      if (bankAccountId) {
        const bankAccount = await this.bankAccountsRepository.findOne({
          where: { id: bankAccountId, user: { id: userId } }
        });
        
        if (bankAccount) {
          transactionData.bankAccount = bankAccount;
        } else {
          // Optionally create a new bank account if it doesn't exist
          // Or you could throw an error if you don't want to auto-create accounts
          throw new BadRequestException(`Bank account "${bankAccountId}" not found. Please create it first.`);
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
          // Optionally create a new credit card if it doesn't exist
          // Or throw an error if you don't want to auto-create credit cards
          throw new BadRequestException(`Credit card "${creditCardId}" not found. Please create it first.`);
        }
      }

      // Validate that either bank account or credit card is provided, but not both
      if (transactionData.bankAccount && transactionData.creditCard) {
        throw new BadRequestException('A transaction cannot have both a bank account and a credit card.');
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
        transactions.push(transaction);
      } catch (error) {
        this.logger.error(`Error processing record: ${JSON.stringify(record)}`, error.stack);
        throw error;
      }
    }

    const detectedPatterns = await this.recurringPatternDetectorService.detectAllRecurringPatterns(userId);

    for (const pattern of detectedPatterns) {
      const fullTx = await this.transactionsRepository.findOne({
        where: { id: pattern.similarTransactions[0].id  },
        relations: ['user', 'category', 'tags', 'bankAccount', 'creditCard'],
      });

      if (fullTx) {
        await this.recurringPatternDetectorService.detectAndProcessRecurringTransaction(fullTx);
      }
    }

    this.logger.log(`Successfully imported ${transactions.length} transactions`);
    return transactions;
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

  private async importFromBnlTxt(importDto: ImportTransactionDto, userId: number): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
  
    if (!importDto.csvData) {
      throw new BadRequestException('Missing file content');
    }
  
    const lines = importDto.csvData
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  
    const rowRegex = /^\d+\s+(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+\d+\s+(.*)\s+([+-]?[0-9.,]+)$/;
  
    for (const line of lines) {
      const match = line.match(rowRegex);
      if (!match) continue;
  
      const [_, dateStr, rawDescription, rawAmount] = match;
  
      const executionDate = parseDate(dateStr, 'dd/MM/yyyy', new Date());
      const description = rawDescription.trim();
  
      // Convert to float
      const normalizedAmount = parseLocalizedAmount(rawAmount);
      const type = normalizedAmount >= 0 ? 'income' : 'expense';
  
      const transactionData: Partial<Transaction> = {
        description,
        amount: Math.abs(normalizedAmount),
        type,
        executionDate,
      };
  
      if (importDto.bankAccountId) {
        const bankAccount = await this.bankAccountsRepository.findOne({
          where: { id: importDto.bankAccountId, user: { id: userId } },
        });
        if (!bankAccount) throw new BadRequestException('Bank account not found');
        transactionData.bankAccount = bankAccount;
      }
  
      const transaction = await this.createAutomatedTransaction(
        transactionData,
        userId,
        'csv_import'
      );
      transactions.push(transaction);
    }
  
    return transactions;
  }

  private async importFromBnlXls(importDto: ImportTransactionDto, userId: number): Promise<Transaction[]> {
    if (!importDto.csvData) throw new BadRequestException('Missing XLS file content');

    const buffer = Buffer.from(importDto.csvData, 'base64');
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    const transactions: Transaction[] = [];

    sheet.eachRow((row, rowIndex) => {
      if (rowIndex === 1) return; // Skip header

      const dateStr = row.getCell(1).text;
      const description = row.getCell(3).text;
      const amountStr = row.getCell(4).text;

      if (!dateStr || !description || !amountStr) return;

      const executionDate = parseDate(dateStr, 'dd/MM/yyyy', new Date());
      const amount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
      const type = amount >= 0 ? 'income' : 'expense';

      const transactionData: Partial<Transaction> = {
        description: description.trim(),
        amount: Math.abs(amount),
        type,
        executionDate,
        bankAccount: importDto.bankAccountId ? { id: importDto.bankAccountId } as BankAccount : undefined,
      };

      transactions.push(transactionData as Transaction);
    });

    // Salva nel DB
    return Promise.all(
      transactions.map(tx =>
        this.createAutomatedTransaction(tx, userId, 'csv_import')
      )
    );
  }
  // ...

  private async importFromFinecoXls(importDto: ImportTransactionDto, userId: number): Promise<Transaction[]> {
    if (!importDto.csvData) {
      throw new BadRequestException('Missing XLS content');
    }

    const buffer = Buffer.from(importDto.csvData, 'base64');
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    const transactions: Transaction[] = [];

    let headerFound = false;
    let headers: string[] = [];

    sheet.eachRow((row, rowIndex) => {
      if (!headerFound) {
        const rawValues = Array.isArray(row.values) ? row.values : [];
        headers = rawValues
          .slice(1) // skip the first index (0) which is always empty
          .map((val) => (val !== undefined && val !== null ? String(val).trim() : ""));
    
        if (headers.includes("Data") && headers.includes("Descrizione_Completa")) {
          headerFound = true;
        }
        return;
      }

      const rowValues = row.values as string[];

      const getCell = (headerName: string): string =>
        row.getCell(headers.indexOf(headerName) + 1).text.trim();

      const dateStr = getCell("Data");
      const entrateStr = getCell("Entrate");
      const usciteStr = getCell("Uscite");
      const description = getCell("Descrizione_Completa");
      const tag = getCell("Descrizione");
      const category = getCell("Moneymap");

      if (!dateStr || !description) return;

      const executionDate = parseDate(dateStr, "dd/MM/yyyy", new Date());

      const amountRaw = entrateStr || usciteStr;
      const type = entrateStr ? "income" : "expense";
      const parsedAmount = parseLocalizedAmount(amountRaw);

      const transactionData: Partial<Transaction> = {
        description,
        amount: Math.abs(parsedAmount),
        type,
        executionDate,
        bankAccount: importDto.bankAccountId ? { id: importDto.bankAccountId } as BankAccount : undefined,
      };

      // ⬇️ Optional: Tag
      if (tag) {
        transactionData.tags = [{ id: -1, name: tag, transactions: [], user: { id: userId } as User, recurringTransactions: [] } as Tag]; // verrà gestito come creazione
      }

      // ⬇️ Optional: Category
      if (category) {
        transactionData.category = { id: -1, name: category } as Category;
      }

      transactions.push(transactionData as Transaction);
    });

    // Salvataggio con gestione tag e categoria (crea se non esiste)
    const createdTransactions: Transaction[] = [];

    for (const tx of transactions) {
      const data = { ...tx };

      // Gestione categoria
      if (tx.category?.name) {
        const existing = await this.categoriesService.findByName(tx.category.name, userId);
        data.category = existing || await this.categoriesService.create({ name: tx.category.name }, { id: userId } as User);
      }

      // Gestione tag
      if (tx.tags && tx.tags[0]?.name) {
        const existing = await this.tagsService.findByName(tx.tags[0].name, userId);
        data.tags = [existing || await this.tagsService.create({ name: tx.tags[0].name }, { id: userId } as User)];
      }

      const created = await this.createAutomatedTransaction(data, userId, "csv_import");
      createdTransactions.push(created);
    }

    return createdTransactions;
  }

  private async importFromWebankHtmlXls(importDto: ImportTransactionDto, userId: number): Promise<Transaction[]> {
    if (!importDto.csvData) {
      throw new BadRequestException('Missing Webank XLS content');
    }
  
    const html = Buffer.from(importDto.csvData, 'base64').toString('utf-8');
    const $ = cheerio.load(html);
    const rows = $('table tr');
  
    const parsedRows: {
      executionDate: Date;
      amount: number;
      type: 'income' | 'expense';
      description: string;
      tagStr?: string;
    }[] = [];
  
    rows.each((index, row) => {
      const cells = $(row).find('td');
      if (cells.length < 6) return;
  
      const valutaDateStr = $(cells[1]).text().trim(); // "Data Valuta"
      const amountStr = $(cells[2]).text().trim();     // "Importo"
      const description = $(cells[4]).text().trim();   // "Causale / Descrizione"
      const tagStr = $(cells[5]).text().trim();        // "Canale"
  
      if (!valutaDateStr || !amountStr || !description) return;
  
      try {
        const executionDate = parseDate(valutaDateStr, 'dd/MM/yyyy', new Date());
        const parsedAmount = parseLocalizedAmount(amountStr);
        const type = parsedAmount >= 0 ? 'income' : 'expense';
  
        parsedRows.push({
          executionDate,
          amount: Math.abs(parsedAmount),
          type,
          description,
          tagStr,
        });
      } catch (error) {
        console.warn(`[WEBANK IMPORT] Skipping row ${index + 1}: ${error}`);
      }
    });
  
    const transactions: Transaction[] = [];
  
    for (const row of parsedRows) {
      const transactionData: Partial<Transaction> = {
        description: row.description,
        amount: row.amount,
        type: row.type,
        executionDate: row.executionDate,
        bankAccount: importDto.bankAccountId ? { id: importDto.bankAccountId } as BankAccount : undefined,
      };
  
      if (row.tagStr) {
        transactionData.tags = await this.tagsService.resolveTagsFromString(row.tagStr, userId);
      }
  
      const transaction = await this.createAutomatedTransaction(transactionData, userId, 'csv_import');
      transactions.push(transaction);
    }
  
    return transactions;
  }
  
  

  async markTransactionAsRecurring(transaction: Transaction): Promise<void> {
    const recurringTransaction = await this.recurringPatternDetectorService.detectAndProcessRecurringTransaction(transaction);
    // TODO: Add source and sourceReference to the transaction 
    // TODO: Add logic to eventually select manually the recurring transaction
    if (recurringTransaction) {
      transaction.recurringTransaction = recurringTransaction;
      transaction.source = 'recurring';
      await this.transactionsRepository.save(transaction);
    }
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
      // Load full transaction with relations
      const fullTransaction = await this.transactionsRepository.findOne({
        where: { id: transaction.id },
        relations: ['user', 'category', 'tags', 'bankAccount', 'creditCard']
      });
      
      if (!fullTransaction) return;
      
      // Detect and process recurring pattern
      const recurringTransaction = await this.recurringPatternDetectorService.detectAndProcessRecurringTransaction(fullTransaction);
      
      // If a recurring transaction was detected or matched, update the original transaction
      if (recurringTransaction) {
        fullTransaction.recurringTransaction = recurringTransaction;
        await this.transactionsRepository.save(fullTransaction);
        
        // Optionally notify the user about the detected pattern
        // this.notificationService.notifyRecurringTransactionDetected(fullTransaction.user.id, recurringTransaction);
      }
    } catch (error) {
      // Log error but don't fail the transaction creation
      console.error('Error detecting recurring pattern:', error);
    }
  }

  async findByRecurringTransactionId(recurringTransactionId: number, userId: number): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      where: {
        recurringTransaction: { id: recurringTransactionId },
        user: { id: userId }
      },
      relations: ['category', 'tags', 'bankAccount', 'creditCard'],
      order: { executionDate: 'DESC' }
    });
  }

  async unlinkFromRecurringTransaction(
    transactionId: number, 
    recurringTransactionId: number, 
    userId: number
  ): Promise<Transaction> {
    // First verify the transaction belongs to this user and recurring transaction
    const transaction = await this.transactionsRepository.findOne({
      where: {
        id: transactionId,
        user: { id: userId },
        recurringTransaction: { id: recurringTransactionId }
      }
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found or not linked to this recurring transaction');
    }

    // Unlink the transaction
    transaction.recurringTransaction = null;
    transaction.source = 'manual'; // Reset source to manual
    
    return this.transactionsRepository.save(transaction);
  }

}
