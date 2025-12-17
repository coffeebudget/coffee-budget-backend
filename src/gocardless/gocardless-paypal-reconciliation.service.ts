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

@Injectable()
export class GocardlessPaypalReconciliationService {
  private readonly logger = new Logger(GocardlessPaypalReconciliationService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  /**
   * Find potential bank transaction that matches a PayPal transaction
   * Matching criteria:
   * - Amount within ±1% tolerance
   * - Date within ±3 days
   * - Description contains "paypal"
   * - Same transaction type (expense/income)
   */
  async findPotentialPayPalMatch(
    paypalTransaction: Transaction,
    userId: number,
  ): Promise<Transaction | null> {
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
   */
  async reconcileTransactions(
    bankTransaction: Transaction,
    paypalTransaction: Transaction,
  ): Promise<ReconciliationPair> {
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
   */
  async processPayPalReconciliation(userId: number): Promise<ReconciliationResult> {
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
