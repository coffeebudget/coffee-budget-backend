import { Transaction } from '../../transaction.entity';

export interface BankFileParser {
  parseFile(
    data: string,
    options: {
      bankAccountId?: number;
      creditCardId?: number;
      userId: number;
    },
  ): Promise<Partial<Transaction>[]>;
}
