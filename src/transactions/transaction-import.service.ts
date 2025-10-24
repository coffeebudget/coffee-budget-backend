import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './transaction.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { ImportLogsService } from './import-logs.service';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import { TransactionOperationsService } from './transaction-operations.service';
import { RecurringPatternDetectorService } from '../recurring-transactions/recurring-pattern-detector.service';
import { GocardlessService } from '../gocardless/gocardless.service';
import { BankFileParserFactory } from './parsers';
import { ImportStatus } from './entities/import-log.entity';
import { ImportTransactionDto } from './dto/import-transaction.dto';
import { parseLocalizedAmount } from '../utils/amount.utils';
import { parseDate } from '../utils/date-utils';
import { parse } from 'csv-parse/sync';

@Injectable()
export class TransactionImportService {
  private readonly logger = new Logger(TransactionImportService.name);

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
    private importLogsService: ImportLogsService,
    private categoriesService: CategoriesService,
    private tagsService: TagsService,
    private transactionOperationsService: TransactionOperationsService,
    private recurringPatternDetectorService: RecurringPatternDetectorService,
    private gocardlessService: GocardlessService,
  ) {}

  async importTransactions(
    importDto: ImportTransactionDto,
    userId: number,
  ): Promise<{
    transactions: Transaction[];
    importLogId: number;
    status: ImportStatus;
  }> {
    this.logger.log(
      `Starting import for user ${userId} with format: ${importDto.bankFormat || 'generic'}`,
    );

    // Create an import log entry
    const importLog = await this.importLogsService.create({
      userId,
      status: ImportStatus.PROCESSING,
      source: 'csv',
      format: importDto.bankFormat || 'generic',
      fileName: importDto.fileName || 'Unknown file',
      startTime: new Date(),
      logs: `Started import process for user ${userId} with format: ${importDto.bankFormat || 'generic'}`,
    });

    try {
      // Bank-specific import formats
      if (importDto.bankFormat) {
        return await this.processBankSpecificImport(importDto, userId, importLog.id);
      }

      // Generic CSV import
      return await this.processGenericImport(importDto, userId, importLog.id);
    } catch (error) {
      // Handle any uncaught errors
      const errorMessage = `Import failed with error: ${error.message}`;
      this.logger.error(errorMessage, error.stack);

      await this.importLogsService.updateStatus(
        importLog.id,
        ImportStatus.FAILED,
        errorMessage,
      );

      throw new BadRequestException(errorMessage);
    }
  }

  async processBankSpecificImport(
    importDto: ImportTransactionDto,
    userId: number,
    importLogId: number,
  ): Promise<{
    transactions: Transaction[];
    importLogId: number;
    status: ImportStatus;
  }> {
    try {
      await this.importLogsService.appendToLog(
        importLogId,
        `Using bank-specific parser: ${importDto.bankFormat}`,
      );

      const parser = BankFileParserFactory.getParser(importDto.bankFormat!);
      const parsedTransactions = await parser.parseFile(
        importDto.csvData || '',
        {
          bankAccountId: importDto.bankAccountId,
          creditCardId: importDto.creditCardId,
          userId,
        },
      );

      await this.importLogsService.appendToLog(
        importLogId,
        `Successfully parsed ${parsedTransactions.length} transactions from ${importDto.bankFormat} file`,
      );
      await this.importLogsService.update(importLogId, {
        totalRecords: parsedTransactions.length,
        processedRecords: 0,
        successfulRecords: 0,
        failedRecords: 0,
      });

      // Process parsed transactions before saving
      for (const tx of parsedTransactions) {
        // Calculate billing date for credit card transactions
        if (tx.creditCard && tx.creditCard.id && tx.executionDate) {
          // Fetch the credit card to get the billing day
          const creditCard = await this.creditCardsRepository.findOne({
            where: { id: tx.creditCard.id, user: { id: userId } },
          });

          if (creditCard) {
            tx.billingDate = this.calculateBillingDate(
              tx.executionDate,
              creditCard.billingDay,
            );
          }
        } else if (tx.bankAccount && tx.executionDate) {
          // For bank account transactions, billing date equals execution date
          tx.billingDate = new Date(tx.executionDate);
        }

        // Add keyword-based category suggestion based on description
        if (!tx.category && tx.description) {
          const suggestedCategory = await this.categoriesService.suggestCategoryForDescription(
            tx.description,
            userId,
          );

          if (suggestedCategory) {
            tx.category = suggestedCategory;
            tx.suggestedCategoryName = suggestedCategory.name;
          }
        }

        // Process tagNames if provided by bank-specific parsers (e.g., Fineco)
        if ((tx as any).tagNames && Array.isArray((tx as any).tagNames)) {
          const tagNames = (tx as any).tagNames;
          const createdTags: Tag[] = [];

          for (const tagName of tagNames) {
            const existingTag = await this.tagsService.findByName(
              tagName,
              userId,
            );
            if (existingTag) {
              createdTags.push(existingTag);
            } else {
              const newTag = await this.tagsService.create(
                { name: tagName },
                { id: userId } as any,
              );
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
          const transaction = await this.transactionOperationsService.createAutomatedTransaction(
            tx,
            userId,
            'csv_import',
          );

          if (transaction) {
            createdTransactions.push(transaction);
            successCount++;
          } else {
            // Transaction was prevented due to 100% duplicate match
            await this.importLogsService.appendToLog(
              importLogId,
              `Prevented duplicate transaction: ${tx.description} (${tx.amount})`,
            );
            successCount++; // Still count as successful since it was handled
          }

          // Update import log every 10 transactions or at the end
          if (i % 10 === 0 || i === parsedTransactions.length - 1) {
            await this.importLogsService.incrementCounters(importLogId, {
              processed: 1,
              successful: 1,
            });
          }
        } catch (error) {
          failCount++;
          await this.importLogsService.appendToLog(
            importLogId,
            `Error processing transaction ${i + 1}: ${error.message}`,
          );

          await this.importLogsService.incrementCounters(importLogId, {
            processed: 1,
            failed: 1,
          });
        }
      }

      const summary = `Import completed. Successfully imported ${successCount} of ${parsedTransactions.length} transactions.`;
      const finalStatus =
        successCount === parsedTransactions.length
          ? ImportStatus.COMPLETED
          : ImportStatus.PARTIALLY_COMPLETED;

      await this.importLogsService.updateStatus(
        importLogId,
        finalStatus,
        summary,
      );

      return {
        transactions: createdTransactions,
        importLogId,
        status: finalStatus,
      };
    } catch (error) {
      await this.importLogsService.appendToLog(
        importLogId,
        `Failed to import ${importDto.bankFormat} file: ${error.message}`,
      );

      await this.importLogsService.updateStatus(
        importLogId,
        ImportStatus.FAILED,
        `Import failed: ${error.message}`,
      );

      this.logger.error(
        `Failed to import ${importDto.bankFormat} file: ${error.message}`,
      );
      throw new BadRequestException(
        `Failed to parse ${importDto.bankFormat} file: ${error.message}`,
      );
    }
  }

  async processGenericImport(
    importDto: ImportTransactionDto,
    userId: number,
    importLogId: number,
  ): Promise<{
    transactions: Transaction[];
    importLogId: number;
    status: ImportStatus;
  }> {
    // Generic CSV import
    if (!importDto.csvData || !importDto.columnMappings) {
      await this.importLogsService.updateStatus(
        importLogId,
        ImportStatus.FAILED,
        'Import failed: Missing CSV data or column mappings',
      );

      throw new BadRequestException('Missing CSV data or column mappings');
    }

    // Check if the CSV data is base64 encoded and decode it if necessary
    let csvData = importDto.csvData;
    if (this.isBase64(csvData)) {
      try {
        csvData = Buffer.from(csvData, 'base64').toString('utf-8');
        await this.importLogsService.appendToLog(
          importLogId,
          'Successfully decoded base64 CSV data',
        );
      } catch (error) {
        await this.importLogsService.appendToLog(
          importLogId,
          `Failed to decode base64 data: ${error.message}`,
        );

        await this.importLogsService.updateStatus(
          importLogId,
          ImportStatus.FAILED,
          `Import failed: Invalid CSV data format`,
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
      trim: true,
    });

    await this.importLogsService.appendToLog(
      importLogId,
      `Successfully parsed ${records.length} records from CSV`,
    );
    await this.importLogsService.update(importLogId, {
      totalRecords: records.length,
      processedRecords: 0,
      successfulRecords: 0,
      failedRecords: 0,
    });

    this.logger.log(`Successfully parsed ${records.length} records from CSV`);
    if (records.length > 0) {
      this.logger.debug(`First record sample: ${JSON.stringify(records[0])}`);
      await this.importLogsService.appendToLog(
        importLogId,
        `First record sample: ${JSON.stringify(records[0])}`,
      );
    } else {
      this.logger.warn('No records found in CSV data');
      await this.importLogsService.appendToLog(
        importLogId,
        'No records found in CSV data',
      );
      await this.importLogsService.updateStatus(
        importLogId,
        ImportStatus.COMPLETED,
        'Import completed: No records found in CSV data',
      );

      return {
        transactions: [],
        importLogId,
        status: ImportStatus.COMPLETED,
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
        await this.importLogsService.appendToLog(
          importLogId,
          `Processing record ${i + 1}/${records.length}`,
        );

        this.logger.debug(`Processing record: ${JSON.stringify(record)}`);
        const transactionData: Partial<Transaction> = {};

        // Map CSV columns to transaction fields based on columnMappings
        transactionData.description =
          record[importDto.columnMappings.description];
        this.logger.debug(
          `Mapped description: ${transactionData.description}`,
        );

        // Parse amount with proper handling of different number formats
        const amountStr = record[importDto.columnMappings.amount];
        this.logger.debug(`Raw amount string: ${amountStr}`);

        const parsedAmount = parseLocalizedAmount(amountStr);
        this.logger.debug(`Parsed amount: ${parsedAmount}`);

        // Check if parsing was successful
        if (isNaN(parsedAmount)) {
          const errorMessage = `Invalid amount format: ${amountStr}`;
          this.logger.error(errorMessage);
          await this.importLogsService.appendToLog(
            importLogId,
            errorMessage,
          );
          await this.importLogsService.incrementCounters(importLogId, {
            processed: 1,
            failed: 1,
          });
          failCount++;
          continue;
        }

        transactionData.amount = parsedAmount;

        // Determine transaction type
        transactionData.type =
          record[importDto.columnMappings.type] ||
          (transactionData.amount >= 0 ? 'income' : 'expense');

        // Normalize the amount based on transaction type
        transactionData.amount = this.normalizeAmount(
          transactionData.amount,
          transactionData.type as 'income' | 'expense',
        );

        // Parse executionDate using the provided date format or default
        const executionDateString =
          record[importDto.columnMappings.executionDate];
        if (executionDateString) {
          try {
            transactionData.executionDate = parseDate(
              executionDateString,
              dateFormat,
              new Date(),
            );
          } catch (error) {
            const errorMessage = `Invalid date format for executionDate: ${executionDateString}. Expected format: ${dateFormat}`;
            await this.importLogsService.appendToLog(
              importLogId,
              errorMessage,
            );
            await this.importLogsService.incrementCounters(importLogId, {
              processed: 1,
              failed: 1,
            });
            failCount++;
            continue;
          }
        }

        // Ensure description is not null or empty
        if (!transactionData.description) {
          const errorMessage =
            'Description is required for each transaction.';
          await this.importLogsService.appendToLog(
            importLogId,
            errorMessage,
          );
          await this.importLogsService.incrementCounters(importLogId, {
            processed: 1,
            failed: 1,
          });
          failCount++;
          continue;
        }

        // Handle bank account
        if (bankAccountId) {
          const bankAccount = await this.bankAccountsRepository.findOne({
            where: { id: bankAccountId, user: { id: userId } },
          });

          if (bankAccount) {
            transactionData.bankAccount = bankAccount;
          } else {
            const errorMessage = `Bank account "${bankAccountId}" not found. Please create it first.`;
            await this.importLogsService.appendToLog(
              importLogId,
              errorMessage,
            );
            await this.importLogsService.incrementCounters(importLogId, {
              processed: 1,
              failed: 1,
            });
            failCount++;
            continue;
          }
        }

        // Handle credit card
        if (creditCardId) {
          const creditCard = await this.creditCardsRepository.findOne({
            where: { id: creditCardId, user: { id: userId } },
          });

          if (creditCard) {
            transactionData.creditCard = creditCard;

            // Calculate billing date if credit card is provided
            if (transactionData.executionDate) {
              transactionData.billingDate = this.calculateBillingDate(
                transactionData.executionDate,
                creditCard.billingDay,
              );
            }
          } else {
            const errorMessage = `Credit card "${creditCardId}" not found. Please create it first.`;
            await this.importLogsService.appendToLog(
              importLogId,
              errorMessage,
            );
            await this.importLogsService.incrementCounters(importLogId, {
              processed: 1,
              failed: 1,
            });
            failCount++;
            continue;
          }
        }

        // Validate that either bank account or credit card is provided, but not both
        if (transactionData.bankAccount && transactionData.creditCard) {
          const errorMessage =
            'A transaction cannot have both a bank account and a credit card.';
          await this.importLogsService.appendToLog(
            importLogId,
            errorMessage,
          );
          await this.importLogsService.incrementCounters(importLogId, {
            processed: 1,
            failed: 1,
          });
          failCount++;
          continue;
        }

        // Handle category creation
        const categoryName = record[importDto.columnMappings.categoryName];
        if (categoryName) {
          const existingCategory = await this.categoriesService.findByName(
            categoryName,
            userId,
          );
          if (!existingCategory) {
            const newCategory = await this.categoriesService.create(
              {
                name: categoryName,
              },
              { id: userId } as any,
            );
            transactionData.category = newCategory;
          } else {
            transactionData.category = existingCategory;
          }
        } else {
          const suggestedCategory =
            await this.categoriesService.suggestCategoryForDescription(
              transactionData.description,
              userId,
            );
          if (suggestedCategory) {
            transactionData.category = suggestedCategory;
          }
        }

        // Handle tag creation
        const tagNames = record[importDto.columnMappings.tagNames];
        if (tagNames) {
          const tagNamesArray = tagNames.split(',').map((tag) => tag.trim());
          const createdTags: Tag[] = [];

          for (const tagName of tagNamesArray) {
            const existingTag = await this.tagsService.findByName(
              tagName,
              userId,
            );
            if (!existingTag) {
              const newTag = await this.tagsService.create(
                { name: tagName },
                { id: userId } as any,
              );
              createdTags.push(newTag);
            } else {
              createdTags.push(existingTag);
            }
          }
          transactionData.tags = createdTags;
        }

        try {
          const transaction = await this.transactionOperationsService.createAutomatedTransaction(
            transactionData,
            userId,
            'csv_import',
          );

          if (transaction) {
            this.logger.debug(
              `Created transaction: ${JSON.stringify(transaction)}`,
            );
            await this.importLogsService.appendToLog(
              importLogId,
              `Successfully created transaction for "${transactionData.description}"`,
            );
            transactions.push(transaction);
            successCount++;
          } else {
            // Transaction was prevented due to 100% duplicate match
            await this.importLogsService.appendToLog(
              importLogId,
              `Prevented duplicate transaction: ${transactionData.description} (${transactionData.amount})`,
            );
            successCount++; // Still count as successful since it was handled
          }

          await this.importLogsService.incrementCounters(importLogId, {
            processed: 1,
            successful: 1,
          });
        } catch (error) {
          this.logger.error(
            `Error processing record: ${JSON.stringify(record)}`,
            error.stack,
          );
          await this.importLogsService.appendToLog(
            importLogId,
            `Error processing record: ${error.message}`,
          );
          await this.importLogsService.incrementCounters(importLogId, {
            processed: 1,
            failed: 1,
          });
          failCount++;
        }
      } catch (error) {
        this.logger.error(
          `Unexpected error processing record: ${error.message}`,
        );
        await this.importLogsService.appendToLog(
          importLogId,
          `Unexpected error: ${error.message}`,
        );
        await this.importLogsService.incrementCounters(importLogId, {
          processed: 1,
          failed: 1,
        });
        failCount++;
      }
    }

    // Process for recurring patterns
    await this.processForRecurringPatterns(transactions, userId);

    const summary = `Import completed. Successfully imported ${successCount} of ${records.length} transactions.`;
    this.logger.log(summary);

    const finalStatus =
      failCount > 0
        ? ImportStatus.PARTIALLY_COMPLETED
        : ImportStatus.COMPLETED;

    await this.importLogsService.updateStatus(
      importLogId,
      finalStatus,
      summary,
    );

    return {
      transactions,
      importLogId,
      status: finalStatus,
    };
  }

  async processTransactionData(
    transactionData: Partial<Transaction>,
    userId: number,
  ): Promise<Partial<Transaction>> {
    // Add keyword-based category suggestion based on description
    if (!transactionData.category && transactionData.description) {
      const suggestedCategory = await this.categoriesService.suggestCategoryForDescription(
        transactionData.description,
        userId,
      );

      if (suggestedCategory) {
        transactionData.category = suggestedCategory;
        transactionData.suggestedCategoryName = suggestedCategory.name;
      }
    }

    // Process tagNames if provided
    if ((transactionData as any).tagNames && Array.isArray((transactionData as any).tagNames)) {
      const tagNames = (transactionData as any).tagNames;
      const createdTags: Tag[] = [];

      for (const tagName of tagNames) {
        const existingTag = await this.tagsService.findByName(
          tagName,
          userId,
        );
        if (existingTag) {
          createdTags.push(existingTag);
        } else {
          const newTag = await this.tagsService.create(
            { name: tagName },
            { id: userId } as any,
          );
          createdTags.push(newTag);
        }
      }

      transactionData.tags = createdTags;
      // Remove the temporary tagNames property
      delete (transactionData as any).tagNames;
    }

    return transactionData;
  }

  calculateBillingDate(executionDate: Date, billingDay: number): Date {
    const billingDate = new Date(executionDate);
    billingDate.setMonth(billingDate.getMonth() + 1);
    billingDate.setDate(billingDay);
    return billingDate;
  }

  async processForRecurringPatterns(
    transactions: Transaction[],
    userId: number,
  ): Promise<void> {
    try {
      // Only analyze patterns, don't create recurring transactions
      await this.recurringPatternDetectorService.detectAllRecurringPatterns(
        userId,
      );
    } catch (error) {
      this.logger.error(
        `Error processing recurring patterns: ${error.message}`,
      );
    }
  }

  // Helper method to check if a string is base64 encoded
  isBase64(str: string): boolean {
    // A simple check for base64 encoding pattern
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    // Additional check to avoid false positives with short strings
    return base64Regex.test(str) && str.length % 4 === 0 && str.length > 20;
  }

  /**
   * Normalizes the amount based on transaction type
   * @param amount The amount to normalize
   * @param type The transaction type
   * @returns The amount with the correct sign
   */
  normalizeAmount(amount: number, type: 'income' | 'expense'): number {
    const absAmount = Math.abs(amount);
    return type === 'income' ? absAmount : -absAmount;
  }
}
