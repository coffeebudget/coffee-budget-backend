import { FrequencyType } from './frequency.interface';

/**
 * Pattern classification request for OpenAI
 */
export interface PatternClassificationRequest {
  patternId: string;
  merchantName: string | null;
  categoryName: string | null;
  representativeDescription: string;
  averageAmount: number;
  frequencyType: FrequencyType;
  occurrenceCount: number;
}

/**
 * Pattern classification response from OpenAI
 */
export interface PatternClassificationResponse {
  patternId: string;
  expenseType: ExpenseType;
  isEssential: boolean;
  suggestedPlanName: string;
  monthlyContribution: number;
  confidence: number; // 0-100
  reasoning: string;
}

/**
 * Expense type classification
 */
export enum ExpenseType {
  SUBSCRIPTION = 'subscription', // Netflix, Spotify, etc.
  UTILITY = 'utility', // Electricity, water, gas
  INSURANCE = 'insurance', // Health, car, home
  MORTGAGE = 'mortgage', // Home loan payments
  RENT = 'rent', // Housing rent
  LOAN = 'loan', // Car loan, personal loan
  TAX = 'tax', // Property tax, income tax
  SALARY = 'salary', // Regular income
  INVESTMENT = 'investment', // Investment returns
  OTHER_FIXED = 'other_fixed', // Other fixed costs
  VARIABLE = 'variable', // Variable expenses
}

/**
 * Batch classification request for cost optimization
 */
export interface BatchClassificationRequest {
  patterns: PatternClassificationRequest[];
  userId: number;
}

/**
 * Batch classification response
 */
export interface BatchClassificationResponse {
  classifications: PatternClassificationResponse[];
  tokensUsed: number;
  estimatedCost: number;
  processingTimeMs: number;
}

/**
 * Classification cache entry
 */
export interface ClassificationCacheEntry {
  key: string;
  response: PatternClassificationResponse;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Configuration for pattern classification
 */
export interface PatternClassificationConfig {
  maxBatchSize: number; // Max patterns per API call (default: 10)
  cacheTtlMinutes: number; // Cache TTL in minutes (default: 60 * 24 = 1 day)
  maxDailyApiCalls: number; // Daily API call limit (default: 100)
  costPerToken: number; // Estimated cost per token (default: 0.000002)
  maxTokensPerRequest: number; // Max tokens per request (default: 2000)
}

export const DEFAULT_CLASSIFICATION_CONFIG: PatternClassificationConfig = {
  maxBatchSize: 10,
  cacheTtlMinutes: 60 * 24, // 1 day
  maxDailyApiCalls: 100,
  costPerToken: 0.000002, // GPT-3.5 turbo pricing
  maxTokensPerRequest: 2000,
};
