import { Logger } from '@nestjs/common';
import { BankFileParser } from './interfaces/bank-file-parser.interface';
import { Transaction } from '../transaction.entity';
import { parseDate } from '../../utils/date-utils';
import { parseLocalizedAmount } from '../../utils/amount.utils';

export abstract class BaseParser implements BankFileParser {
  protected logger = new Logger(this.constructor.name);

  abstract parseFile(
    data: string,
    options: {
      bankAccountId?: number;
      creditCardId?: number;
      userId: number;
    },
  ): Promise<Partial<Transaction>[]>;

  protected parseDate(dateStr: string, format: string): Date {
    return parseDate(dateStr, format, new Date());
  }

  protected parseAmount(amountStr: string): number {
    return parseLocalizedAmount(amountStr);
  }

  protected determineTransactionType(amount: number): 'income' | 'expense' {
    return amount >= 0 ? 'income' : 'expense';
  }

  protected normalizeAmount(
    amount: number,
    type: 'income' | 'expense',
  ): number {
    const absAmount = Math.abs(amount);
    return type === 'income' ? absAmount : -absAmount;
  }
}
