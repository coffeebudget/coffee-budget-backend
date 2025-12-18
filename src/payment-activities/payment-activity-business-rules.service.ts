import { Injectable } from '@nestjs/common';
import { PaymentActivity } from './payment-activity.entity';

/**
 * Service for determining business rules related to PaymentActivity reconciliation.
 *
 * This service classifies payment activities and determines whether they
 * require reconciliation with bank transactions or should be marked as
 * 'not_applicable' (e.g., loans, fees, internal transfers).
 */
@Injectable()
export class PaymentActivityBusinessRulesService {
  /**
   * Keywords that indicate an activity does not need reconciliation.
   * These are matched as whole words (word boundaries) to avoid false positives.
   */
  private readonly nonReconcilableKeywords = [
    'loan',
    'fee',
    'transfer',
    'withdrawal',
    'interest',
    'adjustment',
    'currency conversion',
    'credit payment',
  ];

  /**
   * Transaction types from rawData that indicate non-reconcilable activities.
   */
  private readonly nonReconcilableTransactionTypes = [
    'loan',
    'fee',
    'transfer',
    'withdrawal',
    'interest',
    'adjustment',
    'currency_conversion',
    'credit_payment',
    'loan_payment',
  ];

  /**
   * Merchant categories that indicate non-reconcilable activities.
   */
  private readonly nonReconcilableMerchantCategories = [
    'loan',
    'fee',
    'currency exchange',
    'loan services',
  ];

  /**
   * Determines the initial reconciliation status for a payment activity.
   *
   * Activities that don't require reconciliation (loans, fees, internal transfers)
   * are marked as 'not_applicable'. Regular merchant purchases are marked as 'pending'.
   *
   * @param activity - The PaymentActivity to classify
   * @returns 'not_applicable' for non-reconcilable activities, 'pending' otherwise
   */
  determineInitialReconciliationStatus(
    activity: PaymentActivity,
  ): 'not_applicable' | 'pending' {
    // Check rawData transaction_type
    if (this.isNonReconcilableByRawData(activity.rawData)) {
      return 'not_applicable';
    }

    // Check merchant category
    if (this.isNonReconcilableByMerchantCategory(activity.merchantCategory)) {
      return 'not_applicable';
    }

    // Check description for keywords
    if (this.isNonReconcilableByDescription(activity.description)) {
      return 'not_applicable';
    }

    return 'pending';
  }

  /**
   * Checks if a transaction type is non-reconcilable.
   * Used for external validation of transaction types.
   *
   * @param transactionType - The transaction type to check
   * @returns true if the type indicates a non-reconcilable activity
   */
  isNonReconcilableActivityType(transactionType: string): boolean {
    if (!transactionType) {
      return false;
    }

    const normalizedType = transactionType.toLowerCase();

    // Check for exact matches or keyword presence with word boundaries
    return this.nonReconcilableTransactionTypes.some((type) => {
      // Exact match
      if (normalizedType === type) {
        return true;
      }
      // Check with word boundary (handles underscores as separators)
      const regex = new RegExp(`(^|_)${type}($|_)`, 'i');
      return regex.test(normalizedType);
    });
  }

  /**
   * Returns the list of keywords used to identify non-reconcilable activities.
   *
   * @returns Array of keyword strings
   */
  getNonReconcilableKeywords(): string[] {
    return [...this.nonReconcilableKeywords];
  }

  /**
   * Checks if rawData indicates a non-reconcilable activity.
   */
  private isNonReconcilableByRawData(
    rawData: Record<string, any> | null,
  ): boolean {
    if (!rawData || !rawData.transaction_type) {
      return false;
    }

    const transactionType = String(rawData.transaction_type).toLowerCase();

    return this.nonReconcilableTransactionTypes.some((type) => {
      // Exact match
      if (transactionType === type) {
        return true;
      }
      // Check with word boundary (handles underscores as separators)
      const regex = new RegExp(`(^|_)${type}($|_)`, 'i');
      return regex.test(transactionType);
    });
  }

  /**
   * Checks if merchant category indicates a non-reconcilable activity.
   * Uses word boundary matching to avoid false positives.
   */
  private isNonReconcilableByMerchantCategory(
    merchantCategory: string | null,
  ): boolean {
    if (!merchantCategory) {
      return false;
    }

    const normalizedCategory = merchantCategory.toLowerCase();

    return this.nonReconcilableMerchantCategories.some((category) => {
      // Exact match
      if (normalizedCategory === category) {
        return true;
      }
      // Word boundary match for multi-word categories
      if (category.includes(' ')) {
        return normalizedCategory.includes(category);
      }
      // Word boundary match for single-word categories
      const regex = new RegExp(`\\b${category}\\b`, 'i');
      return regex.test(normalizedCategory);
    });
  }

  /**
   * Checks if description contains keywords indicating non-reconcilable activity.
   * Uses word boundary matching to avoid false positives (e.g., "coffee" matching "fee").
   */
  private isNonReconcilableByDescription(description: string | null): boolean {
    if (!description) {
      return false;
    }

    const normalizedDescription = description.toLowerCase();

    // Check multi-word keywords first (exact phrase match)
    const multiWordKeywords = this.nonReconcilableKeywords.filter((k) =>
      k.includes(' '),
    );
    for (const keyword of multiWordKeywords) {
      if (normalizedDescription.includes(keyword)) {
        return true;
      }
    }

    // Check single-word keywords with word boundary matching
    const singleWordKeywords = this.nonReconcilableKeywords.filter(
      (k) => !k.includes(' '),
    );
    for (const keyword of singleWordKeywords) {
      // Use word boundary regex to avoid false positives like "coffee" matching "fee"
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(normalizedDescription)) {
        return true;
      }
    }

    return false;
  }
}
