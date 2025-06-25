import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Transaction } from '../transaction.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { parse } from 'csv-parse/sync';
import { addDays, subDays } from 'date-fns';
import { parseLocalizedAmount } from '../../utils/amount.utils';
import { parseDate } from '../../utils/date-utils';

interface PayPalTransaction {
  date: Date;
  name: string;
  type: string;
  status: string;
  currency: string;
  amount: number;
  rawAmount: string;
}

interface EnrichmentResult {
  enriched: Transaction[];
  unmatched: PayPalTransaction[];
  total: number;
}

@Injectable()
export class PayPalEnrichmentParser {
  private readonly logger = new Logger(PayPalEnrichmentParser.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
  ) {}

  async parseAndEnrich(
    data: string,
    options: {
      userId: number;
      dateRangeForMatching?: number; // Number of days to look for matching transactions (default: 5)
    },
  ): Promise<EnrichmentResult> {
    if (!data) {
      throw new BadRequestException('Missing PayPal CSV content');
    }

    try {
      // Parse the CSV data
      const paypalTransactions = await this.parsePayPalCsv(data);

      this.logger.debug(
        `Parsed ${paypalTransactions.length} PayPal transactions`,
      );

      // Filter valid transactions (completed, with name, not generic funding)
      const validTransactions =
        this.filterValidTransactions(paypalTransactions);

      this.logger.debug(
        `Found ${validTransactions.length} valid PayPal transactions for enrichment`,
      );

      // Find and enrich matching transactions
      const enrichmentResults = await this.findAndEnrichTransactions(
        validTransactions,
        options.userId,
        options.dateRangeForMatching || 5,
      );

      return {
        enriched: enrichmentResults.enriched,
        unmatched: enrichmentResults.unmatched,
        total: validTransactions.length,
      };
    } catch (error) {
      this.logger.error(`Error parsing PayPal data: ${error.message}`);
      throw new BadRequestException(
        `Failed to parse PayPal data: ${error.message}`,
      );
    }
  }

