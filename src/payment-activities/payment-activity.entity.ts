import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { PaymentAccount } from '../payment-accounts/payment-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { encryptedJsonTransformer } from '../shared/encryption';

/**
 * PaymentActivity entity represents operations through payment intermediary services.
 *
 * These are NOT real financial transactions, but activities that get reconciled
 * with actual bank transactions to provide merchant enrichment data.
 *
 * Example: A PayPal payment to "Merchant X" creates a PaymentActivity record.
 * Later, the bank transaction "PayPal Transfer" gets matched and enriched with
 * the merchant name from this activity.
 */
@Entity('payment_activities')
@Index(['paymentAccountId', 'executionDate'])
@Index(['externalId'], { unique: true })
@Index(['reconciliationStatus'])
export class PaymentActivity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  paymentAccountId: number;

  /**
   * Unique identifier from payment provider
   * Example: PayPal transaction ID
   * Must be unique to prevent duplicate activity records
   */
  @Column({ type: 'varchar', length: 255, unique: true })
  externalId: string;

  // Merchant enrichment data
  /**
   * Merchant name from payment provider
   * This is the "real" merchant name before the bank transaction
   * Example: "Starbucks Seattle Store #123"
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  merchantName: string;

  /**
   * Merchant category from payment provider
   * Example: "Coffee Shops", "Restaurants", "Online Retail"
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  merchantCategory: string;

  /**
   * Merchant Category Code (MCC) from payment provider
   * Standard ISO 18245 code
   * Example: "5814" for Fast Food Restaurants
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  merchantCategoryCode: string;

  // Transaction details
  /**
   * Payment amount (negative for expenses, positive for refunds)
   * Stored with 2 decimal precision for currency
   */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  /**
   * Date when the payment was executed through the payment provider
   * Used for reconciliation matching (±3 days window)
   */
  @Column({ type: 'date' })
  executionDate: Date;

  /**
   * Original description from payment provider
   * May include additional payment details not in merchant name
   */
  @Column({ type: 'text', nullable: true })
  description: string;

  // Reconciliation fields
  /**
   * Foreign key to the reconciled bank transaction
   * NULL if not yet reconciled
   */
  @Column({ nullable: true })
  reconciledTransactionId: number;

  /**
   * Reconciliation status tracking
   * - pending: Not yet reconciled, awaiting matching
   * - reconciled: Successfully matched with bank transaction
   * - failed: Automatic matching failed, needs manual review
   * - manual: Manually reconciled by user
   * - not_applicable: Activity doesn't require reconciliation (loans, fees, internal transfers)
   */
  @Column({
    type: 'enum',
    enum: ['pending', 'reconciled', 'failed', 'manual', 'not_applicable'],
    default: 'pending',
  })
  reconciliationStatus:
    | 'pending'
    | 'reconciled'
    | 'failed'
    | 'manual'
    | 'not_applicable';

  /**
   * Confidence score for automatic reconciliation (0-100)
   * Based on amount, date, and description matching
   * NULL for manual reconciliation
   */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  reconciliationConfidence: number;

  /**
   * Timestamp when reconciliation was completed
   * NULL if status is 'pending' or 'failed'
   */
  @Column({ type: 'timestamp', nullable: true })
  reconciledAt: Date;

  /**
   * Provider-specific raw data stored as JSON
   * Allows storing additional fields without schema changes
   * Example: PayPal fee details, shipping addresses, etc.
   */
  @Column({ type: 'text', transformer: encryptedJsonTransformer })
  rawData: Record<string, any>;

  // Relationships
  @ManyToOne(() => PaymentAccount, (account) => account.paymentActivities)
  @JoinColumn({ name: 'paymentAccountId' })
  paymentAccount: PaymentAccount;

  @ManyToOne(() => Transaction, { nullable: true })
  @JoinColumn({ name: 'reconciledTransactionId' })
  reconciledTransaction: Transaction;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
