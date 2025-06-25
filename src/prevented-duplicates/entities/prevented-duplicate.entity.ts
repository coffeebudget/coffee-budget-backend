import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Transaction } from '../../transactions/transaction.entity';
import { User } from '../../users/user.entity';

@Entity('prevented_duplicates')
export class PreventedDuplicate {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Transaction, { eager: true })
  @JoinColumn()
  existingTransaction: Transaction;

  @Column('json')
  blockedTransactionData: any;

  @Column()
  source: 'recurring' | 'csv_import' | 'api';

  @Column({ type: 'text', nullable: true })
  sourceReference: string | null;

  @Column('float')
  similarityScore: number;

  @Column()
  reason: string;

  @ManyToOne(() => User)
  @JoinColumn()
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
