import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThanOrEqual, MoreThanOrEqual, Not } from 'typeorm';
import { Transaction } from './transaction.entity';
import { User } from '../users/user.entity';
import { TransactionCategorizationService } from './transaction-categorization.service';
import { MerchantCategorizationService } from '../merchant-categorization/merchant-categorization.service';
import { EnhancedTransactionData } from '../merchant-categorization/dto/merchant-categorization.dto';

export interface CategorizationTestResult {
  transactionId: number;
  description: string;
  merchantName: string | null;
  merchantCategoryCode: string | null;
  amount: number;
  currentCategory: string | null;
  suggestedCategory: string | null;
  confidence: number;
  categorizationSource: string;
  categorizationMethod: string;
  success: boolean;
  error?: string;
}

export interface CategorizationQualityReport {
  totalTransactions: number;
  successfulCategorizations: number;
  failedCategorizations: number;
  successRate: number;
  averageConfidence: number;
  results: CategorizationTestResult[];
  summary: {
    bySource: Record<string, number>;
    byMethod: Record<string, number>;
    byConfidenceRange: Record<string, number>;
  };
}

@Injectable()
export class TransactionCategorizationTestService {
  private readonly logger = new Logger(TransactionCategorizationTestService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    private transactionCategorizationService: TransactionCategorizationService,
    private merchantCategorizationService: MerchantCategorizationService,
  ) {}

  /**
   * Test categorization quality on uncategorized transactions from the last 90 days
   */
  async testCategorizationQuality(
    userId: number,
    dryRun: boolean = true
  ): Promise<CategorizationQualityReport> {
    this.logger.log(`Starting categorization quality test for user ${userId} (dryRun: ${dryRun})`);

    // Get uncategorized transactions from the last 90 days
    const uncategorizedTransactions = await this.getUncategorizedTransactions(userId);
    
    this.logger.log(`Found ${uncategorizedTransactions.length} uncategorized transactions`);

    const results: CategorizationTestResult[] = [];
    let successfulCategorizations = 0;
    let failedCategorizations = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;

    const summary = {
      bySource: {} as Record<string, number>,
      byMethod: {} as Record<string, number>,
      byConfidenceRange: {} as Record<string, number>,
    };

    for (const transaction of uncategorizedTransactions) {
      try {
        const result = await this.testTransactionCategorization(transaction, userId, dryRun);
        results.push(result);

        if (result.success) {
          successfulCategorizations++;
          totalConfidence += result.confidence;
          confidenceCount++;

          // Update summary statistics
          summary.bySource[result.categorizationSource] = (summary.bySource[result.categorizationSource] || 0) + 1;
          summary.byMethod[result.categorizationMethod] = (summary.byMethod[result.categorizationMethod] || 0) + 1;
          
          const confidenceRange = this.getConfidenceRange(result.confidence);
          summary.byConfidenceRange[confidenceRange] = (summary.byConfidenceRange[confidenceRange] || 0) + 1;
        } else {
          failedCategorizations++;
        }
      } catch (error) {
        this.logger.error(`Error testing transaction ${transaction.id}:`, error);
        results.push({
          transactionId: transaction.id,
          description: transaction.description,
          merchantName: transaction.merchantName,
          merchantCategoryCode: transaction.merchantCategoryCode,
          amount: transaction.amount,
          currentCategory: transaction.category?.name || null,
          suggestedCategory: null,
          confidence: 0,
          categorizationSource: 'error',
          categorizationMethod: 'error',
          success: false,
          error: error.message,
        });
        failedCategorizations++;
      }
    }

    const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
    const successRate = uncategorizedTransactions.length > 0 ? (successfulCategorizations / uncategorizedTransactions.length) * 100 : 0;

    const report: CategorizationQualityReport = {
      totalTransactions: uncategorizedTransactions.length,
      successfulCategorizations,
      failedCategorizations,
      successRate,
      averageConfidence,
      results,
      summary,
    };

    this.logger.log(`Categorization test completed. Success rate: ${successRate.toFixed(2)}%`);
    return report;
  }

