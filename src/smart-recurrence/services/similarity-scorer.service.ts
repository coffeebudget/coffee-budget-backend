import { Injectable } from '@nestjs/common';
import { LevenshteinDistance } from 'natural';
import { Transaction } from '../../transactions/transaction.entity';
import {
  SimilarityScore,
  SimilarityWeights,
  DEFAULT_SIMILARITY_WEIGHTS,
} from '../interfaces/similarity.interface';

@Injectable()
export class SimilarityScorerService {
  /**
   * Calculate similarity score between two transactions using multi-criteria matching
   * @param t1 First transaction
   * @param t2 Second transaction
   * @param weights Optional custom weights for scoring criteria
   * @returns SimilarityScore with breakdown and weighted total
   */
  calculateSimilarity(
    t1: Transaction,
    t2: Transaction,
    weights: SimilarityWeights = DEFAULT_SIMILARITY_WEIGHTS,
  ): SimilarityScore {
    const categoryMatch = this.calculateCategoryMatch(t1, t2);
    const merchantMatch = this.calculateMerchantMatch(t1, t2);
    const descriptionMatch = this.calculateDescriptionMatch(t1, t2);
    const amountSimilarity = this.calculateAmountSimilarity(t1, t2);

    const total =
      categoryMatch * weights.category +
      merchantMatch * weights.merchant +
      descriptionMatch * weights.description +
      amountSimilarity * weights.amount;

    return {
      categoryMatch,
      merchantMatch,
      descriptionMatch,
      amountSimilarity,
      total: Math.round(total * 100) / 100, // Round to 2 decimals
    };
  }

  /**
   * Check if two transactions belong to the same category
   * @returns 100 if same category, 0 otherwise
   */
  private calculateCategoryMatch(t1: Transaction, t2: Transaction): number {
    if (!t1.category || !t2.category) return 0;
    return t1.category.id === t2.category.id ? 100 : 0;
  }

  /**
   * Calculate similarity between merchant names using Levenshtein distance
   * Handles null/undefined merchant names gracefully
   * @returns Similarity score 0-100
   */
  private calculateMerchantMatch(t1: Transaction, t2: Transaction): number {
    const merchant1 = this.normalizeMerchantName(t1.merchantName);
    const merchant2 = this.normalizeMerchantName(t2.merchantName);

    if (!merchant1 || !merchant2) return 0;
    if (merchant1 === merchant2) return 100;

    return this.calculateTextSimilarity(merchant1, merchant2);
  }

  /**
   * Calculate similarity between transaction descriptions using Levenshtein distance
   * @returns Similarity score 0-100
   */
  private calculateDescriptionMatch(t1: Transaction, t2: Transaction): number {
    const desc1 = this.normalizeDescription(t1.description);
    const desc2 = this.normalizeDescription(t2.description);

    if (!desc1 || !desc2) return 0;
    if (desc1 === desc2) return 100;

    return this.calculateTextSimilarity(desc1, desc2);
  }

  /**
   * Calculate amount similarity with flexible tolerance
   * Lower weight (10%) allows for variations like "salary + bonus"
   * @returns Similarity score 0-100
   */
  private calculateAmountSimilarity(t1: Transaction, t2: Transaction): number {
    const amount1 = Math.abs(Number(t1.amount));
    const amount2 = Math.abs(Number(t2.amount));

    if (amount1 === 0 || amount2 === 0) return 0;

    const maxAmount = Math.max(amount1, amount2);
    const difference = Math.abs(amount1 - amount2);
    const percentageDifference = (difference / maxAmount) * 100;

    // Inverse percentage: 0% diff = 100 score, 100% diff = 0 score
    return Math.max(0, 100 - percentageDifference);
  }

  /**
   * Normalize merchant name for consistent comparison
   * - Lowercase
   * - Remove extra whitespace
   * - Remove special characters
   */
  private normalizeMerchantName(merchantName: string | null): string | null {
    if (!merchantName) return null;

    return merchantName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '') // Remove special chars
      .replace(/\s+/g, ' '); // Collapse whitespace
  }

  /**
   * Normalize description for consistent comparison
   * - Lowercase
   * - Remove extra whitespace
   */
  private normalizeDescription(description: string | null): string | null {
    if (!description) return null;

    return description
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' '); // Collapse whitespace
  }

  /**
   * Calculate text similarity using Levenshtein distance
   * Normalized to 0-100 score based on string length
   * @param text1 First text (normalized)
   * @param text2 Second text (normalized)
   * @returns Similarity score 0-100
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const distance = LevenshteinDistance(text1, text2);
    const maxLength = Math.max(text1.length, text2.length);

    if (maxLength === 0) return 100; // Both empty strings

    // Convert distance to similarity percentage
    const similarity = ((maxLength - distance) / maxLength) * 100;
    return Math.max(0, Math.min(100, similarity)); // Clamp 0-100
  }

  /**
   * Calculate average similarity score for a transaction against a group
   * Useful for determining if a transaction fits an existing pattern
   * @param transaction Transaction to score
   * @param group Array of transactions in the group
   * @param weights Optional custom weights
   * @returns Average similarity score 0-100
   */
  calculateGroupSimilarity(
    transaction: Transaction,
    group: Transaction[],
    weights: SimilarityWeights = DEFAULT_SIMILARITY_WEIGHTS,
  ): number {
    if (group.length === 0) return 0;

    const scores = group.map((t) =>
      this.calculateSimilarity(transaction, t, weights).total,
    );

    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    return Math.round(average * 100) / 100; // Round to 2 decimals
  }
}
