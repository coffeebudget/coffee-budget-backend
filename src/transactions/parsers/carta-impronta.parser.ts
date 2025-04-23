import { BadRequestException } from '@nestjs/common';
import { BaseParser } from './base-parser';
import { Transaction } from '../transaction.entity';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../../credit-cards/entities/credit-card.entity';
import * as cheerio from 'cheerio';

export class CartaImprontaParser extends BaseParser {
  async parseFile(data: string, options: {
    bankAccountId?: number;
    creditCardId?: number;
    userId: number;
  }): Promise<Partial<Transaction>[]> {
    if (!data) {
      throw new BadRequestException('Missing CartaImpronta HTML content');
    }
    
    try {
      // Try to decode if it's base64 encoded
      let htmlContent: string;
      try {
        htmlContent = Buffer.from(data, 'base64').toString('utf-8');
      } catch (error) {
        // If decoding fails, assume it's already plain HTML
        htmlContent = data;
      }
      
      // Load HTML with cheerio
      const $ = cheerio.load(htmlContent);
      
      // Find the table with transactions
      const table = $('#CCMO_CAIM');
      
      if (!table.length) {
        throw new BadRequestException('Invalid CartaImpronta HTML format: table not found');
      }
      
      const transactions: Partial<Transaction>[] = [];
      
      // Process each row in the table body
      table.find('tbody tr').each((index, row) => {
        const cells = $(row).find('td');
        
        if (cells.length < 5) {
          this.logger.warn(`[CARTA_IMPRONTA IMPORT] Skipping row ${index + 1}: Not enough cells`);
          return; // continue to next row
        }
        
        // Extract data from cells
        const dateStr = $(cells[0]).text().trim();
        const amountEuroStr = $(cells[1]).text().trim();
        // We're using "Importo €" as requested, skipping "Importo Divisa"
        const currency = $(cells[3]).text().trim();
        const description = $(cells[4]).text().trim();
        
        if (!dateStr || !amountEuroStr || !description) {
          this.logger.warn(`[CARTA_IMPRONTA IMPORT] Skipping row ${index + 1}: Missing required data`);
          return; // continue to next row
        }
        
        try {
          const executionDate = this.parseDate(dateStr, 'dd/MM/yyyy');
          
          // Clean the amount string (remove "positivo"/"negativo" and other text)
          const cleanAmountStr = amountEuroStr.replace(/[^\d.,]/g, '').trim();
          const parsedAmount = this.parseAmount(cleanAmountStr);
          
          // For credit cards, amounts in the statement are positive but should be negative in our system
          // as they represent expenses
          const normalizedAmount = -Math.abs(parsedAmount);
          const type = 'expense'; // Credit card transactions are typically expenses
          
          // Create a transaction with the extracted data
          transactions.push({
            description: description.trim(),
            amount: normalizedAmount,
            type,
            executionDate,
            bankAccount: options.bankAccountId ? { id: options.bankAccountId } as BankAccount : undefined,
            creditCard: options.creditCardId ? { id: options.creditCardId } as CreditCard : undefined
          });
        } catch (error) {
          this.logger.warn(`[CARTA_IMPRONTA IMPORT] Skipping row ${index + 1}: ${error.message}`);
        }
      });
      
      return transactions;
    } catch (error) {
      throw new BadRequestException(`Failed to parse CartaImpronta file: ${error.message}`);
    }
  }
} 