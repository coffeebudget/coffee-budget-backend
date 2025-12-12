import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { GocardlessService } from './gocardless.service';
import { SyncHistoryService } from '../sync-history/sync-history.service';
import { GocardlessPaypalReconciliationService } from './gocardless-paypal-reconciliation.service';

@Injectable()
export class GocardlessSchedulerService {
  private readonly logger = new Logger(GocardlessSchedulerService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly gocardlessService: GocardlessService,
    private readonly syncHistoryService: SyncHistoryService,
    private readonly paypalReconciliationService: GocardlessPaypalReconciliationService,
  ) {}

  @Cron('0 9 * * *')
  async dailyBankSync(): Promise<void> {
    this.logger.log('Starting daily bank sync for all users');
    const syncStartTime = new Date();

    try {
      const users = await this.getUsersWithGocardlessAccounts();
      this.logger.log(`Found ${users.length} users for sync`);

      for (const user of users) {
        try {
          // Calculate 48-hour lookback window for efficient daily sync
          // This covers delayed transactions while avoiding redundant fetches
          const now = new Date();
          const dateFrom = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago

          this.logger.log(
            `Syncing accounts for user ${user.id} (fetching transactions from ${dateFrom.toISOString().split('T')[0]} onwards)`,
          );

          const gocardlessResult =
            await this.gocardlessService.importAllConnectedAccounts(user.id, {
              dateFrom,
            });

          // Transform GocardlessService result to SyncHistoryService format
          const transformedResult = {
            summary: {
              totalAccounts: gocardlessResult.summary.totalAccounts,
              successfulImports: gocardlessResult.summary.successfulImports,
              failedImports: gocardlessResult.summary.failedImports,
              totalNewTransactions:
                gocardlessResult.summary.totalNewTransactions,
              totalDuplicates: gocardlessResult.summary.totalDuplicates,
              totalPendingDuplicates:
                gocardlessResult.summary.totalPendingDuplicates,
            },
            importResults: gocardlessResult.importResults.map((result) => ({
              accountId: result.gocardlessAccountId,
              accountName: result.accountName,
              accountType: result.accountType,
              success: !result.error,
              newTransactions: result.newTransactionsCount || 0,
              duplicates: result.duplicatesCount || 0,
              pendingDuplicates: result.pendingDuplicatesCreated || 0,
              importLogId: result.importLogId || 0,
              error: result.error,
            })),
          };

          await this.syncHistoryService.createSyncReport(
            user.id,
            transformedResult,
            syncStartTime,
          );

          this.logger.log(
            `Successfully synced ${gocardlessResult.summary.totalAccounts} accounts for user ${user.id}`,
          );

          // Process PayPal reconciliation after successful sync
          try {
            this.logger.log(
              `Starting PayPal reconciliation for user ${user.id}`,
            );
            const reconciliationResult =
              await this.paypalReconciliationService.processPayPalReconciliation(
                user.id,
              );
            this.logger.log(
              `PayPal reconciliation completed for user ${user.id}: ${reconciliationResult.reconciledCount} reconciled, ${reconciliationResult.unreconciledCount} unreconciled`,
            );
          } catch (reconciliationError) {
            // Log error but don't fail the overall sync
            this.logger.error(
              `PayPal reconciliation failed for user ${user.id}: ${reconciliationError.message}`,
              reconciliationError.stack,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to sync accounts for user ${user.id}: ${error.message}`,
            error.stack,
          );
          // Continue with other users even if one fails
        }
      }

      this.logger.log('Daily bank sync completed');
    } catch (error) {
      this.logger.error(
        `Daily bank sync failed: ${error.message}`,
        error.stack,
      );
    }
  }

  async getUsersWithGocardlessAccounts(): Promise<User[]> {
    return await this.userRepository.find({
      where: { isDemoUser: false },
    });
  }
}
