import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Transaction } from '../transaction.entity';
import { PaymentActivityCreatedEvent } from '../../shared/events/payment-activity-created.event';
import { PaymentActivitiesService } from '../../payment-activities/payment-activities.service';
import { PaymentAccount } from '../../payment-accounts/payment-account.entity';
import { EventPublisherService } from '../../shared/services/event-publisher.service';
import { TransactionEnrichedEvent } from '../../shared/events/transaction.events';

/**
 * Event handler for automatic reconciliation of payment activities with bank transactions
 *
 * When a payment activity is created (e.g., PayPal transaction), this handler:
 * 1. Searches for matching bank transactions based on amount, date, and merchant info
 * 2. Enriches the bank transaction with payment activity details
 * 3. Updates reconciliation status on both entities
 */
@Injectable()
export class PaymentActivityEventHandler {
  private readonly logger = new Logger(PaymentActivityEventHandler.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(PaymentAccount)
    private readonly paymentAccountRepository: Repository<PaymentAccount>,
    private readonly paymentActivitiesService: PaymentActivitiesService,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  @OnEvent('PaymentActivityCreatedEvent')
  async handlePaymentActivityCreated(
    event: PaymentActivityCreatedEvent,
  ): Promise<void> {
    const { paymentActivity, userId } = event;

    this.logger.log(
      `Processing reconciliation for payment activity ${paymentActivity.id} (user ${userId})`,
    );

    try {
      // Get payment account details for provider-specific matching
      const paymentAccount = await this.paymentAccountRepository.findOne({
        where: { id: paymentActivity.paymentAccountId },
      });

      if (!paymentAccount) {
        this.logger.warn(
          `Payment account ${paymentActivity.paymentAccountId} not found, skipping reconciliation`,
        );
        return;
      }

      // Find matching bank transaction
      const matchingTransaction = await this.findMatchingBankTransaction(
        paymentActivity,
        paymentAccount,
        userId,
      );

      if (matchingTransaction) {
        await this.reconcileTransactionWithActivity(
          matchingTransaction,
          paymentActivity,
          paymentAccount,
        );
        this.logger.log(
          `Successfully reconciled payment activity ${paymentActivity.id} with transaction ${matchingTransaction.id}`,
        );
      } else {
        this.logger.debug(
          `No matching bank transaction found for payment activity ${paymentActivity.id}`,
        );
        // Mark as failed for manual review
        await this.paymentActivitiesService.markReconciliationFailed(
          paymentActivity.id,
          userId,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error reconciling payment activity ${paymentActivity.id}: ${error.message}`,
        error.stack,
      );
      // Don't throw - allow transaction creation to succeed even if reconciliation fails
    }
  }

  /**
   * Find bank transaction that matches a payment activity
   *
   * Matching criteria:
   * - Amount within 1% tolerance
   * - Execution date within ±3 days
   * - Transaction description contains payment provider name
   * - Not already enriched by another payment activity
   */
  private async findMatchingBankTransaction(
    paymentActivity: any,
    paymentAccount: PaymentAccount,
    userId: number,
  ): Promise<Transaction | null> {
    // Calculate amount tolerance (1%)
    const tolerance = paymentActivity.amount * 0.01;
    const minAmount = paymentActivity.amount - tolerance;
    const maxAmount = paymentActivity.amount + tolerance;

    // Calculate date range (±3 days)
    const executionDate = new Date(paymentActivity.executionDate);
    const startDate = new Date(executionDate);
    startDate.setDate(startDate.getDate() - 3);
    const endDate = new Date(executionDate);
    endDate.setDate(endDate.getDate() + 3);

    // Build query
    const query = this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.user.id = :userId', { userId })
      .andWhere('transaction.amount BETWEEN :minAmount AND :maxAmount', {
        minAmount,
        maxAmount,
      })
      .andWhere('transaction.executionDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('transaction.enrichedFromPaymentActivityId IS NULL') // Not already enriched
      .andWhere('transaction.source != :manualSource', { manualSource: 'manual' }); // Only imported transactions

    // Add provider-specific description matching
    const providerName = paymentAccount.provider.toLowerCase();
    query.andWhere('LOWER(transaction.description) LIKE :provider', {
      provider: `%${providerName}%`,
    });

    // Determine transaction type from rawData
    const isExpense = paymentActivity.rawData?.transactionType === 'expense';
    query.andWhere('transaction.type = :type', {
      type: isExpense ? 'expense' : 'income',
    });

    // Get best match (closest date)
    const candidates = await query
      .orderBy(
        'ABS(EXTRACT(EPOCH FROM (transaction.executionDate - :executionDate::timestamp)))',
        'ASC',
      )
      .setParameter('executionDate', executionDate)
      .limit(1)
      .getMany();

    return candidates.length > 0 ? candidates[0] : null;
  }

  /**
   * Reconcile bank transaction with payment activity
   *
   * Updates both entities:
   * - Transaction: enrichedFromPaymentActivityId, enhanced merchant info
   * - PaymentActivity: reconciliation status and confidence
   */
  private async reconcileTransactionWithActivity(
    transaction: Transaction,
    paymentActivity: any,
    paymentAccount: PaymentAccount,
  ): Promise<void> {
    // Calculate reconciliation confidence based on match quality
    const confidence = this.calculateReconciliationConfidence(
      transaction,
      paymentActivity,
    );

    // Enrich transaction with payment activity details
    transaction.enrichedFromPaymentActivityId = paymentActivity.id;
    transaction.originalMerchantName =
      transaction.merchantName || transaction.description;
    transaction.enhancedMerchantName =
      paymentActivity.merchantName || paymentActivity.description;
    transaction.enhancedCategoryConfidence = confidence;

    // Update description with enhanced merchant name for better UX
    // Original is preserved in originalMerchantName for audit trail
    if (transaction.enhancedMerchantName) {
      transaction.description = transaction.enhancedMerchantName;
    }

    // Update merchant info if available
    if (paymentActivity.merchantCategoryCode) {
      transaction.merchantCategoryCode = paymentActivity.merchantCategoryCode;
    }

    // Save enriched transaction
    const savedTransaction = await this.transactionRepository.save(transaction);

    // Update payment activity reconciliation status
    // Pass publishEvent: false to prevent duplicate event publishing (we publish manually below)
    await this.paymentActivitiesService.updateReconciliation(
      paymentActivity.id,
      paymentActivity.paymentAccount.userId,
      {
        reconciledTransactionId: transaction.id,
        reconciliationStatus: 'reconciled',
        reconciliationConfidence: confidence,
      },
      false, // publishEvent = false for automatic flow
    );

    // Publish TransactionEnrichedEvent for re-categorization
    try {
      this.eventPublisher.publish(
        new TransactionEnrichedEvent(
          savedTransaction,
          paymentActivity.id,
          savedTransaction.enhancedMerchantName,
          savedTransaction.originalMerchantName,
          paymentActivity.paymentAccount.userId,
        ),
      );

      this.logger.debug(
        `Published TransactionEnrichedEvent for transaction ${savedTransaction.id} after automatic reconciliation`,
      );
    } catch (error) {
      // Log but don't break reconciliation flow
      this.logger.error(
        `Failed to publish TransactionEnrichedEvent: ${error.message}`,
        error.stack,
      );
    }

    this.logger.debug(
      `Enriched transaction ${transaction.id} with payment activity ${paymentActivity.id} (confidence: ${confidence}%)`,
    );
  }

  /**
   * Calculate reconciliation confidence score (0-100)
   *
   * Factors:
   * - Amount match precision
   * - Date proximity
   * - Merchant name similarity
   */
  private calculateReconciliationConfidence(
    transaction: Transaction,
    paymentActivity: any,
  ): number {
    let confidence = 0;

    // Amount match (40 points)
    const amountDiff = Math.abs(transaction.amount - paymentActivity.amount);
    const amountPrecision = 1 - amountDiff / paymentActivity.amount;
    confidence += amountPrecision * 40;

    // Date proximity (30 points)
    if (transaction.executionDate && paymentActivity.executionDate) {
      const dateDiff = Math.abs(
        new Date(transaction.executionDate).getTime() -
          new Date(paymentActivity.executionDate).getTime(),
      );
      const daysDiff = dateDiff / (1000 * 60 * 60 * 24);
      const dateScore = Math.max(0, 1 - daysDiff / 3) * 30;
      confidence += dateScore;
    }

    // Description/merchant similarity (30 points)
    const transactionDesc = (
      transaction.description || ''
    ).toLowerCase();
    const activityMerchant = (
      paymentActivity.merchantName ||
      paymentActivity.description ||
      ''
    ).toLowerCase();

    if (
      transactionDesc.includes(activityMerchant) ||
      activityMerchant.includes(transactionDesc)
    ) {
      confidence += 30;
    } else {
      // Partial match using word overlap
      const transWords = new Set(transactionDesc.split(/\s+/));
      const activityWords = new Set(activityMerchant.split(/\s+/));
      const commonWords = [...transWords].filter((word) =>
        activityWords.has(word),
      );
      const overlapScore = (commonWords.length / activityWords.size) * 30;
      confidence += overlapScore;
    }

    return Math.round(Math.min(100, Math.max(0, confidence)));
  }
}
