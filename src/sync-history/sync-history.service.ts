import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import { SyncReport, SyncStatus } from './entities/sync-report.entity';
import { User } from '../users/user.entity';
import { ImportLog } from '../transactions/entities/import-log.entity';

interface ImportResultSummary {
  totalAccounts: number;
  successfulImports: number;
  failedImports: number;
  totalNewTransactions: number;
  totalDuplicates: number;
  totalPendingDuplicates: number;
}

interface AccountResult {
  accountId: string;
  accountName: string;
  accountType: string;
  success: boolean;
  newTransactions: number;
  duplicates: number;
  pendingDuplicates: number;
  importLogId: number;
  error?: string;
}

interface ImportResult {
  summary: ImportResultSummary;
  importResults: AccountResult[];
}

interface PaginationOptions {
  page: number;
  limit: number;
  status?: SyncStatus;
}

interface PaginatedSyncReports {
  data: SyncReport[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface SyncStatistics {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  successRate: number;
  totalNewTransactions: number;
  totalDuplicates: number;
  averageTransactionsPerSync: number;
}

@Injectable()
export class SyncHistoryService {
  constructor(
    @InjectRepository(SyncReport)
    private readonly syncReportRepository: Repository<SyncReport>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ImportLog)
    private readonly importLogRepository: Repository<ImportLog>,
  ) {}

  async createSyncReport(
    userId: number,
    importResult: ImportResult,
    syncStartTime: Date,
  ): Promise<SyncReport> {
    // Find user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Determine sync status
    let status: SyncStatus;
    let errorMessage: string | null = null;

    if (importResult.summary.failedImports === 0) {
      status = SyncStatus.SUCCESS;
    } else if (importResult.summary.successfulImports === 0) {
      status = SyncStatus.FAILED;
      errorMessage = 'All accounts failed to sync';
    } else {
      status = SyncStatus.PARTIAL;
    }

    // Get import log IDs from results (filter out undefined and 0 which are invalid IDs)
    const importLogIds = importResult.importResults
      .map((r) => r.importLogId)
      .filter((id) => id !== undefined && id > 0);

    // Fetch import logs
    const importLogs =
      importLogIds.length > 0
        ? await this.importLogRepository.find({
            where: { id: In(importLogIds) },
          })
        : [];

    // Create sync report
    const syncReport = this.syncReportRepository.create({
      user,
      status,
      syncStartedAt: syncStartTime,
      syncCompletedAt: new Date(),
      totalAccounts: importResult.summary.totalAccounts,
      successfulAccounts: importResult.summary.successfulImports,
      failedAccounts: importResult.summary.failedImports,
      totalNewTransactions: importResult.summary.totalNewTransactions,
      totalDuplicates: importResult.summary.totalDuplicates,
      totalPendingDuplicates: importResult.summary.totalPendingDuplicates,
      importLogs,
      syncType: 'automatic',
      accountResults: importResult.importResults,
      errorMessage,
    });

    return await this.syncReportRepository.save(syncReport);
  }

  async getUserSyncHistory(
    userId: number,
    options: PaginationOptions,
  ): Promise<PaginatedSyncReports> {
    const { page, limit, status } = options;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = { user: { id: userId } };
    if (status) {
      where.status = status;
    }

    // Find sync reports with pagination
    const [data, total] = await this.syncReportRepository.findAndCount({
      where,
      order: { syncStartedAt: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getSyncStatistics(
    userId: number,
    days: number,
  ): Promise<SyncStatistics> {
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Find all sync reports in date range
    const syncReports = await this.syncReportRepository.find({
      where: {
        user: { id: userId },
        syncStartedAt: MoreThanOrEqual(startDate),
      },
    });

    // Calculate statistics
    const totalSyncs = syncReports.length;

    if (totalSyncs === 0) {
      return {
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        successRate: 0,
        totalNewTransactions: 0,
        totalDuplicates: 0,
        averageTransactionsPerSync: 0,
      };
    }

    const successfulSyncs = syncReports.filter(
      (s) => s.status === SyncStatus.SUCCESS,
    ).length;
    const failedSyncs = syncReports.filter(
      (s) => s.status === SyncStatus.FAILED,
    ).length;
    const successRate = Number(
      ((successfulSyncs / totalSyncs) * 100).toFixed(2),
    );

    const totalNewTransactions = syncReports.reduce(
      (sum, report) => sum + report.totalNewTransactions,
      0,
    );
    const totalDuplicates = syncReports.reduce(
      (sum, report) => sum + report.totalDuplicates,
      0,
    );

    const averageTransactionsPerSync = Math.round(
      totalNewTransactions / totalSyncs,
    );

    return {
      totalSyncs,
      successfulSyncs,
      failedSyncs,
      successRate,
      totalNewTransactions,
      totalDuplicates,
      averageTransactionsPerSync,
    };
  }
}
