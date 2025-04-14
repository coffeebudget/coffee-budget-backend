import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Transaction } from "../../transactions/transaction.entity";
import { User } from "../../users/user.entity";
import { RecurringTransaction } from "../../recurring-transactions/entities/recurring-transaction.entity";

@Entity()
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column("text", { array: true, default: [] })
  keywords: string[];

  @OneToMany(() => Transaction, (transaction) => transaction.category)
  transactions: Transaction[];

  @ManyToOne(() => User, (user) => user.categories)
  user: User;

  @OneToMany(() => RecurringTransaction, (recurringTransaction) => recurringTransaction.category)
  recurringTransactions: RecurringTransaction[];

  @Column({ default: false })
  excludeFromExpenseAnalytics: boolean;

  @Column({ nullable: true })
  analyticsExclusionReason: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
