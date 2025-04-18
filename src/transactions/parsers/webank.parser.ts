import { BadRequestException } from '@nestjs/common';
import { BaseParser } from './base-parser';
import { Transaction } from '../transaction.entity';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../../credit-cards/entities/credit-card.entity';
import * as cheerio from 'cheerio';

export class WebankParser extends BaseParser {
  async parseFile(data: string, options: {
    bankAccountId?: number;
    creditCardId?: number;
    userId: number;
  }): Promise<Partial<Transaction>[]> {
    if (!data) {
      throw new BadRequestException('Missing Webank HTML content');
    }
  
    const html = Buffer.from(data, 'base64').toString('utf-8');
    const $ = cheerio.load(html);
    const rows = $('table tr');
  
    const transactions: Partial<Transaction>[] = [];
  
    rows.each((index, row) => {
      const cells = $(row).find('td');
      if (cells.length < 6) return;
  
      const valutaDateStr = $(cells[1]).text().trim(); // "Data Valuta"
      const amountStr = $(cells[2]).text().trim();     // "Importo"
      const description = $(cells[4]).text().trim();   // "Causale / Descrizione"
  
      if (!valutaDateStr || !amountStr || !description) return;
  
      try {
        const executionDate = this.parseDate(valutaDateStr, 'dd/MM/yyyy');
        const parsedAmount = this.parseAmount(amountStr);
        const type = this.determineTransactionType(parsedAmount);
  
        transactions.push({
          description,
          amount: Math.abs(parsedAmount),
          type,
          executionDate,
          bankAccount: options.bankAccountId ? { id: options.bankAccountId } as BankAccount : undefined,
          creditCard: options.creditCardId ? { id: options.creditCardId } as CreditCard : undefined
        });
      } catch (error) {
        this.logger.warn(`[WEBANK IMPORT] Skipping row ${index + 1}: ${error}`);
      }
    });
  
    return transactions;
  }
}
