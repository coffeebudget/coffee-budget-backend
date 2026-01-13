import { FrequencyType } from './frequency.interface';
import { ExpenseType } from './classification.interface';
import { DetectedPatternData } from './pattern.interface';

/**
 * Represents a category-level aggregation of detected patterns.
 * Used to consolidate multiple merchant-level patterns into a single
 * category suggestion with time-weighted averages.
 */
export interface CategoryAggregation {
  /** Category ID from the database */
  categoryId: number;

  /** Category name (e.g., "Groceries", "Stipendio") */
  categoryName: string;

  /** Sum of all transaction amounts in this category */
  totalAmount: number;

  /** Total number of transactions across all patterns */
  transactionCount: number;

  /** Earliest transaction date across all patterns */
  firstOccurrence: Date;

  /** Latest transaction date across all patterns */
  lastOccurrence: Date;

  /** Months between first and last occurrence */
  spanMonths: number;

  /** Time-weighted monthly average: totalAmount / spanMonths */
  weightedMonthlyAverage: number;

  /** Dominant frequency type from the patterns */
  frequencyType: FrequencyType;

  /** List of unique merchant names in this category */
  merchants: string[];

  /** Expense type from classification (from highest confidence or most common) */
  expenseType: ExpenseType;

  /** true if ANY pattern in the category is classified as essential */
  isEssential: boolean;

  /** Average confidence score across all patterns */
  averageConfidence: number;

  /** Original patterns for reference and metadata */
  sourcePatterns: DetectedPatternData[];

  /** Representative description from highest confidence pattern */
  representativeDescription: string;
}
