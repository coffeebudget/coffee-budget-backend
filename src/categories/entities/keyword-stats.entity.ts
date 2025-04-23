import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Category } from "./category.entity";
import { User } from "../../users/user.entity";

@Entity()
export class KeywordStats {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  keyword: string;

  @ManyToOne(() => Category, { nullable: true })
  category: Category | null;

  @ManyToOne(() => User)
  user: User;

  @Column({ default: 0 })
  count: number;

  @Column({ default: 0 })
  successCount: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastUsed: Date | null;
} 