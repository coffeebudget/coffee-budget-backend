import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Category } from '../../categories/entities/category.entity';
import { FrequencyType } from '../interfaces/frequency.interface';

@Entity('detected_patterns')
export class DetectedPattern {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'user_id' })
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'int', name: 'category_id', nullable: true })
  categoryId: number | null;

  @ManyToOne(() => Category, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: Category | null;

  @Column({ type: 'varchar', name: 'merchant_name', nullable: true })
  merchantName: string | null;

  @Column({ type: 'varchar', name: 'representative_description' })
  representativeDescription: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'average_amount' })
  averageAmount: number;

  @Column({
    type: 'enum',
    enum: FrequencyType,
    name: 'frequency_type',
  })
  frequencyType: FrequencyType;

  @Column({ type: 'int', name: 'interval_days' })
  intervalDays: number;

  @Column({ type: 'int', name: 'frequency_confidence' })
  frequencyConfidence: number; // 0-100

  @Column({ type: 'int', name: 'similarity_confidence' })
  similarityConfidence: number; // 0-100

  @Column({ type: 'int', name: 'overall_confidence' })
  overallConfidence: number; // 0-100

  @Column({ type: 'int', name: 'occurrence_count' })
  occurrenceCount: number;

  @Column({ type: 'timestamp', name: 'first_occurrence' })
  firstOccurrence: Date;

  @Column({ type: 'timestamp', name: 'last_occurrence' })
  lastOccurrence: Date;

  @Column({ type: 'timestamp', name: 'next_expected_date' })
  nextExpectedDate: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    transactionIds?: number[];
    categoryName?: string;
    amountRange?: { min: number; max: number };
  };

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
