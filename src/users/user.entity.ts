import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Tag } from '../tags/entities/tag.entity';
import { Category } from '../categories/entities/category.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { PaymentAccount } from '../payment-accounts/payment-account.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  auth0Id: string; // ✅ Auth0 User ID

  @Column()
  email: string;

  @Column({ default: false })
  isDemoUser: boolean;

  @Column({ nullable: true })
  demoExpiryDate: Date;

  @Column({ nullable: true })
  demoActivatedAt: Date;

  @OneToMany(() => BankAccount, (bankAccount) => bankAccount.user)
  bankAccounts: BankAccount[];

  @OneToMany(() => CreditCard, (creditCard) => creditCard.user)
  creditCards: CreditCard[];

  @OneToMany(() => Transaction, (transaction) => transaction.user, {
    nullable: true,
  })
  transactions?: Transaction[] | null;

  @OneToMany(() => Tag, (tag) => tag.user, { nullable: true })
  tags?: Tag[] | null;

  @OneToMany(() => Category, (category) => category.user, { nullable: true })
  categories?: Category[] | null;

  @OneToMany(
    () => RecurringTransaction,
    (recurringTransaction) => recurringTransaction.user,
    { nullable: true },
  )
  recurringTransactions?: RecurringTransaction[] | null;

  @OneToMany(() => PaymentAccount, (paymentAccount) => paymentAccount.user)
  paymentAccounts: PaymentAccount[];
}
