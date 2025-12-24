import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEnrichedEvent } from '../../shared/events/transaction.events';
import { CategoriesService } from '../categories.service';
import { Transaction } from '../../transactions/transaction.entity';

/**
 * Transaction Enriched Event Handler for Categories Module
 *
 * When a transaction is enriched with payment activity data (e.g., "PayPal Transfer"
 * becomes "Starbucks"), this handler re-categorizes the transaction using the
 * enhanced merchant name.
 *
 * Re-categorization only occurs if:
 * 1. Enhanced merchant name differs significantly from original
 * 2. Transaction is not already manually categorized
 * 3. Enhanced merchant name provides better keyword matching
 */
@Injectable()
export class TransactionEnrichedEventHandler {
  private readonly logger = new Logger(TransactionEnrichedEventHandler.name);

  // Constants for categorization logic
  private static readonly DEFAULT_ENRICHMENT_CONFIDENCE = 85.0;
  private static readonly SIMILARITY_THRESHOLD = 0.8;
  private static readonly MANUAL_CATEGORY_CONFIDENCE_THRESHOLD = 95.0;

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly categoriesService: CategoriesService,
  ) {}

  @OnEvent('TransactionEnrichedEvent')
  async handleTransactionEnriched(
    event: TransactionEnrichedEvent,
  ): Promise<void> {
    const {
      transaction,
      enhancedMerchantName,
      originalMerchantName,
      userId,
    } = event;

    this.logger.debug(
      'Processing TransactionEnrichedEvent for re-categorization',
      {
        transactionId: transaction.id,
        enhancedMerchantName,
        originalMerchantName,
        userId,
      },
    );

    try {
      // Skip re-categorization if enhanced merchant name is not meaningful
      if (
        !enhancedMerchantName ||
        enhancedMerchantName.trim().length === 0
      ) {
        this.logger.debug(
          'Skipping re-categorization: no enhanced merchant name',
          {
            transactionId: transaction.id,
          },
        );
        return;
      }

      // Skip if transaction already has a manually assigned category
      // (Check categorizationConfidence - null or very high suggests manual)
      if (
        transaction.category &&
        (!transaction.categorizationConfidence ||
          transaction.categorizationConfidence >=
            TransactionEnrichedEventHandler.MANUAL_CATEGORY_CONFIDENCE_THRESHOLD)
      ) {
        this.logger.debug(
          'Skipping re-categorization: transaction has manual category',
          {
            transactionId: transaction.id,
            categoryId: transaction.category.id,
          },
        );
        return;
      }

      // Skip if enhanced name is too similar to original (e.g., both "PayPal")
      if (
        this.isSimilarMerchantName(enhancedMerchantName, originalMerchantName)
      ) {
        this.logger.debug(
          'Skipping re-categorization: merchant names too similar',
          {
            transactionId: transaction.id,
            enhancedMerchantName,
            originalMerchantName,
          },
        );
        return;
      }

      // Attempt re-categorization using enhanced merchant name
      const suggestedCategory =
        await this.categoriesService.suggestCategoryForDescription(
          enhancedMerchantName,
          userId,
        );

      if (suggestedCategory) {
        // Only update if new category is different from current
        if (
          !transaction.category ||
          transaction.category.id !== suggestedCategory.id
        ) {
          const previousCategoryId = transaction.category?.id;

          // Reload transaction to ensure we have latest state
          const currentTransaction =
            await this.transactionRepository.findOne({
              where: { id: transaction.id },
              relations: ['category'],
            });

          if (!currentTransaction) {
            this.logger.warn(
              'Transaction not found for re-categorization',
              {
                transactionId: transaction.id,
              },
            );
            return;
          }

          // Update category and mark as enrichment-based categorization
          currentTransaction.category = suggestedCategory;
          currentTransaction.suggestedCategory = null; // Clear suggestion since we're applying it
          currentTransaction.suggestedCategoryName = null;

          // Set confidence to indicate this came from enhanced merchant data
          // Use enhancedCategoryConfidence from reconciliation if available, otherwise calculate
          if (!currentTransaction.categorizationConfidence) {
            currentTransaction.categorizationConfidence =
              currentTransaction.enhancedCategoryConfidence ||
              TransactionEnrichedEventHandler.DEFAULT_ENRICHMENT_CONFIDENCE;
          }

          await this.transactionRepository.save(currentTransaction);

          this.logger.log(
            'Successfully re-categorized transaction after enrichment',
            {
              transactionId: transaction.id,
              previousCategoryId,
              newCategoryId: suggestedCategory.id,
              newCategoryName: suggestedCategory.name,
              enhancedMerchantName,
            },
          );
        } else {
          this.logger.debug(
            'Skipping re-categorization: suggested category same as current',
            {
              transactionId: transaction.id,
              categoryId: suggestedCategory.id,
            },
          );
        }
      } else {
        this.logger.debug(
          'No category suggestion found for enhanced merchant name',
          {
            transactionId: transaction.id,
            enhancedMerchantName,
          },
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to re-categorize transaction after enrichment',
        {
          error: error.message,
          stack: error.stack,
          transactionId: transaction.id,
          userId,
        },
      );
      // Don't re-throw - allow enrichment flow to complete
    }
  }

  /**
   * Check if two merchant names are too similar to warrant re-categorization
   *
   * @param enhanced Enhanced merchant name from payment activity
   * @param original Original merchant name from bank transaction
   * @returns true if names are similar enough to skip re-categorization
   */
  private isSimilarMerchantName(
    enhanced: string | null,
    original: string | null,
  ): boolean {
    if (!enhanced || !original) {
      return false;
    }

    const normalizedEnhanced = enhanced.toLowerCase().trim();
    const normalizedOriginal = original.toLowerCase().trim();

    // Exact match
    if (normalizedEnhanced === normalizedOriginal) {
      return true;
    }

    // One contains the other with high overlap (>80%)
    const shorterLength = Math.min(
      normalizedEnhanced.length,
      normalizedOriginal.length,
    );
    const longerLength = Math.max(
      normalizedEnhanced.length,
      normalizedOriginal.length,
    );

    if (
      normalizedEnhanced.includes(normalizedOriginal) ||
      normalizedOriginal.includes(normalizedEnhanced)
    ) {
      const overlapRatio = shorterLength / longerLength;
      if (
        overlapRatio >
        TransactionEnrichedEventHandler.SIMILARITY_THRESHOLD
      ) {
        return true;
      }
    }

    // Check if enhanced name is PRIMARILY a payment provider (not just contains it)
    // We should re-categorize if enhanced is "Starbucks" even if original is "PAYPAL *STARBUCKS"
    // We should SKIP only if enhanced is essentially just the provider name
    const genericProviders = [
      'paypal',
      'stripe',
      'square',
      'venmo',
      'zelle',
      'klarna',
      'apple pay',
      'google pay',
      'amazon pay',
    ];

    // Check if enhanced name is primarily a payment provider
    const enhancedIsGeneric = genericProviders.some((provider) => {
      // Enhanced is considered generic if it's just the provider name
      // or provider name with common suffixes like "payment", "transfer", etc.
      const enhancedWithoutProvider = normalizedEnhanced
        .replace(new RegExp(provider, 'gi'), '')
        .replace(/\s*(payment|transfer|transaction|charge|debit|credit)\s*/gi, '')
        .trim();
      return (
        normalizedEnhanced.includes(provider) &&
        enhancedWithoutProvider.length < 3
      );
    });

    // Only skip if the enhanced name is essentially just a payment provider
    // This allows "Starbucks" to re-categorize even when original is "PAYPAL *STARBUCKS"
    return enhancedIsGeneric;
  }
}
