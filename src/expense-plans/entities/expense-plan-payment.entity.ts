import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { ExpensePlan } from './expense-plan.entity';
import { Transaction } from '../../transactions/transaction.entity';

export type ExpensePlanPaymentType = 'auto_linked' | 'manual' | 'unlinked';

/**
 * ExpensePlanPayment tracks actual payments linked to an ExpensePlan
 * for a specific year/month period.
 *
 * Multiple payments can exist per plan per month (unlike IncomePlanEntry).
 * Each payment can optionally link to a transaction.
 */
@Entity('expense_plan_payments')
@Index(['expensePlanId', 'year', 'month'])
@Index(['transactionId'])
export class ExpensePlanPayment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  expensePlanId: number;

  @ManyToOne(() => ExpensePlan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'expensePlanId' })
  expensePlan: ExpensePlan;

  @Column({ type: 'int' })
  year: number;

  /**
   * Month (1-indexed: 1=January, 12=December)
   */
  @Column({ type: 'int' })
  month: number;

  /**
   * Amount of this payment (always positive)
   */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  /**
   * Date when the payment was made
   */
  @Column({ type: 'date' })
  paymentDate: Date;

  /**
   * How this payment was linked:
   * - auto_linked: Automatically linked via category matching
   * - manual: Manually linked by user
   * - unlinked: Previously linked but now unlinked (keeps history)
   */
  @Column({ type: 'varchar', length: 20, default: 'manual' })
  paymentType: ExpensePlanPaymentType;

  /**
   * Optional link to the transaction that represents this payment
   */
  @Column({ nullable: true })
  transactionId: number | null;

  @ManyToOne(() => Transaction, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction | null;

  /**
   * Optional note about this payment
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  // ─────────────────────────────────────────────────────────────
  // COMPUTED HELPERS
  // ─────────────────────────────────────────────────────────────

  /**
   * Get the period string in yyyy-MM format
   */
  getPeriod(): string {
    return `${this.year}-${String(this.month).padStart(2, '0')}`;
  }

  /**
   * Check if this payment is still linked to a transaction
   */
  isLinked(): boolean {
    return this.transactionId !== null && this.paymentType !== 'unlinked';
  }
}
