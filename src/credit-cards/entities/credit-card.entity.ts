import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';
import { Transaction } from '../../transactions/transaction.entity';
import { User } from '../../users/user.entity';

@Entity()
export class CreditCard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string; // e.g., "Chase Sapphire"

  @Column({ type: 'decimal' })
  creditLimit: number; // e.g. $5,000

  @Column({ type: 'decimal', default: 0 })
  availableCredit: number;

  @Column({ type: 'decimal', default: 0 })
  currentBalance: number; // ✅ Added field

  @Column({ type: 'int' })
  billingDay: number; // e.g., 19 for the 19th of every month

  @Column({ type: 'decimal', default: 0 })
  interestRate: number; // e.g. 15%

  @Column({ nullable: true })
  bankAccountId: number;

  @Column({ nullable: true })
  gocardlessAccountId: string; // GoCardless account ID for integration

  @ManyToOne(() => BankAccount, (bankAccount) => bankAccount.creditCards)
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: BankAccount;

  @OneToMany(() => Transaction, (transaction) => transaction.creditCard)
  transactions: Transaction[];

  @ManyToOne(() => User, (user) => user.creditCards)
  user: User;
}
