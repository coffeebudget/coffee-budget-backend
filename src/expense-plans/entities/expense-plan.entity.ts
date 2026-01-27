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

export type PaymentAccountType = 'bank_account'; // Future: | 'credit_card'

export type ExpensePlanType =
  | 'fixed_monthly'
  | 'yearly_fixed'
  | 'yearly_variable'
  | 'multi_year'
  | 'seasonal'
  | 'emergency_fund'
  | 'goal';

export type ExpensePlanPriority = 'essential' | 'important' | 'discretionary';

export type ExpensePlanFrequency =
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'multi_year'
  | 'seasonal'
  | 'one_time';

export type ExpensePlanStatus = 'active' | 'paused' | 'completed';

export type ContributionSource = 'calculated' | 'manual' | 'historical';

export type ExpensePlanPurpose = 'sinking_fund' | 'spending_budget';

@Entity('expense_plans')
@Index(['userId', 'status'])
export class ExpensePlan {
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

  @Column({ type: 'varchar', length: 20 })
  planType: ExpensePlanType;

  @Column({ type: 'varchar', length: 20, default: 'important' })
  priority: ExpensePlanPriority;

  @Column({ nullable: true })
  categoryId: number | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category: Category | null;

  @Column({ default: false })
  autoTrackCategory: boolean;

  @Column({ type: 'varchar', length: 20, default: 'sinking_fund' })
  purpose: ExpensePlanPurpose;

  // ─────────────────────────────────────────────────────────────
  // PAYMENT SOURCE (Optional - for coverage tracking)
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 20, nullable: true })
  paymentAccountType: PaymentAccountType | null;

  @Column({ nullable: true })
  paymentAccountId: number | null;

  @ManyToOne(() => BankAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'paymentAccountId' })
  paymentAccount: BankAccount | null;

  // ─────────────────────────────────────────────────────────────
  // FINANCIAL
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  targetAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monthlyContribution: number;

  @Column({ type: 'varchar', length: 20, default: 'calculated' })
  contributionSource: ContributionSource;

  // ─────────────────────────────────────────────────────────────
  // TIMING
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 20 })
  frequency: ExpensePlanFrequency;

  @Column({ type: 'int', nullable: true })
  frequencyYears: number | null;

  @Column({ type: 'int', nullable: true })
  dueMonth: number | null;

  @Column({ type: 'int', nullable: true })
  dueDay: number | null;

  @Column({ type: 'date', nullable: true })
  targetDate: Date | null;

  @Column({ type: 'simple-array', nullable: true })
  seasonalMonths: number[] | null;

  @Column({ type: 'date', nullable: true })
  nextDueDate: Date | null;

  // ─────────────────────────────────────────────────────────────
  // TRACKING
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: ExpensePlanStatus;

  @Column({ default: true })
  autoCalculate: boolean;

  @Column({ default: true })
  rolloverSurplus: boolean;

  // ─────────────────────────────────────────────────────────────
  // ADJUSTMENT SUGGESTIONS
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  suggestedMonthlyContribution: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  suggestedAdjustmentPercent: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  adjustmentReason: 'spending_increased' | 'spending_decreased' | null;

  @Column({ type: 'timestamp', nullable: true })
  adjustmentSuggestedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  adjustmentDismissedAt: Date | null;

  // ─────────────────────────────────────────────────────────────
  // METADATA
  // ─────────────────────────────────────────────────────────────

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
