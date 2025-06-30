import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { Transaction } from './transaction.entity';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/user.decorator';
import { User } from '../users/user.entity';
import { DuplicateTransactionChoiceDto } from './dto/duplicate-transaction-choice.dto';
import { ImportTransactionDto } from './dto/import-transaction.dto';
import { CategoriesService } from '../categories/categories.service';
import { BulkCategorizeDto } from './dto/bulk-categorize.dto';
import { BulkUncategorizeDto } from './dto/bulk-uncategorize.dto';
import { BulkDeleteDto } from './dto/bulk-delete.dto';
import { PayPalEnrichmentDto } from './dto/paypal-enrichment.dto';
import { GocardlessImportDto } from './dto/gocardless-import.dto';
import { parse } from 'csv-parse/sync';
import { parseDate } from '../utils/date-utils';
import { parseLocalizedAmount } from '../utils/amount.utils';
import { Logger } from '@nestjs/common';

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('transactions')
@UseGuards(AuthGuard('jwt'))
export class TransactionsController {
  private readonly logger = new Logger(TransactionsController.name);

  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  @Post()
  @ApiResponse({ status: 201, description: 'Create a new transaction.' })
  async create(
    @Body() createTransactionDto: CreateTransactionDto,
    @CurrentUser() user: User,
  ) {
    try {
      if (!user || !user.id) {
        throw new UnauthorizedException(
          'User not authenticated or user ID missing',
        );
      }

      const transaction =
        await this.transactionsService.createAndSaveTransaction(
          createTransactionDto,
          user.id,
          createTransactionDto.duplicateChoice || undefined,
        );

      // If transaction has a category, extract suggested keywords
      if (transaction && transaction.category && transaction.description) {
        const suggestedKeywords =
          await this.categoriesService.suggestKeywordsFromTransaction(
            transaction,
          );

        // Return the transaction with suggested keywords
        return {
          ...transaction,
          suggestedKeywords,
        };
      }

      return transaction;
    } catch (error) {
      if (
        error instanceof ConflictException &&
        error.message === 'Duplicate transaction detected'
      ) {
        // Return the conflict with details so the frontend can handle it
        throw error;
      }
      throw error;
    }
  }

