import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Category } from '../../categories/entities/category.entity';
import { Tag } from '../../tags/entities/tag.entity';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../../credit-cards/entities/credit-card.entity';

@Entity()
export class RecurringTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, default: 'Untitled Transaction' })
  name: string;

  @Column({ length: 255, nullable: true })
  description: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: ['SCHEDULED', 'PAUSED', 'COMPLETED', 'CANCELLED'],
    default: 'SCHEDULED',
  })
  status: 'SCHEDULED' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

  @Column({
    type: 'enum',
    enum: ['expense', 'income'],
  })
  type: 'expense' | 'income';

  @Column({ type: 'int' })
  frequencyEveryN: number;

  @Column({
    type: 'enum',
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
  })
  frequencyType: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @Column({ type: 'int', nullable: true })
  occurrences: number | null;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  endDate: Date | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  nextOccurrence: Date | null;

  // Additional properties for date calculations in the analytics module
  @Column({ type: 'int', nullable: true })
  dayOfMonth?: number;

  @Column({ type: 'int', nullable: true })
  dayOfWeek?: number;

  @Column({ type: 'int', nullable: true })
  month?: number;

  @Column({ default: false })
  userConfirmed: boolean;

  @Column({ type: 'varchar', length: 50, default: 'MANUAL' })
  source: string;

  @ManyToOne(() => User, (user) => user.recurringTransactions)
  user: User;

  @ManyToOne(() => Category, { nullable: false })
  category: Category;

  @ManyToMany(() => Tag)
  @JoinTable()
  tags: Tag[];

  @ManyToOne(() => BankAccount, { nullable: true })
  bankAccount: BankAccount | null;

  @ManyToOne(() => CreditCard, { nullable: true })
  creditCard: CreditCard | null;

  // Helper method for frequency in a format easy to display in UI
  get frequency(): string {
    return `${this.frequencyEveryN > 1 ? `Every ${this.frequencyEveryN} ` : 'Every '}${this.frequencyType}`;
  }
}
