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
import { ExpenseType } from '../interfaces/classification.interface';
import { FrequencyType } from '../interfaces/frequency.interface';
import { ExpensePlanPurpose } from '../../expense-plans/entities/expense-plan.entity';

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type SuggestionSource = 'pattern' | 'category_average';

@Entity('expense_plan_suggestions')
@Index(['userId', 'status'])
@Index(['userId', 'createdAt'])
export class ExpensePlanSuggestion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // ─────────────────────────────────────────────────────────────
  // SUGGESTION IDENTITY
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 100, name: 'suggested_name' })
  suggestedName: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // ─────────────────────────────────────────────────────────────
  // PATTERN SOURCE DATA
  // ─────────────────────────────────────────────────────────────

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'merchant_name',
  })
  merchantName: string | null;

  @Column({ type: 'text', name: 'representative_description' })
  representativeDescription: string;

  @Column({ type: 'int', nullable: true, name: 'category_id' })
  categoryId: number | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: Category | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'category_name',
  })
  categoryName: string | null;

  // ─────────────────────────────────────────────────────────────
  // FINANCIAL DATA
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'average_amount' })
  averageAmount: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    name: 'monthly_contribution',
  })
  monthlyContribution: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'yearly_total' })
  yearlyTotal: number;

  // ─────────────────────────────────────────────────────────────
  // CLASSIFICATION DATA
  // ─────────────────────────────────────────────────────────────

  @Column({
    type: 'enum',
    enum: ExpenseType,
    name: 'expense_type',
  })
  expenseType: ExpenseType;

  @Column({ type: 'boolean', name: 'is_essential' })
  isEssential: boolean;

  @Column({
    type: 'enum',
    enum: FrequencyType,
    name: 'frequency_type',
  })
  frequencyType: FrequencyType;

  @Column({ type: 'int', name: 'interval_days' })
  intervalDays: number;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    name: 'suggested_purpose',
  })
  suggestedPurpose: ExpensePlanPurpose | null;

  // ─────────────────────────────────────────────────────────────
  // SUGGESTION SOURCE (v3: Hierarchical Logic)
  // ─────────────────────────────────────────────────────────────

  @Column({
    type: 'varchar',
    length: 20,
    default: 'pattern',
    name: 'suggestion_source',
  })
  suggestionSource: SuggestionSource;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    name: 'category_monthly_average',
  })
  categoryMonthlyAverage: number | null;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    name: 'discrepancy_percentage',
  })
  discrepancyPercentage: number | null;

  @Column({
    type: 'boolean',
    default: false,
    name: 'has_discrepancy_warning',
  })
  hasDiscrepancyWarning: boolean;

  // ─────────────────────────────────────────────────────────────
  // CONFIDENCE METRICS
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'int', name: 'pattern_confidence' })
  patternConfidence: number; // 0-100 from pattern detection

  @Column({ type: 'int', name: 'classification_confidence' })
  classificationConfidence: number; // 0-100 from AI classification

  @Column({ type: 'int', name: 'overall_confidence' })
  overallConfidence: number; // Combined confidence score

  @Column({ type: 'text', nullable: true, name: 'classification_reasoning' })
  classificationReasoning: string | null;

  // ─────────────────────────────────────────────────────────────
  // OCCURRENCE DATA
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'int', name: 'occurrence_count' })
  occurrenceCount: number;

  @Column({ type: 'timestamp', name: 'first_occurrence' })
  firstOccurrence: Date;

  @Column({ type: 'timestamp', name: 'last_occurrence' })
  lastOccurrence: Date;

  @Column({ type: 'timestamp', name: 'next_expected_date' })
  nextExpectedDate: Date;

  // ─────────────────────────────────────────────────────────────
  // METADATA FOR TRACKING
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    transactionIds?: number[];
    patternId?: string;
    amountRange?: { min: number; max: number };
    sourceVersion?: string;
    // v2: Category aggregation fields
    merchants?: string[];
    spanMonths?: number;
    aggregatedPatternCount?: number;
  };

  // ─────────────────────────────────────────────────────────────
  // STATUS & WORKFLOW
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: SuggestionStatus;

  @Column({ type: 'int', nullable: true, name: 'approved_expense_plan_id' })
  approvedExpensePlanId: number | null;

  @Column({ type: 'text', nullable: true, name: 'rejection_reason' })
  rejectionReason: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'reviewed_at' })
  reviewedAt: Date | null;

  // ─────────────────────────────────────────────────────────────
  // TIMESTAMPS
  // ─────────────────────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'expires_at' })
  expiresAt: Date | null;
}
