import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';

export interface ReconciliationResult {
  reconciledCount: number;
  unreconciledCount: number;
  unreconciledTransactions: Partial<Transaction>[];
}

export interface ReconciliationPair {
  bankTransaction: Transaction;
  paypalTransaction: Transaction;
}

/**
 * @deprecated This service is deprecated and will be removed in v2.0
 *
 * MIGRATION PATH:
 * - Old: Transaction-to-Transaction reconciliation (this service)
 * - New: PaymentActivity-based reconciliation (PaymentActivityService)
 *
 * The new system uses PaymentActivity entities to track payment provider
 * activities (PayPal, etc.) separately from bank transactions, with a
 * cleaner reconciliation model.
 *
 * TIMELINE:
 * - Phase 1 (Current): Deprecation warnings added
 * - Phase 2: Data migration to PaymentActivity system
 * - Phase 3: Schema cleanup and removal
 *
 * @see docs/tasks/active/REFACTOR-20251217-cleanup-old-reconciliation.md
 */
@Injectable()
export class GocardlessPaypalReconciliationService {
  private readonly logger = new Logger(GocardlessPaypalReconciliationService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {
    // Log deprecation warning on service initialization
    this.logger.warn(
      'DEPRECATED: GocardlessPaypalReconciliationService is deprecated. ' +
      'Migrate to PaymentActivity-based reconciliation. ' +
      'See: docs/tasks/active/REFACTOR-20251217-cleanup-old-reconciliation.md'
    );
  }

  /**
   * Find potential bank transaction that matches a PayPal transaction
   * Matching criteria:
   * - Amount within ±1% tolerance
   * - Date within ±3 days
   * - Description contains "paypal"
   * - Same transaction type (expense/income)
   *
   * @deprecated Use PaymentActivityService.findMatchingBankTransaction() instead
   * This method will be removed in v2.0
   */
  async findPotentialPayPalMatch(
    paypalTransaction: Transaction,
    userId: number,
  ): Promise<Transaction | null> {
    this.logger.warn({
      message: 'DEPRECATED: findPotentialPayPalMatch() called',
      deprecatedMethod: 'findPotentialPayPalMatch',
      replacementMethod: 'PaymentActivityService.findMatchingBankTransaction',
      scheduledRemoval: 'v2.0',
      userId,
      transactionId: paypalTransaction.id,
    });

    // Return null if executionDate is not set
    if (!paypalTransaction.executionDate) {
      return null;
    }

    // Calculate amount tolerance (±1%)
    const tolerance = paypalTransaction.amount * 0.01;
    const minAmount = paypalTransaction.amount - tolerance;
    const maxAmount = paypalTransaction.amount + tolerance;

    // Calculate date range (±3 days)
    const startDate = new Date(paypalTransaction.executionDate);
    startDate.setDate(startDate.getDate() - 3);
    const endDate = new Date(paypalTransaction.executionDate);
    endDate.setDate(endDate.getDate() + 3);

    const matchingTransaction = await this.transactionRepository
      .createQueryBuilder('transaction')
      .innerJoin('transaction.user', 'user')
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: paypalTransaction.type })
      .andWhere('transaction.source LIKE :source', { source: 'gocardless%' })
      .andWhere('transaction.source != :paypalSource', {
        paypalSource: 'gocardless_paypal',
      })
      .andWhere('transaction.executionDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('transaction.amount BETWEEN :minAmount AND :maxAmount', {
        minAmount,
        maxAmount,
      })
      .andWhere('LOWER(transaction.description) LIKE :paypal', {
        paypal: '%paypal%',
      })
      .andWhere('transaction.reconciliationStatus = :status', {
        status: 'not_reconciled',
      })
      .orderBy('transaction.executionDate', 'ASC')
      .getOne();

    return matchingTransaction;
  }

  /**
   * Reconcile a pair of transactions (bank + PayPal)
   * - Mark bank transaction as primary
   * - Mark PayPal transaction as secondary
   * - Link PayPal transaction to bank transaction
   * - Enrich bank transaction description with PayPal merchant info
   *
   * @deprecated Use PaymentActivityService.reconcile() instead
   * This method will be removed in v2.0
   */
  async reconcileTransactions(
    bankTransaction: Transaction,
    paypalTransaction: Transaction,
  ): Promise<ReconciliationPair> {
    this.logger.warn({
      message: 'DEPRECATED: reconcileTransactions() called',
      deprecatedMethod: 'reconcileTransactions',
      replacementMethod: 'PaymentActivityService.reconcile',
      scheduledRemoval: 'v2.0',
      bankTransactionId: bankTransaction.id,
      paypalTransactionId: paypalTransaction.id,
    });

    // Enrich bank transaction description with PayPal merchant info
    if (paypalTransaction.merchantName) {
      const enrichedDescription = this.enrichDescription(
        bankTransaction.description,
        paypalTransaction.merchantName,
      );
      bankTransaction.description = enrichedDescription;
    }

    // Mark bank transaction as primary
    bankTransaction.reconciliationStatus = 'reconciled_as_primary';

    // Mark PayPal transaction as secondary and link to bank transaction
    paypalTransaction.reconciliationStatus = 'reconciled_as_secondary';
    paypalTransaction.reconciledWithTransaction = bankTransaction;

    // Save both transactions
    await this.transactionRepository.save([bankTransaction, paypalTransaction]);

    this.logger.log(
      `Reconciled PayPal transaction ${paypalTransaction.id} with bank transaction ${bankTransaction.id}`,
    );

    return {
      bankTransaction,
      paypalTransaction,
    };
  }

  /**
   * Process PayPal reconciliation for a user
   * Finds all unreconciled PayPal transactions and attempts to match them with bank transactions
   *
   * @deprecated Use PaymentActivityService for reconciliation instead
   * This method will be removed in v2.0
   *
   * The new architecture:
   * 1. Import PayPal activities as PaymentActivity entities
   * 2. Match PaymentActivities with bank Transactions
   * 3. Enrich transactions with merchant data from PaymentActivities
   */
  async processPayPalReconciliation(userId: number): Promise<ReconciliationResult> {
    this.logger.warn({
      message: 'DEPRECATED: processPayPalReconciliation() called',
      deprecatedMethod: 'processPayPalReconciliation',
      replacementMethod: 'PaymentActivityService (import + reconcile)',
      scheduledRemoval: 'v2.0',
      userId,
    });

    // Find all unreconciled PayPal transactions for the user
    const paypalTransactions = await this.transactionRepository.find({
      where: {
        user: { id: userId },
        source: 'gocardless_paypal',
        reconciliationStatus: 'not_reconciled',
      },
      order: {
        executionDate: 'DESC',
      },
    });

    this.logger.log(
      `Found ${paypalTransactions.length} unreconciled PayPal transactions for user ${userId}`,
    );

    let reconciledCount = 0;
    const unreconciledTransactions: Partial<Transaction>[] = [];

    // Process each PayPal transaction
    for (const paypalTransaction of paypalTransactions) {
      try {
        // Try to find matching bank transaction
        const bankTransaction = await this.findPotentialPayPalMatch(
          paypalTransaction,
          userId,
        );

        if (bankTransaction) {
          // Reconcile the pair
          await this.reconcileTransactions(bankTransaction, paypalTransaction);
          reconciledCount++;
        } else {
          // No match found - track as unreconciled
          unreconciledTransactions.push({
            id: paypalTransaction.id,
            description: paypalTransaction.description,
            amount: paypalTransaction.amount,
            executionDate: paypalTransaction.executionDate,
          });
        }
      } catch (error) {
        this.logger.error(
          `Error reconciling PayPal transaction ${paypalTransaction.id}: ${error.message}`,
        );
        unreconciledTransactions.push({
          id: paypalTransaction.id,
          description: paypalTransaction.description,
          amount: paypalTransaction.amount,
          executionDate: paypalTransaction.executionDate,
        });
      }
    }

    this.logger.log(
      `Reconciliation complete: ${reconciledCount} reconciled, ${unreconciledTransactions.length} unreconciled`,
    );

    return {
      reconciledCount,
      unreconciledCount: unreconciledTransactions.length,
      unreconciledTransactions,
    };
  }

  /**
   * Enrich description by appending merchant name if not already present
   * @private
   */
  private enrichDescription(description: string, merchantName: string): string {
    // Check if merchant name is already in description
    if (description.toLowerCase().includes(merchantName.toLowerCase())) {
      return description;
    }

    // Append merchant name to description
    return `${description} - ${merchantName}`;
  }
}
