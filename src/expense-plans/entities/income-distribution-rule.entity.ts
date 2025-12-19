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

export type DistributionStrategy = 'proportional' | 'priority' | 'fixed';

@Entity('income_distribution_rules')
@Index(['userId', 'isActive'])
export class IncomeDistributionRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // ─────────────────────────────────────────────────────────────
  // DETECTION CRITERIA
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  expectedAmount: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  amountTolerance: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descriptionPattern: string | null;

  @Column({ nullable: true })
  categoryId: number | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category: Category | null;

  @Column({ nullable: true })
  bankAccountId: number | null;

  @ManyToOne(() => BankAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: BankAccount | null;

  // ─────────────────────────────────────────────────────────────
  // DISTRIBUTION SETTINGS
  // ─────────────────────────────────────────────────────────────

  @Column({ default: true })
  autoDistribute: boolean;

  @Column({ type: 'varchar', length: 20, default: 'priority' })
  distributionStrategy: DistributionStrategy;

  @Column({ default: true })
  isActive: boolean;

  // ─────────────────────────────────────────────────────────────
  // METADATA
  // ─────────────────────────────────────────────────────────────

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
