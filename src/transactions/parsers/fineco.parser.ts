import { BadRequestException } from '@nestjs/common';
import { BaseParser } from './base-parser';
import { Transaction } from '../transaction.entity';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../../credit-cards/entities/credit-card.entity';
import { Workbook } from 'exceljs';
import { Tag } from '../../tags/entities/tag.entity';

export class FinecoParser extends BaseParser {
  async parseFile(data: string, options: {
    bankAccountId?: number;
    creditCardId?: number;
    userId: number;
  }): Promise<Partial<Transaction>[]> {
    if (!data) {
      throw new BadRequestException('Missing XLS content');
    }

    const buffer = Buffer.from(data, 'base64');
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    const transactions: Partial<Transaction>[] = [];

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

      const getCell = (headerName: string): string => {
        const headerIndex = headers.indexOf(headerName);
        if (headerIndex === -1) return '';
        return row.getCell(headerIndex + 1).text.trim();
      };

      const dateStr = getCell("Data");
      const entrateStr = getCell("Entrate");
      const usciteStr = getCell("Uscite");
      const description = getCell("Descrizione_Completa");
      const tag = getCell("Descrizione");
      const moneymap = getCell("Moneymap");

      if (!dateStr || !description) return;

      const executionDate = this.parseDate(dateStr, "dd/MM/yyyy");

      const amountRaw = entrateStr || usciteStr;
      const type = entrateStr ? "income" : "expense";
      const parsedAmount = this.parseAmount(amountRaw);

      // Generate enhanced description that includes tag information
      let enhancedDescription = description;
      if (tag) enhancedDescription = `${enhancedDescription} [Tag: ${tag}]`;

      // Create transaction object
      const transaction: Partial<Transaction> = {
        description: enhancedDescription,
        amount: Math.abs(parsedAmount),
        type,
        executionDate,
        bankAccount: options.bankAccountId ? { id: options.bankAccountId } as BankAccount : undefined,
        creditCard: options.creditCardId ? { id: options.creditCardId } as CreditCard : undefined,
      };

      // Handle Moneymap as tags if present
      if (moneymap) {
        // Create tag objects from the Moneymap values
        const tagNames = moneymap.split(':').map(part => part.trim()).filter(Boolean);
        transaction.tags = tagNames.map(name => ({ 
          name, 
          user: { id: options.userId } 
        } as Partial<Tag>)) as Tag[];
      }

      transactions.push(transaction);
    });

    return transactions;
  }
}