  /**
   * Get uncategorized transactions from the last 90 days
   */
  private async getUncategorizedTransactions(userId: number): Promise<Transaction[]> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    return this.transactionRepository.find({
      where: {
        user: { id: userId },
        category: IsNull(),
        executionDate: MoreThanOrEqual(ninetyDaysAgo),
      },
      relations: ['category', 'bankAccount', 'creditCard'],
      order: { executionDate: 'DESC' },
    });
  }

  /**
   * Test categorization for a single transaction
   */
  private async testTransactionCategorization(
    transaction: Transaction,
    userId: number,
    dryRun: boolean
  ): Promise<CategorizationTestResult> {
    const result: CategorizationTestResult = {
      transactionId: transaction.id,
      description: transaction.description,
      merchantName: transaction.merchantName,
      merchantCategoryCode: transaction.merchantCategoryCode,
      amount: transaction.amount,
      currentCategory: transaction.category?.name || null,
      suggestedCategory: null,
      confidence: 0,
      categorizationSource: 'none',
      categorizationMethod: 'none',
      success: false,
    };

    try {
      // Test the categorization
      const categorizedTransaction = await this.transactionCategorizationService.categorizeTransactionByDescription(
        transaction,
        userId,
        { enableMerchantAI: true }
      );

      if (categorizedTransaction.category) {
        result.suggestedCategory = categorizedTransaction.category.name;
        result.confidence = categorizedTransaction.categorizationConfidence || 0;
        result.success = true;

        // Determine the source and method based on the categorization
        if (transaction.merchantName && categorizedTransaction.categorizationConfidence && categorizedTransaction.categorizationConfidence >= 70) {
          result.categorizationSource = 'ai';
          result.categorizationMethod = 'merchant_ai';
        } else {
          result.categorizationSource = 'keyword';
          result.categorizationMethod = 'keyword_match';
        }

        // If not a dry run, save the categorization
        if (!dryRun) {
          await this.transactionRepository.save(categorizedTransaction);
          this.logger.debug(`Categorized transaction ${transaction.id} with ${result.suggestedCategory} (${result.confidence}% confidence)`);
        }
      } else {
        result.success = false;
        result.error = 'No category suggested';
      }
    } catch (error) {
      result.success = false;
      result.error = error.message;
    }

    return result;
  }

  /**
   * Get confidence range for summary statistics
   */
  private getConfidenceRange(confidence: number): string {
    if (confidence >= 90) return '90-100%';
    if (confidence >= 80) return '80-89%';
    if (confidence >= 70) return '70-79%';
    if (confidence >= 60) return '60-69%';
    if (confidence >= 50) return '50-59%';
    return '0-49%';
  }

  /**
   * Test categorization specifically for GoCardless transactions
   */
  async testGoCardlessCategorization(
    userId: number,
    dryRun: boolean = true
  ): Promise<CategorizationQualityReport> {
    this.logger.log(`Testing GoCardless categorization for user ${userId} (dryRun: ${dryRun})`);

    // Get GoCardless transactions (those with merchant data) from the last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const goCardlessTransactions = await this.transactionRepository.find({
      where: {
        user: { id: userId },
        merchantName: Not(IsNull()), // Has merchant name
        executionDate: MoreThanOrEqual(ninetyDaysAgo),
      },
      relations: ['category', 'bankAccount', 'creditCard'],
      order: { executionDate: 'DESC' },
    });

    this.logger.log(`Found ${goCardlessTransactions.length} GoCardless transactions`);

    const results: CategorizationTestResult[] = [];
    let successfulCategorizations = 0;
    let failedCategorizations = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;

    const summary = {
      bySource: {} as Record<string, number>,
      byMethod: {} as Record<string, number>,
      byConfidenceRange: {} as Record<string, number>,
    };

    for (const transaction of goCardlessTransactions) {
      try {
        const result = await this.testTransactionCategorization(transaction, userId, dryRun);
        results.push(result);

        if (result.success) {
          successfulCategorizations++;
          totalConfidence += result.confidence;
          confidenceCount++;

          // Update summary statistics
          summary.bySource[result.categorizationSource] = (summary.bySource[result.categorizationSource] || 0) + 1;
          summary.byMethod[result.categorizationMethod] = (summary.byMethod[result.categorizationMethod] || 0) + 1;
          
          const confidenceRange = this.getConfidenceRange(result.confidence);
          summary.byConfidenceRange[confidenceRange] = (summary.byConfidenceRange[confidenceRange] || 0) + 1;
        } else {
          failedCategorizations++;
        }
      } catch (error) {
        this.logger.error(`Error testing GoCardless transaction ${transaction.id}:`, error);
        results.push({
          transactionId: transaction.id,
          description: transaction.description,
          merchantName: transaction.merchantName,
          merchantCategoryCode: transaction.merchantCategoryCode,
          amount: transaction.amount,
          currentCategory: transaction.category?.name || null,
          suggestedCategory: null,
          confidence: 0,
          categorizationSource: 'error',
          categorizationMethod: 'error',
          success: false,
          error: error.message,
        });
        failedCategorizations++;
      }
    }

    const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
    const successRate = goCardlessTransactions.length > 0 ? (successfulCategorizations / goCardlessTransactions.length) * 100 : 0;

    const report: CategorizationQualityReport = {
      totalTransactions: goCardlessTransactions.length,
      successfulCategorizations,
      failedCategorizations,
      successRate,
      averageConfidence,
      results,
      summary,
    };

    this.logger.log(`GoCardless categorization test completed. Success rate: ${successRate.toFixed(2)}%`);
    return report;
  }
}
