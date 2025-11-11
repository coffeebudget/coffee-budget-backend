import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { ImportLog } from '../../transactions/entities/import-log.entity';

export enum SyncStatus {
  SUCCESS = 'success',
  PARTIAL = 'partial',
  FAILED = 'failed',
}

@Entity('sync_reports')
export class SyncReport {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  user: User;

  @Column({ type: 'enum', enum: SyncStatus })
  status: SyncStatus;

  @Column({ type: 'timestamp' })
  syncStartedAt: Date;

  @Column({ type: 'timestamp' })
  syncCompletedAt: Date;

  @Column({ type: 'int' })
  totalAccounts: number;

  @Column({ type: 'int' })
  successfulAccounts: number;

  @Column({ type: 'int' })
  failedAccounts: number;

  @Column({ type: 'int' })
  totalNewTransactions: number;

  @Column({ type: 'int' })
  totalDuplicates: number;

  @Column({ type: 'int' })
  totalPendingDuplicates: number;

  // Note: ImportLog relation will be added in Phase 2
  // For now, we'll manually attach importLogs in the service
  importLogs?: ImportLog[];

  @Column({ default: 'automatic' })
  syncType: string;

  @Column({ type: 'jsonb', nullable: true })
  accountResults: any;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
