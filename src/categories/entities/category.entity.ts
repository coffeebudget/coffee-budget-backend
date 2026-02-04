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

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
