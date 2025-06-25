import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  ManyToOne,
} from 'typeorm';
import { Transaction } from '../../transactions/transaction.entity';
import { User } from '../../users/user.entity';
import { RecurringTransaction } from '../../recurring-transactions/entities/recurring-transaction.entity';
@Entity()
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToMany(() => Transaction, (transaction) => transaction.tags)
  transactions: Transaction[];

  @ManyToOne(() => User, (user) => user.tags)
  user: User;

  @ManyToMany(
    () => RecurringTransaction,
    (recurringTransaction) => recurringTransaction.tags,
  )
  recurringTransactions: RecurringTransaction[];
}
