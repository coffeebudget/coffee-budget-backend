import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { User } from '../../users/user.entity';

export interface CategoryHistory {
  categoryId: number;
  categoryName: string;
  confidence: number;
  timestamp: Date;
  source: 'ai' | 'user_override' | 'bulk_update';
}

@Entity('merchant_categorization')
@Index(['merchantName', 'merchantCategoryCode', 'user'], { unique: true })
export class MerchantCategorization {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  merchantName: string; // Normalized merchant name

  @Column({ nullable: true })
  merchantCategoryCode?: string; // MCC code if available

  @Column()
  suggestedCategoryId: number; // Most common category for this merchant

  @Column('decimal', { precision: 5, scale: 2 })
  averageConfidence: number; // Average confidence score

  @Column({ default: 1 })
  usageCount: number; // How many times this merchant was categorized

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  firstSeen: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastSeen: Date;

  @Column({ type: 'json', nullable: true })
  categoryHistory: CategoryHistory[]; // Track category changes over time

  @Column({ type: 'json', nullable: true })
  aiPrompt: string; // Store the AI prompt used for this merchant

  @Column({ type: 'json', nullable: true })
  aiResponse: string; // Store the AI response for debugging

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Category)
  suggestedCategory: Category;

  @ManyToOne(() => User)
  user: User; // User-specific merchant categorizations
}

