import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Category } from '../../categories/entities/category.entity';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';

export type IncomePlanReliability = 'guaranteed' | 'expected' | 'uncertain';

export type IncomePlanStatus = 'active' | 'paused' | 'archived';

export interface MonthlyAmounts {
  january: number;
  february: number;
  march: number;
  april: number;
  may: number;
  june: number;
  july: number;
  august: number;
  september: number;
  october: number;
  november: number;
  december: number;
}

@Entity('income_plans')
@Index(['userId', 'status'])
export class IncomePlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // ─────────────────────────────────────────────────────────────
  // IDENTITY
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  icon: string | null;

  // ─────────────────────────────────────────────────────────────
  // CLASSIFICATION
  // ─────────────────────────────────────────────────────────────

  /**
   * Reliability determines if income is included in budget calculations:
   * - guaranteed: Always included in budget base
   * - expected: Included with warning indicator
   * - uncertain: Excluded from budget base (bonus if received)
   */
  @Column({ type: 'varchar', length: 20, default: 'guaranteed' })
  reliability: IncomePlanReliability;

  @Column({ nullable: true })
  categoryId: number | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category: Category | null;

  // ─────────────────────────────────────────────────────────────
  // MONTHLY CALENDAR (12 amounts per year)
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  january: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  february: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  march: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  april: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  may: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  june: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  july: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  august: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  september: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  october: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  november: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  december: number;

  // ─────────────────────────────────────────────────────────────
  // PAYMENT DESTINATION (Optional - for tracking)
  // ─────────────────────────────────────────────────────────────

  @Column({ nullable: true })
  paymentAccountId: number | null;

  @ManyToOne(() => BankAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'paymentAccountId' })
  paymentAccount: BankAccount | null;

  // ─────────────────────────────────────────────────────────────
  // TIMING
  // ─────────────────────────────────────────────────────────────

  /**
   * Expected day of month when income is received (1-31)
   * Used for matching suggestions
   */
  @Column({ type: 'int', nullable: true })
  expectedDay: number | null;

  // ─────────────────────────────────────────────────────────────
  // STATUS
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: IncomePlanStatus;

  // ─────────────────────────────────────────────────────────────
  // METADATA
  // ─────────────────────────────────────────────────────────────

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ─────────────────────────────────────────────────────────────
  // COMPUTED HELPERS (not stored, calculated in service)
  // ─────────────────────────────────────────────────────────────

  /**
   * Get monthly amounts as an object
   */
  getMonthlyAmounts(): MonthlyAmounts {
    return {
      january: Number(this.january),
      february: Number(this.february),
      march: Number(this.march),
      april: Number(this.april),
      may: Number(this.may),
      june: Number(this.june),
      july: Number(this.july),
      august: Number(this.august),
      september: Number(this.september),
      october: Number(this.october),
      november: Number(this.november),
      december: Number(this.december),
    };
  }

  /**
   * Get amount for a specific month (0-indexed: 0=January, 11=December)
   */
  getAmountForMonth(monthIndex: number): number {
    const months = [
      this.january,
      this.february,
      this.march,
      this.april,
      this.may,
      this.june,
      this.july,
      this.august,
      this.september,
      this.october,
      this.november,
      this.december,
    ];
    return Number(months[monthIndex] ?? 0);
  }

  /**
   * Calculate annual total
   */
  getAnnualTotal(): number {
    return (
      Number(this.january) +
      Number(this.february) +
      Number(this.march) +
      Number(this.april) +
      Number(this.may) +
      Number(this.june) +
      Number(this.july) +
      Number(this.august) +
      Number(this.september) +
      Number(this.october) +
      Number(this.november) +
      Number(this.december)
    );
  }

  /**
   * Calculate monthly average
   */
  getMonthlyAverage(): number {
    return this.getAnnualTotal() / 12;
  }
}
