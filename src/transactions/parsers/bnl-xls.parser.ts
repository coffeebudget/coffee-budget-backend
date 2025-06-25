import { BadRequestException } from '@nestjs/common';
import { BaseParser } from './base-parser';
import { Transaction } from '../transaction.entity';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../../credit-cards/entities/credit-card.entity';
import * as xlsx from 'xlsx';

export class BnlXlsParser extends BaseParser {
  async parseFile(
    data: string,
    options: {
      bankAccountId?: number;
      creditCardId?: number;
      userId: number;
    },
  ): Promise<Partial<Transaction>[]> {
    try {
      if (!data) throw new BadRequestException('Missing XLS file content');

      const buffer = Buffer.from(data, 'base64');

      // Use xlsx library which has better compatibility with various Excel formats
      const workbook = xlsx.read(buffer, { type: 'buffer' });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new BadRequestException('No worksheets found in Excel file');
      }

      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Convert to JSON with proper typing
      const rows = xlsx.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
      }) as any[][];

      // Find the header row (look for "Data" in the first column and "Entrate"/"Uscite" columns)
      let headerRowIndex = -1;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as any[];
        if (
          row &&
          row[0] === 'Data' &&
          (row.includes('Entrate') || row.includes('Uscite'))
        ) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        // Try alternative header "Data contabile" for backward compatibility
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] as any[];
          if (row && row[0] === 'Data contabile') {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          throw new BadRequestException(
            'Could not find header row in BNL Excel file',
          );
        }
      }

      // Find column indices based on headers
      const headerRow = rows[headerRowIndex] as any[];
      let dateIndex = -1;
      let entrateIndex = -1;
      let usciteIndex = -1;
      let descriptionIndex = -1;
      let detailedDescriptionIndex = -1;

      for (let i = 0; i < headerRow.length; i++) {
        const header = headerRow[i] as string;
        if (header === 'Data' || header === 'Data contabile') {
          dateIndex = i;
        } else if (header === 'Entrate') {
          entrateIndex = i;
        } else if (header === 'Uscite') {
          usciteIndex = i;
        } else if (header === 'Descrizione') {
          descriptionIndex = i;
        } else if (header === 'Descrizione_Completa') {
          detailedDescriptionIndex = i;
        }
      }

      if (dateIndex === -1) {
        throw new BadRequestException(
          'Could not find date column in BNL Excel file',
        );
      }

      if (descriptionIndex === -1 && detailedDescriptionIndex === -1) {
        throw new BadRequestException(
          'Could not find description column in BNL Excel file',
        );
      }

      const transactions: Partial<Transaction>[] = [];

      // Process each data row
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i] as any[];
        if (
          !row[dateIndex] ||
          row.length < Math.max(dateIndex, entrateIndex, usciteIndex) + 1
        ) {
          continue; // Skip empty or short rows
        }

        try {
          const dateStr = row[dateIndex] as string;

          // Use detailed description if available, otherwise use simple description
          let description = '';
          if (descriptionIndex !== -1 && row[descriptionIndex]) {
            description = row[descriptionIndex] as string;
          }

          // Add detailed description if available
          if (
            detailedDescriptionIndex !== -1 &&
            row[detailedDescriptionIndex]
          ) {
            const detailedDesc = row[detailedDescriptionIndex] as string;
            if (description && detailedDesc) {
              description = `${description} ${detailedDesc}`;
            } else if (detailedDesc) {
              description = detailedDesc;
            }
          }

          // Handle amounts - either from dedicated columns or single amount column
          let amount = 0;
          let type: 'income' | 'expense' = 'expense';

          if (entrateIndex !== -1 && usciteIndex !== -1) {
            // New format with separate income/expense columns
            const entrateValue = row[entrateIndex]
              ? this.parseAmount(row[entrateIndex] as string)
              : 0;
            const usciteValue = row[usciteIndex]
              ? this.parseAmount(row[usciteIndex] as string)
              : 0;

            if (entrateValue > 0) {
              amount = entrateValue;
              type = 'income';
            } else if (usciteValue > 0) {
              amount = usciteValue;
              type = 'expense';
            }
          } else if (row[4] !== undefined) {
            // Old format with single amount column (positive/negative)
            const amountValue = this.parseAmount(row[4] as string);
            amount = Math.abs(amountValue);
            type = this.determineTransactionType(amountValue);
          }

          if (!dateStr || !description || amount === 0) continue;

          const executionDate = this.parseDate(dateStr, 'dd/MM/yyyy');

          transactions.push({
            description,
            amount,
            type,
            executionDate,
            bankAccount: options.bankAccountId
              ? ({ id: options.bankAccountId } as BankAccount)
              : undefined,
            creditCard: options.creditCardId
              ? ({ id: options.creditCardId } as CreditCard)
              : undefined,
          });
        } catch (parseError) {
          this.logger.warn(
            `Skipping row ${i} due to parsing error: ${parseError.message}`,
          );
        }
      }

      return transactions;
    } catch (error) {
      this.logger.error(`Failed to import BNL XLS file: ${error.message}`);
      throw new BadRequestException(
        'Failed to parse BNL file: ' + error.message,
      );
    }
  }
}
