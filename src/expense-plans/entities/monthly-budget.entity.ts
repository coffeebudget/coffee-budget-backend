import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../users/user.entity';

/**
 * MonthlyBudget Entity
 *
 * Tracks the monthly allocation state for YNAB-style budget allocation.
 * One record per user per month, storing income and allocation totals.
 */
@Entity('monthly_budgets')
@Unique(['userId', 'month'])
@Index(['userId', 'month'])
export class MonthlyBudget {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /**
   * Month in format "YYYY-MM" (e.g., "2026-01")
   */
  @Column({ type: 'varchar', length: 7 })
  month: string;

  /**
   * Auto-detected income from transactions
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  autoDetectedIncome: number;

  /**
   * Manual income override (if user wants to specify a different amount)
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  manualIncomeOverride: number | null;

  /**
   * Total amount allocated to expense plans this month
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAllocated: number;

  /**
   * Computed: effectiveIncome - totalAllocated
   * Stored for quick access
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  unallocated: number;

  /**
   * Whether the user has completed allocation this month
   * (reached €0 unallocated or explicitly marked complete)
   */
  @Column({ default: false })
  isComplete: boolean;

  /**
   * Notes for this month's budget
   */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Get effective income (manual override or auto-detected)
   */
  get effectiveIncome(): number {
    return this.manualIncomeOverride ?? this.autoDetectedIncome;
  }
}
