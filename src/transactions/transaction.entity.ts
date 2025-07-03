import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
  Index,
} from 'typeorm';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { User } from '../users/user.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';

@Entity()
@Index(['user', 'transactionIdOpenBankAPI', 'source'], { unique: true, where: '"transactionIdOpenBankAPI" IS NOT NULL' })
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  description: string;

  @Column('decimal')
  amount: number;

  @Column({
    type: 'enum',
    enum: ['expense', 'income'],
    default: 'expense',
  })
  type: 'income' | 'expense';

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({
    type: 'enum',
    enum: ['pending', 'executed'],
    default: 'executed',
  })
  status: 'pending' | 'executed';

  @ManyToOne(() => Category, (category) => category.transactions)
  category: Category;

  @ManyToOne(() => Category, { nullable: true })
  suggestedCategory: Category | null;

  @Column({ nullable: true, type: 'varchar' })
  suggestedCategoryName: string | null;

  @ManyToOne(() => BankAccount, (bankAccount) => bankAccount.transactions, {
    nullable: true,
  })
  bankAccount: BankAccount | null;

  @ManyToOne(() => CreditCard, (creditCard) => creditCard.transactions, {
    nullable: true,
  })
  creditCard: CreditCard | null;

  @ManyToOne(() => User, (user) => user.transactions)
  user: User;

  @ManyToMany(() => Tag, (tag) => tag.transactions, { cascade: true })
  @JoinTable()
  tags: Tag[];

  @Column({ type: 'timestamp', nullable: true })
  executionDate?: Date;

  @Column({ type: 'timestamp', nullable: true })
  billingDate?: Date;

  @Column({ type: 'varchar', length: 50, default: 'manual' })
  source: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  categorizationConfidence: number | null;

  @Column({ nullable: true, type: 'varchar' })
  transactionIdOpenBankAPI: string | null;
}