  @Post('resolve-duplicate/:id')
  async resolveDuplicate(
    @Param('id') duplicateId: string,
    @Body() choiceDto: DuplicateTransactionChoiceDto,
    @Body() createTransactionDto: CreateTransactionDto,
    @CurrentUser() user: User,
  ) {
    const duplicateTransaction = await this.transactionsService.findOne(
      +duplicateId,
      user.id,
    );

    return this.transactionsService.handleDuplicateConfirmation(
      duplicateTransaction,
      createTransactionDto,
      user.id,
      choiceDto.choice,
    );
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Retrieve all transactions.' })
  findAll(@CurrentUser() user: User): Promise<Transaction[]> {
    return this.transactionsService.findAll(user.id);
  }

  @Get('income')
  @ApiResponse({
    status: 200,
    description: 'Retrieve all income transactions.',
  })
  findIncome(@CurrentUser() user: User): Promise<Transaction[]> {
    return this.transactionsService.findByType('income', user.id); // ✅ Fetch only incomes
  }

  @Get('expense')
  @ApiResponse({
    status: 200,
    description: 'Retrieve all expense transactions.',
  })
  findExpenses(@CurrentUser() user: User): Promise<Transaction[]> {
    return this.transactionsService.findByType('expense', user.id); // ✅ Fetch only expenses
  }

  @Post('import')
  @ApiOperation({
    summary: 'Import transactions from CSV or bank-specific file format',
  })
  @ApiResponse({
    status: 200,
    description: 'Import process started or completed successfully',
  })
  async importTransactions(
    @Body() importDto: ImportTransactionDto,
    @CurrentUser() user: User,
  ) {
    const result = await this.transactionsService.importTransactions(
      importDto,
      user.id,
    );
    return {
      importLogId: result.importLogId,
      transactionsCount: result.transactions.length,
      status: result.status,
      message: `Import process ${result.status.toLowerCase()} with ${result.transactions.length} transactions`,
    };
  }

  @Post('import/gocardless')
  @ApiOperation({ summary: 'Import transactions from GoCardless API' })
  @ApiResponse({
    status: 200,
    description: 'GoCardless import completed successfully',
  })
  async importFromGoCardless(
    @Body() importDto: GocardlessImportDto,
    @CurrentUser() user: User,
  ) {
    const result = await this.transactionsService.importFromGoCardless(
      importDto.accountId,
      user.id,
      {
        bankAccountId: importDto.bankAccountId,
        creditCardId: importDto.creditCardId,
        skipDuplicateCheck: importDto.skipDuplicateCheck || false,
        createPendingForDuplicates: importDto.createPendingForDuplicates !== false, // Default to true
        dateFrom: importDto.dateFrom ? new Date(importDto.dateFrom) : undefined,
        dateTo: importDto.dateTo ? new Date(importDto.dateTo) : undefined,
      },
    );

    return {
      importLogId: result.importLogId,
      transactionsCount: result.transactions.length,
      newTransactionsCount: result.newTransactionsCount,
      duplicatesCount: result.duplicatesCount,
      pendingDuplicatesCreated: result.pendingDuplicatesCreated,
      status: result.status,
      message: `GoCardless import completed: ${result.newTransactionsCount} new transactions, ${result.duplicatesCount} duplicates handled, ${result.pendingDuplicatesCreated} pending duplicates created for review`,
    };
  }

  @Post('bulk-categorize')
  @ApiOperation({ summary: 'Bulk categorize transactions by their IDs' })
  @ApiResponse({
    status: 200,
    description: 'Transactions categorized successfully',
  })
  async bulkCategorize(
    @Body() bulkCategorizeDto: BulkCategorizeDto,
    @CurrentUser() user: User,
  ) {
    const count = await this.transactionsService.bulkCategorizeByIds(
      bulkCategorizeDto.transaction_ids,
      bulkCategorizeDto.category_id,
      user.id,
    );
    return { count, message: `${count} transactions categorized successfully` };
  }

  @Post('bulk-uncategorize')
  @ApiOperation({
    summary:
      'Bulk uncategorize transactions by removing their category assignments',
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions uncategorized successfully',
  })
  async bulkUncategorize(
    @Body() bulkUncategorizeDto: BulkUncategorizeDto,
    @CurrentUser() user: User,
  ) {
    const count = await this.transactionsService.bulkUncategorizeByIds(
      bulkUncategorizeDto.transaction_ids,
      user.id,
    );
    return {
      count,
      message: `${count} transactions uncategorized successfully`,
    };
  }

  @Post('paypal-enrich')
  @ApiOperation({ summary: 'Enrich existing transactions with PayPal data' })
  @ApiResponse({
    status: 200,
    description: 'Transactions enriched with PayPal data',
  })
  async enrichWithPayPal(
    @Body() paypalEnrichmentDto: PayPalEnrichmentDto,
    @CurrentUser() user: User,
  ) {
    try {
      // Handle potential Base64 encoding
      let csvData = paypalEnrichmentDto.csvData;

      // Check if the data is Base64 encoded
      const isBase64 =
        /^[A-Za-z0-9+/=]+$/.test(csvData) && csvData.length % 4 === 0;
      if (isBase64) {
        try {
          this.logger.log('Base64 encoded data detected, decoding');
          csvData = Buffer.from(csvData, 'base64').toString('utf8');
        } catch (error) {
          this.logger.error(`Error decoding Base64 data: ${error.message}`);
        }
      }

      // Remove BOM if present
      if (csvData.startsWith('\uFEFF')) {
        this.logger.log('BOM detected in CSV data, removing it');
        csvData = csvData.substring(1);
      }

      // Log the beginning of the CSV to aid in debugging
      this.logger.debug(`CSV data beginning: ${csvData.substring(0, 100)}...`);

      // Parse the CSV data into transactions
      let records;
      try {
        records = parse(csvData, {
          columns: true,
          skip_empty_lines: true,
          delimiter: ',',
          trim: true,
          skip_records_with_empty_values: true,
          relax_quotes: true,
        });

        // Validate required columns are present
        const requiredHeaders = [
          'Data',
          'Nome',
          'Tipo',
          'Stato',
          'Valuta',
          'Importo',
        ];

        if (!records || records.length === 0) {
          this.logger.error(
            `No records parsed from CSV data. CSV beginning: ${csvData.substring(0, 200)}`,
          );
          throw new BadRequestException('No records found in PayPal CSV');
        }

        // Check required headers - handle both quoted and unquoted headers
        const firstRecord = records[0];
        const availableHeaders = Object.keys(firstRecord);

        this.logger.debug(`CSV headers found: ${availableHeaders.join(', ')}`);

        for (const header of requiredHeaders) {
          // Check if header exists directly or with quotes
          const headerExists = availableHeaders.some(
            (h) =>
              h === header ||
              h === `"${header}"` ||
              h.replace(/"/g, '') === header,
          );

          if (!headerExists) {
            throw new BadRequestException(
              `Invalid PayPal CSV format. Missing required header: ${header}`,
            );
          }
        }
      } catch (error) {
        this.logger.error(`CSV parsing error: ${error.message}`);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException(
          `Failed to parse PayPal CSV data: ${error.message}`,
        );
      }

      // Process the records into the format expected by enrichTransactionsWithPayPal
      const paypalTransactions = records
        .map((record) => {
          try {
            // Get field values, handling both quoted and unquoted header formats
            const getField = (fieldName) => {
              // Try different variations of the field name
              const variations = [
                fieldName,
                `"${fieldName}"`,
                fieldName.replace(/"/g, ''),
              ];

              for (const variation of variations) {
                if (variation in record) {
                  // Strip quotes from the value if present
                  const value = record[variation];
                  return typeof value === 'string'
                    ? value.replace(/^"(.*)"$/, '$1')
                    : value;
                }
              }
              return null;
            };

            const dateStr = getField('Data');
            if (!dateStr) {
              this.logger.warn(
                `Record missing date: ${JSON.stringify(record)}`,
              );
              return null;
            }

            const date = parseDate(dateStr, 'dd/MM/yyyy');

            const rawAmount = getField('Importo');
            if (!rawAmount) {
              this.logger.warn(
                `Record missing amount: ${JSON.stringify(record)}`,
              );
              return null;
            }

            const amount = parseLocalizedAmount(rawAmount);

            return {
              date,
              name: getField('Nome'),
              amount,
              status: getField('Stato'),
              type: getField('Tipo'),
            };
          } catch (error) {
            this.logger.warn(
              `Error processing PayPal record: ${error.message}`,
            );
            return null;
          }
        })
        .filter(Boolean); // Remove null entries

      if (paypalTransactions.length === 0) {
        throw new BadRequestException(
          'No valid transactions found in PayPal CSV',
        );
      }

      this.logger.log(
        `Processing ${paypalTransactions.length} valid PayPal transactions`,
      );

      const count = await this.transactionsService.enrichTransactionsWithPayPal(
        paypalTransactions,
        user.id,
        paypalEnrichmentDto.dateRangeForMatching,
      );

      return {
        count,
        message: `${count} transactions enriched with PayPal data`,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to process PayPal data: ${error.message}`,
      );
    }
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Retrieve a transaction by ID.' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<Transaction> {
    return this.transactionsService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, description: 'Update a transaction.' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTransactionDto: UpdateTransactionDto,
    @CurrentUser() user: User,
  ) {
    const transaction = await this.transactionsService.update(
      id,
      updateTransactionDto,
      user.id,
    );

    // If transaction has a category after update, extract suggested keywords
    if (transaction && transaction.category && transaction.description) {
      const suggestedKeywords =
        await this.categoriesService.suggestKeywordsFromTransaction(
          transaction,
        );

      // Return the transaction with suggested keywords
      return {
        ...transaction,
        suggestedKeywords,
      };
    }

    return transaction;
  }

  @Delete(':id')
  @ApiResponse({ status: 204, description: 'Delete a transaction.' })
  delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.transactionsService.delete(id, user.id);
  }

  @Post(':id/accept-suggested-category')
  @ApiOperation({
    summary: 'Accept the suggested category for a transaction',
  })
  @ApiResponse({
    status: 200,
    description: 'Suggested category accepted successfully',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 400, description: 'No suggested category available' })
  acceptSuggestedCategory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.transactionsService.acceptSuggestedCategory(id, user.id);
  }

  @Post(':id/reject-suggested-category')
  @ApiOperation({
    summary: 'Reject the suggested category for a transaction',
  })
  @ApiResponse({
    status: 200,
    description: 'Suggested category rejected successfully',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 400, description: 'No suggested category available' })
  rejectSuggestedCategory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.transactionsService.rejectSuggestedCategory(id, user.id);
  }

  @Post('bulk-ai-categorize')
  @ApiOperation({
    summary: 'Bulk keyword-based categorization for uncategorized transactions',
    description:
      'Smart categorization using keywords only (AI categorization removed)',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk categorization completed',
    schema: {
      type: 'object',
      properties: {
        totalProcessed: { type: 'number' },
        keywordMatched: { type: 'number' },
        aiSuggestions: { type: 'number' },
        errors: { type: 'number' },
        estimatedCost: { type: 'number' },
      },
    },
  })
  bulkAiCategorize(@CurrentUser() user: User) {
    return this.transactionsService.bulkAiCategorizeUncategorized(user.id);
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Bulk delete transactions by their IDs' })
  @ApiResponse({
    status: 200,
    description: 'Transactions deleted successfully',
  })
  async bulkDelete(
    @Body() bulkDeleteDto: BulkDeleteDto,
    @CurrentUser() user: User,
  ) {
    const count = await this.transactionsService.bulkDeleteByIds(
      bulkDeleteDto.transaction_ids,
      user.id,
    );
    return { count, message: `${count} transactions deleted successfully` };
  }
}
