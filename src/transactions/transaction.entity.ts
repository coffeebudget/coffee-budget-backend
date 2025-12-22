import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
  Index,
} from 'typeorm';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { User } from '../users/user.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';

@Entity()
@Index(['user', 'transactionIdOpenBankAPI', 'source'], { unique: true, where: '"transactionIdOpenBankAPI" IS NOT NULL' })
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  description: string;

  @Column('decimal')
  amount: number;

  @Column({
    type: 'enum',
    enum: ['expense', 'income'],
    default: 'expense',
  })
  type: 'income' | 'expense';

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({
    type: 'enum',
    enum: ['pending', 'executed'],
    default: 'executed',
  })
  status: 'pending' | 'executed';

  @ManyToOne(() => Category, (category) => category.transactions)
  category: Category;

  @ManyToOne(() => Category, { nullable: true })
  suggestedCategory: Category | null;

  @Column({ nullable: true, type: 'varchar' })
  suggestedCategoryName: string | null;

  @ManyToOne(() => BankAccount, (bankAccount) => bankAccount.transactions, {
    nullable: true,
  })
  bankAccount: BankAccount | null;

  @ManyToOne(() => CreditCard, (creditCard) => creditCard.transactions, {
    nullable: true,
  })
  creditCard: CreditCard | null;

  @ManyToOne(() => User, (user) => user.transactions)
  user: User;

  @ManyToMany(() => Tag, (tag) => tag.transactions, { cascade: true })
  @JoinTable()
  tags: Tag[];

  @Column({ type: 'timestamp', nullable: true })
  executionDate?: Date;

  @Column({ type: 'timestamp', nullable: true })
  billingDate?: Date;

  @Column({ type: 'varchar', length: 50, default: 'manual' })
  source: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  categorizationConfidence: number | null;

  @Column({ nullable: true, type: 'varchar' })
  transactionIdOpenBankAPI: string | null;

  // GoCardless merchant information for advanced categorization
  @Column({ nullable: true, type: 'varchar' })
  merchantName: string | null;

  @Column({ nullable: true, type: 'varchar' })
  merchantCategoryCode: string | null;

  @Column({ nullable: true, type: 'varchar' })
  debtorName: string | null;

  @Column({ nullable: true, type: 'varchar' })
  creditorName: string | null;

  /**
   * @deprecated This field will be removed in v2.0
   * Use PaymentActivity-based reconciliation instead.
   *
   * MIGRATION:
   * - Old: Transaction links to another Transaction via reconciledWithTransaction
   * - New: PaymentActivity links to Transaction via reconciledTransactionId
   *
   * For new implementations, use enrichedFromPaymentActivityId field below.
   *
   * @see docs/tasks/active/REFACTOR-20251217-cleanup-old-reconciliation.md
   */
  @ManyToOne(() => Transaction, { nullable: true })
  reconciledWithTransaction: Transaction | null;

  /**
   * @deprecated This field will be removed in v2.0
   * Use PaymentActivity-based reconciliation instead.
   *
   * VALID VALUES (for reference during migration):
   * - 'not_reconciled': Transaction not matched with any other
   * - 'reconciled_as_primary': Bank transaction matched with PayPal
   * - 'reconciled_as_secondary': PayPal transaction matched with bank
   *
   * NEW APPROACH:
   * - PaymentActivity.reconciliationStatus tracks PaymentActivity ↔ Transaction matches
   * - Transaction.enrichedFromPaymentActivityId links to the enriching PaymentActivity
   *
   * @see docs/tasks/active/REFACTOR-20251217-cleanup-old-reconciliation.md
   */
  @Column({
    type: 'enum',
    enum: ['not_reconciled', 'reconciled_as_primary', 'reconciled_as_secondary'],
    default: 'not_reconciled',
  })
  reconciliationStatus: 'not_reconciled' | 'reconciled_as_primary' | 'reconciled_as_secondary';

  // Payment Activity enrichment fields (NEW architecture)
  /**
   * Foreign key to PaymentActivity that enriched this transaction
   * NULL if transaction was not enriched by payment activity
   * When set, indicates this bank transaction was matched with a payment activity
   */
  @Column({ type: 'integer', nullable: true })
  enrichedFromPaymentActivityId: number | null;

  /**
   * Original merchant name from bank transaction description
   * Preserved before enrichment for audit trail
   * Example: "PayPal Transfer" (original), "Starbucks" (enhanced)
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  originalMerchantName: string | null;

  /**
   * Enhanced merchant name from payment activity
   * Replaces generic payment provider name with actual merchant
   * Example: "Starbucks Seattle Store #123" from PayPal activity
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  enhancedMerchantName: string | null;

  /**
   * Confidence score for enrichment/categorization enhancement
   * Based on payment activity reconciliation match quality
   * Range: 0-100, NULL if not enriched
   */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  enhancedCategoryConfidence: number | null;
}
