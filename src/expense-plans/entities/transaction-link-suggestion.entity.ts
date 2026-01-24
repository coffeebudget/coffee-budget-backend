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
import { Transaction } from '../../transactions/transaction.entity';
import { ExpensePlan } from './expense-plan.entity';
import { ExpensePlanTransaction } from './expense-plan-transaction.entity';

export type TransactionLinkSuggestionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'invalidated';

export type SuggestedTransactionType = 'withdrawal' | 'contribution';

@Entity('transaction_link_suggestions')
@Index(['userId', 'status'])
export class TransactionLinkSuggestion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  transactionId: number;

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction;

  @Column()
  expensePlanId: number;

  @ManyToOne(() => ExpensePlan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'expensePlanId' })
  expensePlan: ExpensePlan;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  transactionAmount: number;

  @Column({ type: 'varchar', length: 255 })
  transactionDescription: string;

  @Column({ type: 'timestamp' })
  transactionDate: Date;

  @Column({ type: 'varchar', length: 20 })
  suggestedType: SuggestedTransactionType;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: TransactionLinkSuggestionStatus;

  @Column({ nullable: true })
  expensePlanTransactionId: number | null;

  @ManyToOne(() => ExpensePlanTransaction, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'expensePlanTransactionId' })
  expensePlanTransaction: ExpensePlanTransaction | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