  private async parsePayPalCsv(csvData: string): Promise<PayPalTransaction[]> {
    try {
      // Parse CSV data
      const records = parse(csvData, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ',',
        trim: true,
      });

      if (!records.length) {
        throw new BadRequestException('No records found in PayPal CSV');
      }

      // Check for expected headers - Handle both quoted and unquoted headers
      const expectedHeaders = [
        'Data',
        'Nome',
        'Tipo',
        'Stato',
        'Valuta',
        'Importo',
      ];
      const firstRecord = records[0];
      const availableHeaders = Object.keys(firstRecord);

      for (const header of expectedHeaders) {
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

      // Helper function to get field value regardless of quotes
      const getField = (record, fieldName) => {
        // Try different variations of the field name
        const variations = [
          fieldName,
          `"${fieldName}"`,
          fieldName.replace(/"/g, ''),
        ];

        for (const variation of variations) {
          if (variation in record) {
            return record[variation];
          }
        }
        return null;
      };

      // Convert records to PayPalTransaction objects
      return records
        .map((record) => {
          try {
            const dateStr = getField(record, 'Data');
            const date = parseDate(dateStr, 'dd/MM/yyyy');

            const rawAmount = getField(record, 'Importo');
            const amount = parseLocalizedAmount(rawAmount);

            return {
              date,
              name: getField(record, 'Nome'),
              type: getField(record, 'Tipo'),
              status: getField(record, 'Stato'),
              currency: getField(record, 'Valuta'),
              amount,
              rawAmount,
            };
          } catch (error) {
            this.logger.warn(
              `Skipping record due to parsing error: ${error.message}`,
            );
            return null;
          }
        })
        .filter(Boolean);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to parse PayPal CSV: ${error.message}`,
      );
    }
  }

  private filterValidTransactions(
    transactions: PayPalTransaction[],
  ): PayPalTransaction[] {
    return transactions.filter((transaction) => {
      // Must have a name (merchant)
      if (!transaction.name) {
        return false;
      }

      // Must be completed
      if (transaction.status !== 'Completata') {
        return false;
      }

      // Skip generic funding transactions
      if (transaction.type === 'Versamento generico con carta') {
        return false;
      }

      // Skip transactions without a financial impact (balance transfers, etc.)
      if (transaction.amount === 0) {
        return false;
      }

      return true;
    });
  }

  private async findAndEnrichTransactions(
    paypalTransactions: PayPalTransaction[],
    userId: number,
    dateRange: number,
  ): Promise<{
    enriched: Transaction[];
    unmatched: PayPalTransaction[];
  }> {
    const enriched: Transaction[] = [];
    const unmatched: PayPalTransaction[] = [];

    for (const paypalTx of paypalTransactions) {
      try {
        // Look for matching transactions by amount and date range
        const startDate = subDays(paypalTx.date, 1); // 1 day before the PayPal transaction
        const endDate = addDays(paypalTx.date, dateRange); // Up to dateRange days after

        // Check if we have an expense (negative amount) or income (positive amount)
        const isExpense = paypalTx.amount < 0;
        const absAmount = Math.abs(paypalTx.amount);

        // Define search range for amount with tolerance
        // For expenses (negative in PayPal), search for negative amounts in DB
        // For income (positive in PayPal), search for positive amounts in DB
        const minAmount = isExpense
          ? -absAmount * 1.01 // For expenses: lower bound is more negative (101% of abs value)
          : absAmount * 0.99; // For income: lower bound is 99% of abs value

        const maxAmount = isExpense
          ? -absAmount * 0.99 // For expenses: upper bound is less negative (99% of abs value)
          : absAmount * 1.01; // For income: upper bound is 101% of abs value

        this.logger.debug(
          `Searching for matches with PayPal transaction: ${paypalTx.name}, ` +
            `amount ${paypalTx.amount} (${isExpense ? 'expense' : 'income'}, ` +
            `search range: ${minAmount} to ${maxAmount}), ` +
            `between ${startDate.toISOString()} and ${endDate.toISOString()}`,
        );

        // Find transactions with matching amount in the date range
        // For expenses (negative amount in PayPal), look for negative amounts in DB
        // For income (positive amount in PayPal), look for positive amounts in DB
        const matchingTransactions = await this.transactionsRepository.find({
          where: {
            user: { id: userId },
            // Match by amount (with some tolerance for currency conversion differences)
            amount: Between(minAmount, maxAmount),
            // Match by date range
            executionDate: Between(startDate, endDate),
          },
          order: {
            // Order by date to get closest match first
            executionDate: 'ASC',
          },
        });

        if (matchingTransactions.length > 0) {
          // Get the closest match by date
          // (could be enhanced with more sophisticated matching)
          const match = matchingTransactions[0];

          // Enrich the description with PayPal merchant name if not already included
          const originalDescription = match.description;
          const enrichedDescription = this.createEnrichedDescription(
            match.description,
            paypalTx.name,
          );

          // Update the transaction
          match.description = enrichedDescription;

          // Log the enrichment details
          this.logger.debug(
            `Enriching transaction: "${originalDescription}" -> "${enrichedDescription}"`,
          );

          // Save the enriched transaction
          await this.transactionsRepository.save(match);

          enriched.push(match);
        } else {
          this.logger.debug(
            `No matching transactions found for PayPal transaction: ${paypalTx.name}, ${paypalTx.amount}, ${paypalTx.date.toISOString()}`,
          );
          unmatched.push(paypalTx);
        }
      } catch (error) {
        this.logger.warn(
          `Error processing PayPal transaction: ${error.message}`,
        );
        unmatched.push(paypalTx);
      }
    }

    return { enriched, unmatched };
  }

  /**
   * Creates an enriched description by adding the PayPal merchant name
   * if it's not already included in the original description
   */
  private createEnrichedDescription(
    originalDesc: string,
    paypalMerchant: string,
  ): string {
    if (!originalDesc) {
      return `PayPal: ${paypalMerchant}`;
    }

    // Always append PayPal merchant name in parentheses, regardless of whether it's
    // already included in the original description or not
    return `${originalDesc} (PayPal: ${paypalMerchant})`;
  }
}
