import { BadRequestException } from '@nestjs/common';
import { BaseParser } from './base-parser';
import { Transaction } from '../transaction.entity';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../../credit-cards/entities/credit-card.entity';

export class BnlTxtParser extends BaseParser {
  async parseFile(data: string, options: {
    bankAccountId?: number;
    creditCardId?: number;
    userId: number;
  }): Promise<Partial<Transaction>[]> {
    const transactions: Partial<Transaction>[] = [];
    
    if (!data) {
      throw new BadRequestException('Missing file content');
    }
    
    const lines = data
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    
    const rowRegex = /^\d+\s+(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+\d+\s+(.*)\s+([+-]?[0-9.,]+)$/;
    
    for (const line of lines) {
      const match = line.match(rowRegex);
      if (!match) continue;
      
      const [_, dateStr, rawDescription, rawAmount] = match;
      
      const executionDate = this.parseDate(dateStr, 'dd/MM/yyyy');
      const description = rawDescription.trim();
      
      const amount = this.parseAmount(rawAmount);
      const type = this.determineTransactionType(amount);
      
      transactions.push({
        description,
        amount: Math.abs(amount),
        type,
        executionDate,
        bankAccount: options.bankAccountId ? { id: options.bankAccountId } as BankAccount : undefined,
        creditCard: options.creditCardId ? { id: options.creditCardId } as CreditCard : undefined,
      });
    }
    
    return transactions;
  }
}
