import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum GocardlessConnectionStatus {
  ACTIVE = 'active',
  EXPIRING_SOON = 'expiring_soon',
  EXPIRED = 'expired',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
}

@Entity('gocardless_connections')
export class GocardlessConnection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // GoCardless identifiers
  @Column({ type: 'varchar', length: 255 })
  @Index()
  requisitionId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  euaId: string | null;

  // Institution information
  @Column({ type: 'varchar', length: 255 })
  institutionId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  institutionName: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  institutionLogo: string | null;

  // Status tracking
  @Column({
    type: 'enum',
    enum: GocardlessConnectionStatus,
    default: GocardlessConnectionStatus.ACTIVE,
  })
  @Index()
  status: GocardlessConnectionStatus;

  // Expiration tracking
  @Column({ type: 'timestamp' })
  connectedAt: Date;

  @Column({ type: 'timestamp' })
  @Index()
  expiresAt: Date;

  @Column({ type: 'int', default: 90 })
  accessValidForDays: number;

  // Sync tracking
  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastSyncError: string | null;

  // Linked account IDs (from requisition.accounts[])
  @Column({ type: 'jsonb', default: [] })
  linkedAccountIds: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
