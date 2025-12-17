import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { PaymentActivity } from '../payment-activities/payment-activity.entity';

/**
 * PaymentAccount entity represents intermediary payment services
 * like PayPal, Klarna, Satispay, Amazon Pay, etc.
 *
 * These accounts don't generate real transactions, but create
 * PaymentActivity records that get reconciled with bank transactions.
 */
@Entity('payment_accounts')
export class PaymentAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  /**
   * Payment provider identifier
   * Examples: 'paypal', 'klarna', 'satispay', 'amazon_pay', 'stripe'
   */
  @Column({ type: 'varchar', length: 255 })
  provider: string;

  /**
   * User-friendly display name for the payment account
   * Example: "My PayPal Account", "Business Klarna"
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  displayName?: string | null;

  /**
   * Provider-specific configuration (API keys, account IDs, etc.)
   * Stored as JSONB for flexibility across different providers
   */
  @Column({ type: 'jsonb', nullable: true })
  providerConfig?: Record<string, any> | null;

  /**
   * Optional link to the bank account where payments are settled
   * Used for automatic reconciliation hints
   */
  @Column({ nullable: true })
  linkedBankAccountId?: number | null;

  /**
   * Whether this payment account is currently active
   * Inactive accounts won't sync new activities
   */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Relationships
  @ManyToOne(() => User, (user) => user.paymentAccounts)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => BankAccount, { nullable: true })
  @JoinColumn({ name: 'linkedBankAccountId' })
  linkedBankAccount: BankAccount;

  @OneToMany(() => PaymentActivity, (activity) => activity.paymentAccount)
  paymentActivities: PaymentActivity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
