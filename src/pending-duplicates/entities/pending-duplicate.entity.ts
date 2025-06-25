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

@Entity('pending_duplicates')
export class PendingDuplicate {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Transaction, { eager: true, nullable: true })
  @JoinColumn()
  existingTransaction: Transaction | null;

  @Column('json', { nullable: true })
  existingTransactionData: any;

  @Column('json')
  newTransactionData: any;

  @Column()
  source: 'recurring' | 'csv_import' | 'api';

  @Column({ type: 'text', nullable: true })
  sourceReference: string | null;

  @ManyToOne(() => User)
  @JoinColumn()
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: false })
  resolved: boolean;
}
