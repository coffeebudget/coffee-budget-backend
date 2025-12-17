import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentAccount } from '../payment-accounts/payment-account.entity';
import { PaymentActivitiesService } from './payment-activities.service';
import { GocardlessService } from '../gocardless/gocardless.service';

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Service for importing payment activities from external sources (GoCardless)
 * Focuses on payment intermediaries like PayPal, Klarna, etc.
 */
@Injectable()
export class PaymentAccountImportService {
  private readonly logger = new Logger(PaymentAccountImportService.name);

  constructor(
    @InjectRepository(PaymentAccount)
    private readonly paymentAccountRepository: Repository<PaymentAccount>,
    private readonly paymentActivitiesService: PaymentActivitiesService,
    private readonly gocardlessService: GocardlessService,
  ) {}

  /**
   * Import payment activities for a payment account from GoCardless
   *
   * @param paymentAccountId - Payment account ID
   * @param userId - User ID for authorization
   * @param dateFrom - Optional start date (defaults to 90 days ago)
   * @param dateTo - Optional end date (defaults to today)
   */
  async importFromGoCardless(
    paymentAccountId: number,
    userId: number,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<ImportResult> {
    this.logger.log(
      `Starting import for payment account ${paymentAccountId}, user ${userId}`,
    );

    // 1. Verify payment account exists and belongs to user
    const paymentAccount = await this.paymentAccountRepository.findOne({
      where: { id: paymentAccountId, userId },
    });

    if (!paymentAccount) {
      throw new NotFoundException(
        `Payment account ${paymentAccountId} not found for user ${userId}`,
      );
    }

    const gocardlessAccountId = paymentAccount.providerConfig?.gocardlessAccountId;

    if (!gocardlessAccountId) {
      throw new NotFoundException(
        `Payment account ${paymentAccountId} is not connected to GoCardless`,
      );
    }

    // 2. Set date range (default to last 90 days if not specified)
    const effectiveDateFrom =
      dateFrom || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const effectiveDateTo = dateTo || new Date();

    this.logger.log(
      `Fetching transactions from ${effectiveDateFrom.toISOString().split('T')[0]} to ${effectiveDateTo.toISOString().split('T')[0]}`,
    );

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
    };

    try {
      // 3. Fetch transactions from GoCardless
      const transactionsResponse =
        await this.gocardlessService.getAccountTransactions(
          gocardlessAccountId,
          effectiveDateFrom,
          effectiveDateTo,
        );

      const allTransactions = [
        ...transactionsResponse.transactions.booked,
        ...transactionsResponse.transactions.pending.map((t) => ({
          ...t,
          bookingDate: t.valueDate, // Pending transactions use valueDate
        })),
      ];

      this.logger.log(
        `Fetched ${allTransactions.length} transactions from GoCardless`,
      );

      // 4. Process each transaction
      for (const transaction of allTransactions) {
        try {
          // Check if already imported by external ID
          const existing =
            await this.paymentActivitiesService.findByExternalId(
              transaction.transactionId,
              userId,
            );

          if (existing) {
            this.logger.debug(
              `Skipping duplicate transaction: ${transaction.transactionId}`,
            );
            result.skipped++;
            continue;
          }

          // Extract merchant information from transaction
          const merchantName =
            transaction.debtorName ||
            transaction.creditorName ||
            transaction.remittanceInformationUnstructured ||
            'Unknown Merchant';

          // Determine if expense or income
          const amount = Math.abs(parseFloat(transaction.transactionAmount.amount));
          const isExpense = parseFloat(transaction.transactionAmount.amount) < 0;

          // Create payment activity
          await this.paymentActivitiesService.create(userId, {
            paymentAccountId,
            externalId: transaction.transactionId,
            merchantName,
            merchantCategory: transaction.merchantCategoryCode,
            merchantCategoryCode: transaction.bankTransactionCode,
            amount,
            executionDate: new Date(transaction.bookingDate),
            description:
              transaction.remittanceInformationUnstructured ||
              transaction.remittanceInformationUnstructuredArray?.join(' ') ||
              merchantName,
            rawData: {
              gocardless: transaction,
              transactionType: isExpense ? 'expense' : 'income',
            },
          });

          result.imported++;
          this.logger.debug(
            `Imported transaction: ${transaction.transactionId} - ${merchantName} - ${amount}`,
          );
        } catch (error) {
          this.logger.error(
            `Error importing transaction ${transaction.transactionId}: ${error.message}`,
          );
          result.errors.push(
            `Transaction ${transaction.transactionId}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `Import completed: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to import from GoCardless: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Import payment activities for all PayPal accounts of a user
   *
   * @param userId - User ID
   * @param dateFrom - Optional start date
   * @param dateTo - Optional end date
   */
  async importAllPayPalAccountsForUser(
    userId: number,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<{
    totalImported: number;
    totalSkipped: number;
    accountResults: Array<{
      paymentAccountId: number;
      accountName: string;
      result: ImportResult;
    }>;
  }> {
    this.logger.log(
      `Starting PayPal import for all accounts of user ${userId}`,
    );

    // Find all PayPal payment accounts for user
    const paypalAccounts = await this.paymentAccountRepository.find({
      where: {
        userId,
        provider: 'paypal',
      },
    });

    if (paypalAccounts.length === 0) {
      this.logger.warn(`No PayPal accounts found for user ${userId}`);
      return {
        totalImported: 0,
        totalSkipped: 0,
        accountResults: [],
      };
    }

    this.logger.log(
      `Found ${paypalAccounts.length} PayPal account(s) for user ${userId}`,
    );

    const accountResults: Array<{
      paymentAccountId: number;
      accountName: string;
      result: ImportResult;
    }> = [];

    let totalImported = 0;
    let totalSkipped = 0;

    // Import for each PayPal account
    for (const account of paypalAccounts) {
      this.logger.log(
        `Importing for PayPal account: ${account.displayName || 'PayPal'} (ID: ${account.id})`,
      );

      try {
        const result = await this.importFromGoCardless(
          account.id,
          userId,
          dateFrom,
          dateTo,
        );

        accountResults.push({
          paymentAccountId: account.id,
          accountName: account.displayName || 'PayPal',
          result,
        });

        totalImported += result.imported;
        totalSkipped += result.skipped;
      } catch (error) {
        this.logger.error(
          `Failed to import for account ${account.id}: ${error.message}`,
        );
        accountResults.push({
          paymentAccountId: account.id,
          accountName: account.displayName || 'PayPal',
          result: {
            imported: 0,
            skipped: 0,
            errors: [error.message],
          },
        });
      }
    }

    this.logger.log(
      `PayPal import completed: ${totalImported} total imported, ${totalSkipped} total skipped across ${paypalAccounts.length} account(s)`,
    );

    return {
      totalImported,
      totalSkipped,
      accountResults,
    };
  }
}
