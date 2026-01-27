import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PatternDetectionService } from './pattern-detection.service';
import { PatternClassificationService } from './pattern-classification.service';
import {
  CategoryFallbackSuggestionService,
  CategoryFallbackSuggestion,
} from './category-fallback-suggestion.service';
import {
  ExpensePlanSuggestion,
  SuggestionStatus,
  SuggestionSource,
} from '../entities/expense-plan-suggestion.entity';
import {
  ExpensePlan,
  ExpensePlanPurpose,
} from '../../expense-plans/entities/expense-plan.entity';
import { ExpensePlanAdjustmentService } from '../../expense-plans/expense-plan-adjustment.service';
import { Category } from '../../categories/entities/category.entity';
import {
  PatternDetectionCriteria,
  DetectedPatternData,
} from '../interfaces/pattern.interface';
import {
  PatternClassificationRequest,
  PatternClassificationResponse,
  ExpenseType,
} from '../interfaces/classification.interface';
import { FrequencyType } from '../interfaces/frequency.interface';
import { CategoryAggregation } from '../interfaces/category-aggregation.interface';
import {
  GenerateSuggestionsDto,
  GenerateSuggestionsResponseDto,
  SuggestionResponseDto,
  SuggestionListResponseDto,
  ApproveSuggestionDto,
  ApprovalResultDto,
  RejectSuggestionDto,
  BulkActionResultDto,
} from '../dto/suggestion.dto';

@Injectable()
export class SuggestionGeneratorService {
  private readonly logger = new Logger(SuggestionGeneratorService.name);

