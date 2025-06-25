import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
} from 'typeorm';
import { Transaction } from '../../transactions/transaction.entity';
import { CreditCard } from '../../credit-cards/entities/credit-card.entity';
import { User } from '../../users/user.entity';
import { Currency } from '../../enums/currency.enum';
import { RecurringTransaction } from '../../recurring-transactions/entities/recurring-transaction.entity';
@Entity()
export class BankAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string; // e.g., "Main Checking", "Savings Account"

  @Column({ type: 'decimal', default: 0 })
  balance: number;

  @Column({
    type: 'enum',
    enum: Currency,
    default: Currency.EUR,
  })
  currency: Currency; // e.g., "USD", "EUR"

  @Column({
    type: 'enum',
    enum: ['Checking', 'Savings', 'Deposit', 'Investment', 'Loan'],
    default: 'Checking',
  })
  type: string;

  @Column({ nullable: true })
  gocardlessAccountId: string; // GoCardless account ID for integration

  @OneToMany(() => Transaction, (transaction) => transaction.bankAccount)
  transactions: Transaction[];

  @OneToMany(() => CreditCard, (creditCard) => creditCard.bankAccount)
  creditCards: CreditCard[];

  @ManyToOne(() => User, (user) => user.bankAccounts)
  user: User;

  @OneToMany(
    () => RecurringTransaction,
    (recurringTransaction) => recurringTransaction.bankAccount,
  )
  recurringTransactions: RecurringTransaction[];
}
