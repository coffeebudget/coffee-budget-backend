import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Transaction } from './transaction.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { GocardlessService } from '../gocardless/gocardless.service';

export interface EnrichmentResult {
  totalTransactions: number;
  enrichedTransactions: number;
  skippedTransactions: number;
  errors: number;
  summary: string;
}

@Injectable()
export class TransactionMerchantEnrichmentService {
  private readonly logger = new Logger(TransactionMerchantEnrichmentService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(BankAccount)
    private bankAccountRepository: Repository<BankAccount>,
    private gocardlessService: GocardlessService,
  ) {}

  /**
   * Enrich transactions with merchant data from GoCardless API
   */
  async enrichTransactionsWithMerchantData(
    userId: number,
    dryRun: boolean = true
  ): Promise<EnrichmentResult> {
    this.logger.log(`Starting merchant data enrichment for user ${userId} (dryRun: ${dryRun})`);

    // Get GoCardless bank accounts for the user
    const goCardlessAccounts = await this.getGoCardlessAccounts(userId);
    
    if (goCardlessAccounts.length === 0) {
      this.logger.warn('No GoCardless accounts found for user');
      return {
        totalTransactions: 0,
        enrichedTransactions: 0,
        skippedTransactions: 0,
        errors: 0,
        summary: 'No GoCardless accounts found for user',
      };
    }

    this.logger.log(`Found ${goCardlessAccounts.length} GoCardless accounts`);

    const result: EnrichmentResult = {
      totalTransactions: 0,
      enrichedTransactions: 0,
      skippedTransactions: 0,
      errors: 0,
      summary: '',
    };

    // Process each GoCardless account
    for (const account of goCardlessAccounts) {
      try {
        const accountResult = await this.enrichAccountTransactions(account, userId, dryRun);
        result.totalTransactions += accountResult.totalTransactions;
        result.enrichedTransactions += accountResult.enrichedTransactions;
        result.skippedTransactions += accountResult.skippedTransactions;
        result.errors += accountResult.errors;
      } catch (error) {
        this.logger.error(`Error enriching account ${account.name}:`, error);
        result.errors++;
      }
    }

    result.summary = `Processed ${result.totalTransactions} transactions: ${result.enrichedTransactions} enriched, ${result.skippedTransactions} skipped, ${result.errors} errors`;
    this.logger.log(result.summary);
    return result;
  }

  /**
   * Enrich transactions for a specific GoCardless account
   */
  private async enrichAccountTransactions(
    account: BankAccount,
    userId: number,
    dryRun: boolean
  ): Promise<EnrichmentResult> {
    this.logger.log(`Enriching transactions for account: ${account.name}`);

    // Get transactions from this account that need enrichment
    const transactions = await this.getTransactionsNeedingEnrichment(account.id, userId);
    
    if (transactions.length === 0) {
      this.logger.log(`No transactions need enrichment for account: ${account.name}`);
      return {
        totalTransactions: 0,
        enrichedTransactions: 0,
        skippedTransactions: 0,
        errors: 0,
        summary: `No transactions need enrichment for account: ${account.name}`,
      };
    }

    this.logger.log(`Found ${transactions.length} transactions needing enrichment for account: ${account.name}`);

    // Fetch fresh transaction data from GoCardless
    const freshTransactions = await this.fetchFreshTransactionsFromGoCardless(account);
    
    if (!freshTransactions || freshTransactions.length === 0) {
      this.logger.warn(`No fresh transactions found from GoCardless for account: ${account.name}`);
      return {
        totalTransactions: transactions.length,
        enrichedTransactions: 0,
        skippedTransactions: transactions.length,
        errors: 0,
        summary: `No fresh data available from GoCardless for account: ${account.name}`,
      };
    }

    // Match and enrich transactions
    const result: EnrichmentResult = {
      totalTransactions: transactions.length,
      enrichedTransactions: 0,
      skippedTransactions: 0,
      errors: 0,
      summary: '',
    };

    for (const transaction of transactions) {
      try {
        const enriched = await this.enrichSingleTransaction(transaction, freshTransactions, dryRun);
        
        if (enriched) {
          result.enrichedTransactions++;
        } else {
          result.skippedTransactions++;
        }
      } catch (error) {
        this.logger.error(`Error enriching transaction ${transaction.id}:`, error);
        result.errors++;
      }
    }

    result.summary = `Account ${account.name}: ${result.enrichedTransactions} enriched, ${result.skippedTransactions} skipped, ${result.errors} errors`;
    return result;
  }

  /**
   * Get GoCardless bank accounts for a user
   */
  private async getGoCardlessAccounts(userId: number): Promise<BankAccount[]> {
    return this.bankAccountRepository.find({
      where: {
        user: { id: userId },
        gocardlessAccountId: Not(IsNull()),
      },
      select: ['id', 'name', 'gocardlessAccountId', 'currency'],
    });
  }

  /**
   * Get transactions that need merchant data enrichment
   */
  private async getTransactionsNeedingEnrichment(accountId: number, userId: number): Promise<Transaction[]> {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    return this.transactionRepository.find({
      where: {
        user: { id: userId },
        bankAccount: { id: accountId },
        executionDate: Not(IsNull()),
        // Either no merchant data or very old merchant data
        merchantName: IsNull(),
      },
      relations: ['bankAccount'],
      order: { executionDate: 'DESC' },
    });
  }

