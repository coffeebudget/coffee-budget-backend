import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchantCategorization, CategoryHistory } from './entities';
import { CategorizationResult } from './dto/merchant-categorization.dto';
import { Category } from '../categories/entities/category.entity';
import { User } from '../users/user.entity';
import { OpenAIService } from '../ai/openai.service';
import {
  EnhancedTransactionData,
  CategorizationOptions,
  CategorizationSource,
  CategorizationMethod,
} from './dto/merchant-categorization.dto';

@Injectable()
export class MerchantCategorizationService {
  private readonly logger = new Logger(MerchantCategorizationService.name);
  private readonly memoryCache = new Map<string, CategorizationResult>();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MERCHANT_DB_THRESHOLD = 3; // Use merchant DB after 3 uses

  constructor(
    @InjectRepository(MerchantCategorization)
    private merchantRepo: Repository<MerchantCategorization>,
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    private openAIService: OpenAIService,
  ) {}

  /**
   * Main categorization method with two-layer caching
   */
  async categorizeByMerchant(
    transaction: EnhancedTransactionData,
    userId: number,
    options: CategorizationOptions = {},
  ): Promise<CategorizationResult | null> {
    const startTime = Date.now();

    // Early return if no merchant name
    if (!transaction.merchantName) {
      return null;
    }

    const cacheKey = this.buildCacheKey(transaction, userId);

    try {
      // Layer 1: Check memory cache first
      if (this.memoryCache.has(cacheKey)) {
        const result = this.memoryCache.get(cacheKey)!;
        result.source = CategorizationSource.CACHE;
        this.logger.debug(
          `Memory cache hit for merchant: ${transaction.merchantName}`,
        );
        return result;
      }

      // Layer 2: Check merchant database
      const merchantResult = await this.getFromMerchantDatabase(
        transaction,
        userId,
      );
      if (merchantResult) {
        this.memoryCache.set(cacheKey, merchantResult);
        this.logger.debug(
          `Merchant database hit for merchant: ${transaction.merchantName}`,
        );
        return merchantResult;
      }

      // No cache hit - call AI
      const aiResult = await this.callOpenAI(transaction, userId, options);
      if (aiResult) {
        // Store in caches
        await this.storeInMerchantDatabase(transaction, aiResult, userId);
        this.memoryCache.set(cacheKey, aiResult);
        this.logger.debug(
          `AI categorization completed for merchant: ${transaction.merchantName}`,
        );
        return aiResult;
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Error categorizing merchant ${transaction.merchantName}:`,
        error,
      );
      return null;
    } finally {
      const processingTime = Date.now() - startTime;
      this.logger.debug(`Categorization completed in ${processingTime}ms`);
    }
  }

  /**
   * Build cache key for merchant categorization
   */
  private buildCacheKey(
    transaction: EnhancedTransactionData,
    userId: number,
  ): string {
    if (!transaction.merchantName) {
      throw new Error('Merchant name is required for caching');
    }
    const merchantKey = this.normalizeMerchantName(transaction.merchantName);
    const mccKey = transaction.merchantCategoryCode || 'no-mcc';
    return `merchant:${userId}:${merchantKey}:${mccKey}`;
  }

  /**
   * Normalize merchant name for consistent caching
   */
  private normalizeMerchantName(merchantName: string): string {
    return merchantName
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  /**
   * Get categorization from merchant database
   */
  private async getFromMerchantDatabase(
    transaction: EnhancedTransactionData,
    userId: number,
  ): Promise<CategorizationResult | null> {
    if (!transaction.merchantName) return null;

    const merchant = await this.merchantRepo.findOne({
      where: {
        merchantName: this.normalizeMerchantName(transaction.merchantName),
        merchantCategoryCode: transaction.merchantCategoryCode,
        user: { id: userId },
      },
      relations: ['suggestedCategory'],
    });

    if (!merchant) return null;

    return {
      categoryId: merchant.suggestedCategory.id,
      categoryName: merchant.suggestedCategory.name,
      confidence: merchant.averageConfidence,
      source: CategorizationSource.MERCHANT_DB,
      method: CategorizationMethod.MERCHANT_AI,
      timestamp: new Date(),
    };
  }

  /**
   * Store categorization in merchant database
   */
  private async storeInMerchantDatabase(
    transaction: EnhancedTransactionData,
    result: CategorizationResult,
    userId: number,
  ): Promise<void> {
    if (!transaction.merchantName) return;

    const merchantName = this.normalizeMerchantName(transaction.merchantName);

    const existingMerchant = await this.merchantRepo.findOne({
      where: {
        merchantName,
        merchantCategoryCode: transaction.merchantCategoryCode,
        user: { id: userId },
      },
    });

    if (existingMerchant) {
      // Update existing merchant
      existingMerchant.usageCount += 1;
      existingMerchant.lastSeen = new Date();

      // Update average confidence
      const totalConfidence =
        existingMerchant.averageConfidence * (existingMerchant.usageCount - 1) +
        result.confidence;
      existingMerchant.averageConfidence =
        totalConfidence / existingMerchant.usageCount;

      // Add to history
      existingMerchant.categoryHistory = existingMerchant.categoryHistory || [];
      existingMerchant.categoryHistory.push({
        categoryId: result.categoryId,
        categoryName: result.categoryName,
        confidence: result.confidence,
        timestamp: new Date(),
        source: 'ai',
      });

      await this.merchantRepo.save(existingMerchant);
    } else {
      // Create new merchant entry
      const newMerchant = this.merchantRepo.create({
        merchantName,
        merchantCategoryCode: transaction.merchantCategoryCode,
        suggestedCategoryId: result.categoryId,
        averageConfidence: result.confidence,
        usageCount: 1,
        user: { id: userId },
        categoryHistory: [
          {
            categoryId: result.categoryId,
            categoryName: result.categoryName,
            confidence: result.confidence,
            timestamp: new Date(),
            source: 'ai',
          },
        ],
      });

      await this.merchantRepo.save(newMerchant);
    }
  }

  /**
   * Call OpenAI for categorization
   */
  private async callOpenAI(
    transaction: EnhancedTransactionData,
    userId: number,
    options: CategorizationOptions,
  ): Promise<CategorizationResult | null> {
    try {
      // Get available categories for the user
      const categories = await this.categoryRepo.find({
        where: { user: { id: userId } },
        select: ['id', 'name', 'keywords'],
      });

      if (categories.length === 0) {
        this.logger.warn(`No categories found for user ${userId}`);
        return null;
      }

      // Prepare OpenAI request
      const openAIRequest = {
        merchantName: transaction.merchantName!,
        merchantCategoryCode: transaction.merchantCategoryCode,
        description: transaction.description,
        amount: transaction.amount,
        transactionType: (transaction.merchantType === 'creditor'
          ? 'expense'
          : 'income') as 'expense' | 'income',
        availableCategories: categories.map((cat) => ({
          id: cat.id,
          name: cat.name,
          keywords: cat.keywords || [],
        })),
      };

      // Call OpenAI service
      const aiResponse =
        await this.openAIService.categorizeTransaction(openAIRequest);

      if (!aiResponse) {
        this.logger.debug(
          `OpenAI categorization failed for merchant: ${transaction.merchantName}`,
        );
        return null;
      }

      // Convert OpenAI response to CategorizationResult
      return {
        categoryId: aiResponse.categoryId,
        categoryName: aiResponse.categoryName,
        confidence: aiResponse.confidence,
        source: CategorizationSource.AI,
        method: CategorizationMethod.AI_CATEGORIZATION,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Error calling OpenAI for merchant ${transaction.merchantName}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Learn from user correction
   */
  async learnFromUserCorrection(
    merchantName: string,
    correctCategoryId: number,
    userId: number,
  ): Promise<void> {
    const merchant = await this.merchantRepo.findOne({
      where: {
        merchantName: this.normalizeMerchantName(merchantName),
        user: { id: userId },
      },
    });

    if (merchant) {
      // Update merchant with user correction
      merchant.suggestedCategoryId = correctCategoryId;
      merchant.categoryHistory = merchant.categoryHistory || [];
      merchant.categoryHistory.push({
        categoryId: correctCategoryId,
        categoryName: 'User Correction',
        confidence: 100,
        timestamp: new Date(),
        source: 'user_override',
      });

      await this.merchantRepo.save(merchant);

      // Invalidate caches
      await this.invalidateMerchantCache(merchantName, userId);
    }
  }

  /**
   * Invalidate merchant cache
   */
  async invalidateMerchantCache(
    merchantName: string,
    userId: number,
  ): Promise<void> {
    const normalizedName = this.normalizeMerchantName(merchantName);

    // Clear memory cache
    for (const [key, value] of this.memoryCache.entries()) {
      if (key.includes(normalizedName)) {
        this.memoryCache.delete(key);
      }
    }

    // Clear Redis cache (when implemented)
    // TODO: Implement Redis cache invalidation

    // Update merchant database
    await this.merchantRepo.update(
      { merchantName: normalizedName, user: { id: userId } },
      { lastSeen: new Date() },
    );
  }

  /**
   * Get merchant statistics
   */
  async getMerchantStats(userId: number): Promise<{
    totalMerchants: number;
    totalCategorizations: number;
    averageConfidence: number;
    topMerchants: Array<{
      merchantName: string;
      usageCount: number;
      averageConfidence: number;
    }>;
  }> {
    const merchants = await this.merchantRepo.find({
      where: { user: { id: userId } },
      order: { usageCount: 'DESC' },
    });

    const totalMerchants = merchants.length;
    const totalCategorizations = merchants.reduce(
      (sum, m) => sum + m.usageCount,
      0,
    );
    const averageConfidence =
      merchants.length > 0
        ? merchants.reduce((sum, m) => sum + m.averageConfidence, 0) /
          merchants.length
        : 0;

    const topMerchants = merchants.slice(0, 10).map((m) => ({
      merchantName: m.merchantName,
      usageCount: m.usageCount,
      averageConfidence: m.averageConfidence,
    }));

    return {
      totalMerchants,
      totalCategorizations,
      averageConfidence,
      topMerchants,
    };
  }
}
