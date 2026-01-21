import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Transaction } from '../../transactions/transaction.entity';
import { User } from '../../users/user.entity';

@Entity()
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column('text', { array: true, default: [] })
  keywords: string[];

  @OneToMany(() => Transaction, (transaction) => transaction.category)
  transactions: Transaction[];

  @ManyToOne(() => User, (user) => user.categories)
  user: User;

  @Column({ default: false })
  excludeFromExpenseAnalytics: boolean;

  @Column({ nullable: true })
  analyticsExclusionReason: string;

  /**
   * When true, skip pattern detection for this category and use monthly average fallback.
   * Useful for categories with fragmented spending (e.g., Groceries with many supermarkets).
   * Saves AI tokens and provides a cleaner aggregated view.
   */
  @Column({ default: false })
  useMonthlyAverageOnly: boolean;

  // 🎯 Budget Management Fields
  @Column({
    type: 'enum',
    enum: ['primary', 'secondary', 'optional'],
    default: 'optional',
  })
  budgetLevel: 'primary' | 'secondary' | 'optional';

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  monthlyBudget: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  yearlyBudget: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  maxThreshold: number | null; // Per Secondary: tetto massimo mensile

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  warningThreshold: number | null; // Soglia di avviso (es. 80% del budget)

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
