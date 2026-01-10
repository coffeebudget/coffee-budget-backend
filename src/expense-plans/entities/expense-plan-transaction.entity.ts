import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ExpensePlan } from './expense-plan.entity';
import { Transaction } from '../../transactions/transaction.entity';

export type ExpensePlanTransactionType =
  | 'contribution'
  | 'withdrawal'
  | 'adjustment'
  | 'rollover';

@Entity('expense_plan_transactions')
@Index(['expensePlanId', 'date'])
export class ExpensePlanTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  expensePlanId: number;

  @ManyToOne(() => ExpensePlan, (plan) => plan.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'expensePlanId' })
  expensePlan: ExpensePlan;

  @Column({ type: 'varchar', length: 20 })
  type: ExpensePlanTransactionType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  balanceAfter: number;

  @Column({ nullable: true })
  transactionId: number | null;

  @ManyToOne(() => Transaction, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note: string | null;

  @Column({ default: false })
  isAutomatic: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