  /**
   * Fetch fresh transaction data from GoCardless API
   */
  private async fetchFreshTransactionsFromGoCardless(account: BankAccount): Promise<any[]> {
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const response = await this.gocardlessService.getAccountTransactions(
        account.gocardlessAccountId!,
        oneYearAgo,
        new Date()
      );

      return response.transactions.booked || [];
    } catch (error) {
      this.logger.error(`Failed to fetch fresh transactions for account ${account.name}:`, error);
      return [];
    }
  }

  /**
   * Enrich a single transaction with merchant data
   */
  private async enrichSingleTransaction(
    transaction: Transaction,
    freshTransactions: any[],
    dryRun: boolean
  ): Promise<boolean> {
    // Find matching transaction in fresh data
    const matchingTx = this.findMatchingTransaction(transaction, freshTransactions);
    
    if (!matchingTx) {
      this.logger.debug(`No matching transaction found for ${transaction.id}`);
      return false;
    }

    // Extract merchant data
    const merchantData = this.extractMerchantDataFromGoCardless(matchingTx, transaction.amount);
    
    if (!merchantData.merchantName) {
      this.logger.debug(`No merchant data available for transaction ${transaction.id}`);
      return false;
    }

    // Update transaction with merchant data
    if (!dryRun) {
      await this.updateTransactionWithMerchantData(transaction, merchantData);
      this.logger.debug(`Enriched transaction ${transaction.id} with merchant: ${merchantData.merchantName}`);
    } else {
      this.logger.debug(`Would enrich transaction ${transaction.id} with merchant: ${merchantData.merchantName} (dry run)`);
    }

    return true;
  }

  /**
   * Find matching transaction in fresh GoCardless data
   */
  private findMatchingTransaction(transaction: Transaction, freshTransactions: any[]): any | null {
    if (!transaction.executionDate) {
      return null;
    }

    const transactionDate = transaction.executionDate.toISOString().split('T')[0];
    const transactionAmount = Math.abs(transaction.amount).toFixed(2);

    return freshTransactions.find(tx => {
      const txDate = tx.bookingDate || tx.valueDate;
      const txAmount = Math.abs(parseFloat(tx.transactionAmount.amount)).toFixed(2);
      
      return txDate === transactionDate && txAmount === transactionAmount;
    });
  }

  /**
   * Extract merchant data from GoCardless transaction
   */
  private extractMerchantDataFromGoCardless(goCardlessTx: any, amount: number): {
    merchantName: string | null;
    merchantCategoryCode: string | null;
    debtorName: string | null;
    creditorName: string | null;
  } {
    // Extract merchant name using the same logic as the parser
    let merchantName: string | null = null;
    
    if (amount < 0 && goCardlessTx.creditorName) {
      // For expenses, use creditor name (who we paid to)
      merchantName = goCardlessTx.creditorName.trim();
    } else if (amount > 0 && goCardlessTx.debtorName) {
      // For income, use debtor name (who paid us)
      merchantName = goCardlessTx.debtorName.trim();
    }
    
    return {
      merchantName,
      merchantCategoryCode: goCardlessTx.merchantCategoryCode || null,
      debtorName: goCardlessTx.debtorName || null,
      creditorName: goCardlessTx.creditorName || null,
    };
  }

  /**
   * Update transaction with merchant data
   */
  private async updateTransactionWithMerchantData(
    transaction: Transaction,
    merchantData: {
      merchantName: string | null;
      merchantCategoryCode: string | null;
      debtorName: string | null;
      creditorName: string | null;
    }
  ): Promise<void> {
    transaction.merchantName = merchantData.merchantName;
    transaction.merchantCategoryCode = merchantData.merchantCategoryCode;
    transaction.debtorName = merchantData.debtorName;
    transaction.creditorName = merchantData.creditorName;

    await this.transactionRepository.save(transaction);
    
    this.logger.debug(`Updated transaction ${transaction.id} with merchant data: ${merchantData.merchantName}`);
  }

  /**
   * Get enrichment statistics for a user
   */
  async getEnrichmentStats(userId: number): Promise<{
    totalTransactions: number;
    transactionsWithMerchantData: number;
    transactionsNeedingEnrichment: number;
    goCardlessAccounts: number;
    potentialImprovement: number;
  }> {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const [totalTransactions, transactionsWithMerchantData, transactionsNeedingEnrichment, goCardlessAccounts] = await Promise.all([
      this.transactionRepository.count({
        where: {
          user: { id: userId },
          executionDate: Not(IsNull()),
        },
      }),
      this.transactionRepository.count({
        where: {
          user: { id: userId },
          merchantName: Not(IsNull()),
          executionDate: Not(IsNull()),
        },
      }),
      this.transactionRepository.count({
        where: {
          user: { id: userId },
          merchantName: IsNull(),
          executionDate: Not(IsNull()),
        },
      }),
      this.bankAccountRepository.count({
        where: {
          user: { id: userId },
          gocardlessAccountId: Not(IsNull()),
        },
      }),
    ]);

    const potentialImprovement = goCardlessAccounts > 0 ? transactionsNeedingEnrichment : 0;

    return {
      totalTransactions,
      transactionsWithMerchantData,
      transactionsNeedingEnrichment,
      goCardlessAccounts,
      potentialImprovement,
    };
  }
}
