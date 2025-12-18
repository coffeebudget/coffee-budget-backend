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

export enum SyncSource {
  GOCARDLESS = 'gocardless',
  PAYPAL = 'paypal',
  STRIPE = 'stripe',
  PLAID = 'plaid',
  MANUAL = 'manual',
}

export enum SyncSourceType {
  BANK_ACCOUNT = 'bank_account',
  PAYMENT_ACCOUNT = 'payment_account',
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

  @OneToMany(() => ImportLog, (importLog) => importLog.syncReport)
  importLogs: ImportLog[];

  @Column({ default: 'automatic' })
  syncType: string;

  @Column({ type: 'jsonb', nullable: true })
  accountResults: any;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  // Source tracking fields for unified sync history
  @Column({
    type: 'enum',
    enum: SyncSource,
    default: SyncSource.GOCARDLESS,
  })
  source: SyncSource;

  @Column({
    type: 'enum',
    enum: SyncSourceType,
    default: SyncSourceType.BANK_ACCOUNT,
  })
  sourceType: SyncSourceType;

  @Column({ type: 'int', nullable: true })
  sourceId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sourceName: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