  constructor(
    @InjectRepository(ExpensePlanSuggestion)
    private readonly suggestionRepository: Repository<ExpensePlanSuggestion>,
    @InjectRepository(ExpensePlan)
    private readonly expensePlanRepository: Repository<ExpensePlan>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly patternDetection: PatternDetectionService,
    private readonly patternClassification: PatternClassificationService,
    private readonly expensePlanAdjustmentService: ExpensePlanAdjustmentService,
    private readonly categoryFallbackService: CategoryFallbackSuggestionService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // CATEGORY AGGREGATION METHODS (v2)
  // ─────────────────────────────────────────────────────────────

  /**
   * Calculate time-weighted monthly average
   * Formula: totalAmount / spanMonths
   */
  private calculateWeightedMonthlyAverage(
    totalAmount: number,
    firstOccurrence: Date,
    lastOccurrence: Date,
  ): number {
    const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000; // Average days per month
    const spanMs = lastOccurrence.getTime() - firstOccurrence.getTime();
    const spanMonths = Math.max(1, spanMs / MS_PER_MONTH);
    return Math.round((totalAmount / spanMonths) * 100) / 100;
  }

  /**
   * Aggregate patterns by category for unified suggestions
   * Combines multiple merchants into single category-level suggestions
   */
  private aggregateByCategory(
    patterns: DetectedPatternData[],
    classifications: Map<string, PatternClassificationResponse>,
  ): CategoryAggregation[] {
    // Group patterns by categoryId
    const categoryMap = new Map<number, DetectedPatternData[]>();

    for (const pattern of patterns) {
      if (pattern.group.categoryId === null) continue;

      const existing = categoryMap.get(pattern.group.categoryId) || [];
      existing.push(pattern);
      categoryMap.set(pattern.group.categoryId, existing);
    }

    // Aggregate each category
    const aggregations: CategoryAggregation[] = [];

    for (const [categoryId, categoryPatterns] of categoryMap) {
      // Collect all transactions across patterns
      const allTransactions = categoryPatterns.flatMap(
        (p) => p.group.transactions,
      );
      const totalAmount = allTransactions.reduce(
        (sum, t) => sum + Math.abs(Number(t.amount)),
        0,
      );

      // Find date range
      const firstOccurrence = new Date(
        Math.min(...categoryPatterns.map((p) => p.firstOccurrence.getTime())),
      );
      const lastOccurrence = new Date(
        Math.max(...categoryPatterns.map((p) => p.lastOccurrence.getTime())),
      );

      // Calculate span in months
      const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;
      const spanMs = lastOccurrence.getTime() - firstOccurrence.getTime();
      const spanMonths = Math.max(1, spanMs / MS_PER_MONTH);

      // Weighted monthly average
      const weightedMonthlyAverage = this.calculateWeightedMonthlyAverage(
        totalAmount,
        firstOccurrence,
        lastOccurrence,
      );

      // Collect unique merchants
      const merchants = [
        ...new Set(
          categoryPatterns
            .map((p) => p.group.merchantName)
            .filter((m): m is string => m !== null),
        ),
      ];

      // Find highest confidence pattern for representative data
      const highestConfPattern = categoryPatterns.reduce((best, p) =>
        p.confidence.overall > best.confidence.overall ? p : best,
      );

      // Get classifications and determine expense type
      const classificationsList = categoryPatterns
        .map((p) => classifications.get(p.group.id))
        .filter((c): c is PatternClassificationResponse => c !== undefined);

      // Use most common expense type, or from highest confidence
      const expenseType =
        classificationsList.length > 0
          ? classificationsList[0].expenseType
          : ExpenseType.OTHER_FIXED;

      // isEssential if ANY pattern is essential
      const isEssential = classificationsList.some((c) => c.isEssential);

      // Average confidence
      const averageConfidence = Math.round(
        categoryPatterns.reduce((sum, p) => sum + p.confidence.overall, 0) /
          categoryPatterns.length,
      );

      aggregations.push({
        categoryId,
        categoryName: highestConfPattern.group.categoryName || 'Unknown',
        totalAmount,
        transactionCount: allTransactions.length,
        firstOccurrence,
        lastOccurrence,
        spanMonths: Math.round(spanMonths * 100) / 100,
        weightedMonthlyAverage,
        frequencyType: highestConfPattern.frequency.type,
        merchants,
        expenseType,
        isEssential,
        averageConfidence,
        sourcePatterns: categoryPatterns,
        representativeDescription:
          highestConfPattern.group.representativeDescription,
      });
    }

    // Sort by weighted monthly average (highest first)
    return aggregations.sort(
      (a, b) => b.weightedMonthlyAverage - a.weightedMonthlyAverage,
    );
  }

  /**
   * Determine suggested purpose based on expense type
   * Sinking Fund: Predictable, fixed expenses (subscription, utility, insurance, etc.)
   * Spending Budget: Variable category spending (groceries, entertainment, etc.)
   */
  private determineSuggestedPurpose(
    expenseType: ExpenseType,
  ): ExpensePlanPurpose {
    const sinkingFundTypes = [
      ExpenseType.SUBSCRIPTION,
      ExpenseType.UTILITY,
      ExpenseType.INSURANCE,
      ExpenseType.MORTGAGE,
      ExpenseType.RENT,
      ExpenseType.LOAN,
      ExpenseType.TAX,
    ];

    if (sinkingFundTypes.includes(expenseType)) {
      return 'sinking_fund';
    }

    return 'spending_budget';
  }

  /**
   * Create ExpensePlanSuggestion entities from category aggregations
   * These are pattern-based suggestions (suggestionSource: 'pattern')
   */
  private createSuggestionsFromAggregations(
    userId: number,
    aggregations: CategoryAggregation[],
  ): ExpensePlanSuggestion[] {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    return aggregations.map((agg) => {
      const suggestion = new ExpensePlanSuggestion();

      suggestion.userId = userId;
      suggestion.suggestedName = agg.categoryName.substring(0, 100);
      suggestion.description =
        agg.merchants.length > 0
          ? `Aggregated from ${agg.merchants.length} merchant(s): ${agg.merchants.slice(0, 3).join(', ')}${agg.merchants.length > 3 ? '...' : ''}`
          : 'Aggregated category expense';
      suggestion.merchantName = agg.merchants[0]?.substring(0, 255) || null;
      suggestion.representativeDescription = agg.representativeDescription;
      suggestion.categoryId = agg.categoryId;
      suggestion.categoryName = agg.categoryName.substring(0, 100);
      suggestion.averageAmount =
        Math.round((agg.totalAmount / agg.transactionCount) * 100) / 100;
      suggestion.monthlyContribution = agg.weightedMonthlyAverage;
      suggestion.yearlyTotal =
        Math.round(agg.weightedMonthlyAverage * 12 * 100) / 100;
      suggestion.expenseType = agg.expenseType;
      suggestion.isEssential = agg.isEssential;
      suggestion.frequencyType = agg.frequencyType;
      suggestion.intervalDays =
        agg.sourcePatterns[0]?.frequency.intervalDays || 30;
      suggestion.suggestedPurpose = this.determineSuggestedPurpose(
        agg.expenseType,
      );

      // v3: Set suggestion source as pattern
      suggestion.suggestionSource = 'pattern';
      // Discrepancy fields will be populated later in enrichWithDiscrepancyData()
      suggestion.categoryMonthlyAverage = null;
      suggestion.discrepancyPercentage = null;
      suggestion.hasDiscrepancyWarning = false;

      suggestion.patternConfidence = agg.averageConfidence;
      suggestion.classificationConfidence = agg.averageConfidence;
      suggestion.overallConfidence = agg.averageConfidence;
      suggestion.classificationReasoning = `Category aggregation of ${agg.sourcePatterns.length} pattern(s)`;
      suggestion.occurrenceCount = agg.transactionCount;
      suggestion.firstOccurrence = agg.firstOccurrence;
      suggestion.lastOccurrence = agg.lastOccurrence;
      suggestion.nextExpectedDate =
        agg.sourcePatterns[0]?.nextExpectedDate || new Date();
      suggestion.status = 'pending';
      suggestion.expiresAt = expiresAt;
      suggestion.metadata = {
        patternId: `category-${agg.categoryId}`,
        transactionIds: agg.sourcePatterns.flatMap((p) =>
          p.group.transactions.map((t) => t.id),
        ),
        amountRange: {
          min: Math.min(
            ...agg.sourcePatterns.flatMap((p) =>
              p.group.transactions.map((t) => Math.abs(Number(t.amount))),
            ),
          ),
          max: Math.max(
            ...agg.sourcePatterns.flatMap((p) =>
              p.group.transactions.map((t) => Math.abs(Number(t.amount))),
            ),
          ),
        },
        sourceVersion: '3.0',
        merchants: agg.merchants,
        spanMonths: agg.spanMonths,
        aggregatedPatternCount: agg.sourcePatterns.length,
      };

      return suggestion;
    });
  }

  /**
   * Create ExpensePlanSuggestion entities from category fallbacks
   * These are category average-based suggestions (suggestionSource: 'category_average')
   */
  private createSuggestionsFromFallbacks(
    userId: number,
    fallbacks: CategoryFallbackSuggestion[],
  ): ExpensePlanSuggestion[] {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    return fallbacks.map((fb) => {
      const suggestion = new ExpensePlanSuggestion();

      suggestion.userId = userId;
      suggestion.suggestedName = fb.categoryName.substring(0, 100);
      suggestion.description = `Based on monthly average spending (€${fb.monthlyAverage.toFixed(2)}/month from ${fb.transactionCount} transactions)`;
      suggestion.merchantName = null;
      suggestion.representativeDescription = `Average spending in ${fb.categoryName}`;
      suggestion.categoryId = fb.categoryId;
      suggestion.categoryName = fb.categoryName.substring(0, 100);
      suggestion.averageAmount =
        Math.round((fb.totalSpent / fb.transactionCount) * 100) / 100;
      suggestion.monthlyContribution = fb.monthlyAverage;
      suggestion.yearlyTotal = Math.round(fb.monthlyAverage * 12 * 100) / 100;
      // Default to VARIABLE for fallback suggestions (variable spending)
      suggestion.expenseType = ExpenseType.VARIABLE;
      suggestion.isEssential = false;
      suggestion.frequencyType = FrequencyType.MONTHLY;
      suggestion.intervalDays = 30;
      suggestion.suggestedPurpose = 'spending_budget';

      // v3: Set suggestion source as category_average
      suggestion.suggestionSource = 'category_average';
      suggestion.categoryMonthlyAverage = fb.monthlyAverage;
      suggestion.discrepancyPercentage = null;
      suggestion.hasDiscrepancyWarning = false;

      // Lower confidence for fallback suggestions (no pattern detected)
      suggestion.patternConfidence = 50;
      suggestion.classificationConfidence = 50;
      suggestion.overallConfidence = 50;
      suggestion.classificationReasoning =
        'Based on category average (no recurring pattern detected)';
      suggestion.occurrenceCount = fb.transactionCount;
      suggestion.firstOccurrence = fb.firstOccurrence;
      suggestion.lastOccurrence = fb.lastOccurrence;
      suggestion.nextExpectedDate = new Date(); // No specific date for variable spending
      suggestion.status = 'pending';
      suggestion.expiresAt = expiresAt;
      suggestion.metadata = {
        patternId: `fallback-${fb.categoryId}`,
        sourceVersion: '3.0',
      };

      return suggestion;
    });
  }

  /**
   * Enrich pattern-based suggestions with discrepancy data
   * Compares pattern amount against category monthly average
   */
  private async enrichWithDiscrepancyData(
    userId: number,
    suggestions: ExpensePlanSuggestion[],
  ): Promise<void> {
    for (const suggestion of suggestions) {
      // Only check discrepancy for pattern-based suggestions with a category
      if (suggestion.suggestionSource !== 'pattern' || !suggestion.categoryId) {
        continue;
      }

      try {
        const discrepancy =
          await this.categoryFallbackService.checkPatternDiscrepancy(
            Number(suggestion.monthlyContribution),
            suggestion.categoryId,
            userId,
          );

        suggestion.categoryMonthlyAverage = discrepancy.categoryAverage ?? null;
        suggestion.discrepancyPercentage =
          discrepancy.discrepancyPercentage ?? null;
        suggestion.hasDiscrepancyWarning = discrepancy.hasDiscrepancy;

        if (discrepancy.hasDiscrepancy && discrepancy.message) {
          // Append discrepancy warning to reasoning
          suggestion.classificationReasoning = `${suggestion.classificationReasoning}. ⚠️ ${discrepancy.message}`;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to check discrepancy for category ${suggestion.categoryId}: ${error.message}`,
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC API METHODS
  // ─────────────────────────────────────────────────────────────

  /**
   * Clear all pending suggestions for a user
   * Called before regenerating to ensure fresh results
   * Preserves approved and rejected suggestions for audit trail
   */
  async clearPendingSuggestions(userId: number): Promise<number> {
    const result = await this.suggestionRepository.delete({
      userId,
      status: 'pending' as const,
    });
    const cleared = result.affected || 0;
    if (cleared > 0) {
      this.logger.log(
        `Cleared ${cleared} pending suggestions for user ${userId}`,
      );
    }
    return cleared;
  }

  /**
   * Delete a specific suggestion by ID
   * Useful for cleaning up approved suggestions after expense plan deletion
   */
  async deleteSuggestion(
    userId: number,
    suggestionId: number,
  ): Promise<boolean> {
    const result = await this.suggestionRepository.delete({
      id: suggestionId,
      userId,
    });
    const deleted = (result.affected || 0) > 0;
    if (deleted) {
      this.logger.log(`Deleted suggestion ${suggestionId} for user ${userId}`);
    }
    return deleted;
  }

  /**
   * Reset suggestion to pending when linked expense plan is deleted
   * This allows users to re-approve the suggestion if they want to recreate the plan
   */
  async resetSuggestionForDeletedExpensePlan(
    userId: number,
    expensePlanId: number,
  ): Promise<boolean> {
    const result = await this.suggestionRepository.update(
      {
        userId,
        approvedExpensePlanId: expensePlanId,
      },
      {
        status: 'pending' as const,
        approvedExpensePlanId: null,
        reviewedAt: null,
      },
    );
    const reset = (result.affected || 0) > 0;
    if (reset) {
      this.logger.log(
        `Reset suggestion linked to expense plan ${expensePlanId} back to pending`,
      );
    }
    return reset;
  }

  /**
   * Generate expense plan suggestions for a user
   * Orchestrates pattern detection and AI classification
   */
  async generateSuggestions(
    userId: number,
    options: GenerateSuggestionsDto = {},
  ): Promise<GenerateSuggestionsResponseDto> {
    const startTime = Date.now();

    this.logger.log(`Generating suggestions for user ${userId}`);

    // Clear existing pending suggestions before regenerating
    // This ensures users get fresh results without accumulation
    const clearedCount = await this.clearPendingSuggestions(userId);

    // Check for recent suggestions if not forcing regeneration
    // Note: After clearing, this will return empty, so regeneration proceeds
    if (!options.forceRegenerate) {
      const recentSuggestions = await this.getRecentPendingSuggestions(userId);
      if (recentSuggestions.length > 0) {
        this.logger.log(
          `Found ${recentSuggestions.length} recent pending suggestions`,
        );
        return this.buildResponse(
          recentSuggestions,
          0,
          startTime,
          clearedCount,
        );
      }
    }

    // Step 1: Detect patterns in transaction history
    const criteria: PatternDetectionCriteria = {
      userId,
      monthsToAnalyze: options.monthsToAnalyze ?? 12,
      minOccurrences: options.minOccurrences ?? 2,
      minConfidence: options.minConfidence ?? 60,
      similarityThreshold: options.similarityThreshold ?? 60,
    };

    const patterns = await this.patternDetection.detectPatterns(criteria);

    this.logger.log(`Detected ${patterns.length} patterns`);

    // Step 1.5: Load categories with useMonthlyAverageOnly flag
    // These categories should skip pattern detection and use fallback instead
    const skipCategoryIds =
      await this.getCategoriesWithMonthlyAverageFlag(userId);

    // Filter patterns: exclude those belonging to skip categories
    const patternsToProcess = patterns.filter(
      (p) => !p.group.categoryId || !skipCategoryIds.has(p.group.categoryId),
    );

    // Track which categories were skipped from patterns (for fallback inclusion)
    const skippedFromPatterns = new Set<number>(
      patterns
        .filter(
          (p) => p.group.categoryId && skipCategoryIds.has(p.group.categoryId),
        )
        .map((p) => p.group.categoryId as number),
    );

    if (skipCategoryIds.size > 0) {
      this.logger.log(
        `Skipping pattern detection for ${skipCategoryIds.size} categories with useMonthlyAverageOnly flag ` +
          `(${patterns.length - patternsToProcess.length} patterns excluded)`,
      );
    }

    // v3: Generate fallback suggestions first (runs in parallel conceptually)
    const fallbackSuggestions =
      await this.categoryFallbackService.generateFallbackSuggestions(userId);

    this.logger.log(
      `Generated ${fallbackSuggestions.length} fallback candidates`,
    );

    let patternSuggestions: ExpensePlanSuggestion[] = [];
    let patternCategoryIds = new Set<number>();

    if (patternsToProcess.length > 0) {
      // Step 2: Classify patterns using AI (only non-skipped patterns)
      const classificationRequests: PatternClassificationRequest[] =
        patternsToProcess.map((pattern) => ({
          patternId: pattern.group.id,
          merchantName: pattern.group.merchantName,
          categoryName: pattern.group.categoryName,
          representativeDescription: pattern.group.representativeDescription,
          averageAmount: pattern.group.averageAmount,
          frequencyType: pattern.frequency.type,
          occurrenceCount: pattern.frequency.occurrenceCount,
        }));

      const classificationResult =
        await this.patternClassification.classifyPatterns({
          patterns: classificationRequests,
          userId,
        });

      this.logger.log(
        `Classified ${classificationResult.classifications.length} patterns, ` +
          `${classificationResult.tokensUsed} tokens used`,
      );

      // Step 3: Aggregate patterns by category (v2)
      const classificationMap = new Map(
        classificationResult.classifications.map((c) => [c.patternId, c]),
      );
      const categoryAggregations = this.aggregateByCategory(
        patternsToProcess,
        classificationMap,
      );

      this.logger.log(
        `Aggregated into ${categoryAggregations.length} category-level suggestions`,
      );

      // Step 4: Create suggestions from aggregations
      patternSuggestions = this.createSuggestionsFromAggregations(
        userId,
        categoryAggregations,
      );

      // Track which categories are covered by patterns
      patternCategoryIds = new Set(
        categoryAggregations.map((agg) => agg.categoryId),
      );

      // Step 4.5 (v3): Enrich pattern suggestions with discrepancy data
      await this.enrichWithDiscrepancyData(userId, patternSuggestions);
    }

    // Step 5 (v3): Filter fallbacks to include:
    // - Categories NOT covered by patterns
    // - Categories with useMonthlyAverageOnly flag (even if they had patterns, those were skipped)
    const filteredFallbacks = fallbackSuggestions.filter(
      (fb) =>
        !patternCategoryIds.has(fb.categoryId) ||
        skippedFromPatterns.has(fb.categoryId),
    );

    this.logger.log(
      `${filteredFallbacks.length} fallback suggestions after filtering ` +
        `(${fallbackSuggestions.length - filteredFallbacks.length} already covered by patterns, ` +
        `${skippedFromPatterns.size} included via useMonthlyAverageOnly)`,
    );

    // Create fallback suggestion entities
    const fallbackEntities = this.createSuggestionsFromFallbacks(
      userId,
      filteredFallbacks,
    );

    // Step 6: Combine pattern + fallback suggestions
    const allSuggestions = [...patternSuggestions, ...fallbackEntities];

    this.logger.log(
      `Total suggestions: ${allSuggestions.length} ` +
        `(${patternSuggestions.length} pattern-based, ${fallbackEntities.length} fallback)`,
    );

    // Step 7: Filter out duplicates (existing approved plans)
    const filteredSuggestions = await this.filterExistingSuggestions(
      userId,
      allSuggestions,
    );

    this.logger.log(
      `Created ${filteredSuggestions.length} new suggestions ` +
        `(${allSuggestions.length - filteredSuggestions.length} duplicates filtered)`,
    );

    // Step 8: Save suggestions to database
    const savedSuggestions =
      await this.suggestionRepository.save(filteredSuggestions);

    // Step 9: Review existing expense plans for adjustment suggestions
    // This detects when actual spending deviates from plan contributions
    try {
      const adjustmentReview =
        await this.expensePlanAdjustmentService.reviewAllPlansForUser(userId);
      this.logger.log(
        `Adjustment review: ${adjustmentReview.plansReviewed} plans reviewed, ` +
          `${adjustmentReview.newSuggestions} new suggestions`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to review expense plan adjustments: ${error.message}`,
      );
    }

    // Get all pending suggestions for response
    const allPending = await this.getPendingSuggestions(userId);

    return this.buildResponse(
      allPending,
      savedSuggestions.length,
      startTime,
      clearedCount,
    );
  }

  /**
   * Get all suggestions for a user
   */
  async getSuggestions(
    userId: number,
    status?: SuggestionStatus,
  ): Promise<SuggestionListResponseDto> {
    const queryBuilder = this.suggestionRepository
      .createQueryBuilder('suggestion')
      .leftJoinAndSelect('suggestion.category', 'category')
      .where('suggestion.userId = :userId', { userId })
      .orderBy('suggestion.overallConfidence', 'DESC')
      .addOrderBy('suggestion.createdAt', 'DESC');

    if (status) {
      queryBuilder.andWhere('suggestion.status = :status', { status });
    }

    const suggestions = await queryBuilder.getMany();

    // Count by status
    const counts = await this.suggestionRepository
      .createQueryBuilder('suggestion')
      .select('suggestion.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('suggestion.userId = :userId', { userId })
      .groupBy('suggestion.status')
      .getRawMany();

    const statusCounts = counts.reduce(
      (acc, { status, count }) => {
        acc[status] = parseInt(count, 10);
        return acc;
      },
      { pending: 0, approved: 0, rejected: 0, expired: 0 } as Record<
        string,
        number
      >,
    );

    return {
      suggestions: suggestions.map((s) => this.toResponseDto(s)),
      total: suggestions.length,
      pending: statusCounts.pending,
      approved: statusCounts.approved,
      rejected: statusCounts.rejected,
    };
  }

  /**
   * Get a single suggestion by ID
   */
  async getSuggestionById(
    userId: number,
    suggestionId: number,
  ): Promise<SuggestionResponseDto | null> {
    const suggestion = await this.suggestionRepository.findOne({
      where: { id: suggestionId, userId },
      relations: ['category'],
    });

    return suggestion ? this.toResponseDto(suggestion) : null;
  }

  /**
   * Get pending suggestions for a user
   */
  async getPendingSuggestions(
    userId: number,
  ): Promise<ExpensePlanSuggestion[]> {
    return this.suggestionRepository.find({
      where: { userId, status: 'pending' },
      relations: ['category'],
      order: { overallConfidence: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Approve a suggestion and create an expense plan
   */
  async approveSuggestion(
    userId: number,
    suggestionId: number,
    options: ApproveSuggestionDto = {},
  ): Promise<ApprovalResultDto> {
    const suggestion = await this.suggestionRepository.findOne({
      where: { id: suggestionId, userId, status: 'pending' },
    });

    if (!suggestion) {
      return {
        success: false,
        suggestionId,
        message: 'Suggestion not found or already processed',
      };
    }

    try {
      // Create expense plan from suggestion
      const expensePlan = this.expensePlanRepository.create({
        userId,
        name: options.customName || suggestion.suggestedName,
        description: suggestion.description,
        planType: this.mapExpenseTypeToPlanType(suggestion.expenseType),
        priority: suggestion.isEssential ? 'essential' : 'discretionary',
        categoryId: options.categoryId ?? suggestion.categoryId,
        purpose: suggestion.suggestedPurpose || 'sinking_fund',
        targetAmount: suggestion.yearlyTotal,
        monthlyContribution:
          options.customMonthlyContribution ?? suggestion.monthlyContribution,
        contributionSource: 'calculated',
        frequency: this.mapFrequencyTypeToPlanFrequency(
          suggestion.frequencyType,
        ),
        nextDueDate: suggestion.nextExpectedDate,
        status: 'active',
        autoCalculate: true,
        rolloverSurplus: true,
        autoTrackCategory: suggestion.suggestedPurpose === 'spending_budget',
      });

      const savedPlan = await this.expensePlanRepository.save(expensePlan);

      // Update suggestion status
      suggestion.status = 'approved';
      suggestion.approvedExpensePlanId = savedPlan.id;
      suggestion.reviewedAt = new Date();
      await this.suggestionRepository.save(suggestion);

      this.logger.log(
        `Approved suggestion ${suggestionId}, created expense plan ${savedPlan.id}`,
      );

      return {
        success: true,
        suggestionId,
        expensePlanId: savedPlan.id,
        message: 'Expense plan created successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to approve suggestion ${suggestionId}:`, error);
      return {
        success: false,
        suggestionId,
        message: `Failed to create expense plan: ${error.message}`,
      };
    }
  }

  /**
   * Reject a suggestion
   */
  async rejectSuggestion(
    userId: number,
    suggestionId: number,
    options: RejectSuggestionDto = {},
  ): Promise<ApprovalResultDto> {
    const suggestion = await this.suggestionRepository.findOne({
      where: { id: suggestionId, userId, status: 'pending' },
    });

    if (!suggestion) {
      return {
        success: false,
        suggestionId,
        message: 'Suggestion not found or already processed',
      };
    }

    suggestion.status = 'rejected';
    suggestion.rejectionReason = options.reason || null;
    suggestion.reviewedAt = new Date();
    await this.suggestionRepository.save(suggestion);

    this.logger.log(`Rejected suggestion ${suggestionId}`);

    return {
      success: true,
      suggestionId,
      message: 'Suggestion rejected',
    };
  }

  /**
   * Bulk approve suggestions
   */
  async bulkApprove(
    userId: number,
    suggestionIds: number[],
  ): Promise<BulkActionResultDto> {
    const results: ApprovalResultDto[] = [];

    for (const id of suggestionIds) {
      const result = await this.approveSuggestion(userId, id);
      results.push(result);
    }

    return {
      processed: suggestionIds.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  /**
   * Bulk reject suggestions
   */
  async bulkReject(
    userId: number,
    suggestionIds: number[],
    reason?: string,
  ): Promise<BulkActionResultDto> {
    const results: ApprovalResultDto[] = [];

    for (const id of suggestionIds) {
      const result = await this.rejectSuggestion(userId, id, { reason });
      results.push(result);
    }

    return {
      processed: suggestionIds.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  /**
   * Delete expired suggestions
   */
  async cleanupExpiredSuggestions(): Promise<number> {
    const result = await this.suggestionRepository
      .createQueryBuilder()
      .update(ExpensePlanSuggestion)
      .set({ status: 'expired' })
      .where('status = :status', { status: 'pending' })
      .andWhere('expiresAt < NOW()')
      .execute();

    const affected = result.affected || 0;
    if (affected > 0) {
      this.logger.log(`Marked ${affected} suggestions as expired`);
    }

    return affected;
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────

  private async getRecentPendingSuggestions(
    userId: number,
    maxAgeHours: number = 24,
  ): Promise<ExpensePlanSuggestion[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - maxAgeHours);

    return this.suggestionRepository.find({
      where: {
        userId,
        status: 'pending',
      },
      relations: ['category'],
      order: { overallConfidence: 'DESC' },
    });
  }

  private async filterExistingSuggestions(
    userId: number,
    suggestions: ExpensePlanSuggestion[],
  ): Promise<ExpensePlanSuggestion[]> {
    // Get existing expense plans for this user
    const existingPlans = await this.expensePlanRepository.find({
      where: { userId },
      select: ['name', 'categoryId'],
    });

    // Get existing pending suggestions
    const existingSuggestions = await this.suggestionRepository.find({
      where: { userId, status: 'pending' },
      select: ['merchantName', 'categoryId', 'frequencyType', 'suggestedName'],
    });

    const existingPlanNames = new Set(
      existingPlans.map((p) => p.name.toLowerCase()),
    );

    // v2: Use category-based deduplication key instead of merchant-based
    const existingSuggestionCategoryIds = new Set(
      existingSuggestions
        .filter((s) => s.categoryId !== null)
        .map((s) => s.categoryId),
    );

    // Also check existing plans by categoryId
    const existingPlanCategoryIds = new Set(
      existingPlans
        .filter((p) => p.categoryId !== null && p.categoryId !== undefined)
        .map((p) => p.categoryId),
    );

    // Also track existing suggested names to avoid duplicates
    const existingSuggestedNames = new Set(
      existingSuggestions.map((s) => s.suggestedName?.toLowerCase()),
    );

    // Track categoryIds within the current batch to avoid duplicates
    const seenCategoryIds = new Set<number>();

    return suggestions.filter((suggestion) => {
      const suggestedNameLower = suggestion.suggestedName.toLowerCase();

      // Filter out if a plan with same name exists
      if (existingPlanNames.has(suggestedNameLower)) {
        return false;
      }

      // v2: Filter out if a plan exists for this category
      if (
        suggestion.categoryId !== null &&
        existingPlanCategoryIds.has(suggestion.categoryId)
      ) {
        return false;
      }

      // v2: Filter out if a pending suggestion exists for this category
      if (
        suggestion.categoryId !== null &&
        existingSuggestionCategoryIds.has(suggestion.categoryId)
      ) {
        return false;
      }

      // Filter out if same suggested name already exists in pending suggestions
      if (existingSuggestedNames.has(suggestedNameLower)) {
        return false;
      }

      // v2: Filter out duplicates within the current batch (same category)
      if (
        suggestion.categoryId !== null &&
        seenCategoryIds.has(suggestion.categoryId)
      ) {
        return false;
      }

      // Mark as seen for current batch deduplication
      if (suggestion.categoryId !== null) {
        seenCategoryIds.add(suggestion.categoryId);
      }

      return true;
    });
  }

  private buildResponse(
    suggestions: ExpensePlanSuggestion[],
    newCount: number,
    startTime: number,
    clearedCount: number = 0,
  ): GenerateSuggestionsResponseDto {
    const byExpenseType: Record<string, number> = {};
    let totalMonthlyContribution = 0;
    let essentialCount = 0;
    let discretionaryCount = 0;

    for (const suggestion of suggestions) {
      byExpenseType[suggestion.expenseType] =
        (byExpenseType[suggestion.expenseType] || 0) + 1;
      totalMonthlyContribution += suggestion.monthlyContribution;

      if (suggestion.isEssential) {
        essentialCount++;
      } else {
        discretionaryCount++;
      }
    }

    return {
      suggestions: suggestions.map((s) => this.toResponseDto(s)),
      totalFound: suggestions.length,
      newSuggestions: newCount,
      existingSuggestions: suggestions.length - newCount,
      clearedCount,
      processingTimeMs: Date.now() - startTime,
      summary: {
        byExpenseType,
        totalMonthlyContribution:
          Math.round(totalMonthlyContribution * 100) / 100,
        essentialCount,
        discretionaryCount,
      },
    };
  }

  private toResponseDto(
    suggestion: ExpensePlanSuggestion,
  ): SuggestionResponseDto {
    return {
      id: suggestion.id,
      suggestedName: suggestion.suggestedName,
      description: suggestion.description,
      merchantName: suggestion.merchantName,
      representativeDescription: suggestion.representativeDescription,
      categoryId: suggestion.categoryId,
      categoryName: suggestion.categoryName,
      averageAmount: Number(suggestion.averageAmount),
      monthlyContribution: Number(suggestion.monthlyContribution),
      yearlyTotal: Number(suggestion.yearlyTotal),
      expenseType: suggestion.expenseType,
      isEssential: suggestion.isEssential,
      frequencyType: suggestion.frequencyType,
      intervalDays: suggestion.intervalDays,
      patternConfidence: suggestion.patternConfidence,
      classificationConfidence: suggestion.classificationConfidence,
      overallConfidence: suggestion.overallConfidence,
      classificationReasoning: suggestion.classificationReasoning,
      occurrenceCount: suggestion.occurrenceCount,
      firstOccurrence: suggestion.firstOccurrence,
      lastOccurrence: suggestion.lastOccurrence,
      nextExpectedDate: suggestion.nextExpectedDate,
      suggestedPurpose: suggestion.suggestedPurpose,
      // v3: New hierarchical suggestion fields
      suggestionSource: suggestion.suggestionSource,
      categoryMonthlyAverage: suggestion.categoryMonthlyAverage
        ? Number(suggestion.categoryMonthlyAverage)
        : null,
      discrepancyPercentage: suggestion.discrepancyPercentage
        ? Number(suggestion.discrepancyPercentage)
        : null,
      hasDiscrepancyWarning: suggestion.hasDiscrepancyWarning,
      status: suggestion.status,
      createdAt: suggestion.createdAt,
    };
  }

  private mapExpenseTypeToPlanType(
    expenseType: ExpenseType,
  ): 'fixed_monthly' | 'yearly_fixed' | 'yearly_variable' {
    switch (expenseType) {
      case ExpenseType.SUBSCRIPTION:
      case ExpenseType.UTILITY:
      case ExpenseType.RENT:
      case ExpenseType.MORTGAGE:
      case ExpenseType.LOAN:
        return 'fixed_monthly';
      case ExpenseType.INSURANCE:
      case ExpenseType.TAX:
        return 'yearly_fixed';
      default:
        return 'yearly_variable';
    }
  }

  private mapFrequencyTypeToPlanFrequency(
    frequencyType: string,
  ): 'monthly' | 'quarterly' | 'yearly' {
    switch (frequencyType) {
      case 'weekly':
      case 'biweekly':
      case 'monthly':
        return 'monthly';
      case 'quarterly':
        return 'quarterly';
      case 'semiannual':
      case 'annual':
        return 'yearly';
      default:
        return 'monthly';
    }
  }

  /**
   * Get categories with useMonthlyAverageOnly flag set to true.
   * These categories should skip pattern detection and use fallback suggestions.
   */
  private async getCategoriesWithMonthlyAverageFlag(
    userId: number,
  ): Promise<Set<number>> {
    const categories = await this.categoryRepository.find({
      where: { user: { id: userId }, useMonthlyAverageOnly: true },
      select: ['id'],
    });
    return new Set(categories.map((c) => c.id));
  }
}
