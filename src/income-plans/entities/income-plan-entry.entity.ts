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
import { IncomePlan } from './income-plan.entity';
import { Transaction } from '../../transactions/transaction.entity';

/**
 * IncomePlanEntry tracks actual received income for an IncomePlan
 * for a specific year/month.
 *
 * One entry per income plan per month.
 * Can be linked to a transaction for verification.
 */
@Entity('income_plan_entries')
@Index(['incomePlanId', 'year', 'month'])
@Unique(['incomePlanId', 'year', 'month'])
export class IncomePlanEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  incomePlanId: number;

  @ManyToOne(() => IncomePlan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incomePlanId' })
  incomePlan: IncomePlan;

  @Column({ type: 'int' })
  year: number;

  /**
   * Month (1-indexed: 1=January, 12=December)
   */
  @Column({ type: 'int' })
  month: number;

  /**
   * Actual amount received for this month
   */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  actualAmount: number;

  /**
   * Expected amount for this month (denormalized for historical accuracy)
   * Copied from IncomePlan at time of entry creation
   */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  expectedAmount: number;

  /**
   * Optional link to the transaction that represents this income
   */
  @Column({ nullable: true })
  transactionId: number | null;

  @ManyToOne(() => Transaction, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction | null;

  /**
   * Optional note about this entry
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  note: string | null;

  /**
   * Whether this entry was auto-created from transaction linking
   */
  @Column({ default: false })
  isAutomatic: boolean;

  @CreateDateColumn()
  createdAt: Date;

  // ─────────────────────────────────────────────────────────────
  // COMPUTED STATUS
  // ─────────────────────────────────────────────────────────────

  /**
   * Calculate the status based on actual vs expected
   * - 'pending': actualAmount is 0
   * - 'partial': 0 < actualAmount < expectedAmount
   * - 'received': actualAmount equals expectedAmount (within 1% tolerance)
   * - 'exceeded': actualAmount > expectedAmount
   */
  getStatus(): 'pending' | 'partial' | 'received' | 'exceeded' {
    const actual = Number(this.actualAmount);
    const expected = Number(this.expectedAmount);

    if (actual === 0) {
      return 'pending';
    }

    // Allow 1% tolerance for "received" status
    const tolerance = expected * 0.01;

    if (actual >= expected - tolerance && actual <= expected + tolerance) {
      return 'received';
    }

    if (actual > expected) {
      return 'exceeded';
    }

    return 'partial';
  }

  /**
   * Calculate the difference between actual and expected
   */
  getDifference(): number {
    return Number(this.actualAmount) - Number(this.expectedAmount);
  }

  /**
   * Calculate the percentage received (actual / expected * 100)
   */
  getPercentageReceived(): number {
    const expected = Number(this.expectedAmount);
    if (expected === 0) return 100;
    return (Number(this.actualAmount) / expected) * 100;
  }
}
