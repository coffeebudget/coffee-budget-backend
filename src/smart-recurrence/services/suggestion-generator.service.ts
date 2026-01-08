import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PatternDetectionService } from './pattern-detection.service';
import { PatternClassificationService } from './pattern-classification.service';
import {
  ExpensePlanSuggestion,
  SuggestionStatus,
} from '../entities/expense-plan-suggestion.entity';
import { ExpensePlan } from '../../expense-plans/entities/expense-plan.entity';
import {
  PatternDetectionCriteria,
  DetectedPatternData,
} from '../interfaces/pattern.interface';
import {
  PatternClassificationRequest,
  ExpenseType,
} from '../interfaces/classification.interface';
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
    private readonly patternDetection: PatternDetectionService,
    private readonly patternClassification: PatternClassificationService,
  ) {}

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

    // Check for recent suggestions if not forcing regeneration
    if (!options.forceRegenerate) {
      const recentSuggestions = await this.getRecentPendingSuggestions(userId);
      if (recentSuggestions.length > 0) {
        this.logger.log(`Found ${recentSuggestions.length} recent pending suggestions`);
        return this.buildResponse(recentSuggestions, 0, startTime);
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

    if (patterns.length === 0) {
      return this.buildResponse([], 0, startTime);
    }

    // Step 2: Classify patterns using AI
    const classificationRequests: PatternClassificationRequest[] = patterns.map(
      (pattern) => ({
        patternId: pattern.group.id,
        merchantName: pattern.group.merchantName,
        categoryName: pattern.group.categoryName,
        representativeDescription: pattern.group.representativeDescription,
        averageAmount: pattern.group.averageAmount,
        frequencyType: pattern.frequency.type,
        occurrenceCount: pattern.frequency.occurrenceCount,
      }),
    );

    const classificationResult = await this.patternClassification.classifyPatterns({
      patterns: classificationRequests,
      userId,
    });

    this.logger.log(
      `Classified ${classificationResult.classifications.length} patterns, ` +
        `${classificationResult.tokensUsed} tokens used`,
    );

    // Step 3: Create suggestion entities
    const suggestions = await this.createSuggestions(
      userId,
      patterns,
      classificationResult.classifications,
    );

    // Step 4: Filter out duplicates (existing approved plans)
    const filteredSuggestions = await this.filterExistingSuggestions(
      userId,
      suggestions,
    );

    this.logger.log(
      `Created ${filteredSuggestions.length} new suggestions ` +
        `(${suggestions.length - filteredSuggestions.length} duplicates filtered)`,
    );

    // Step 5: Save suggestions to database
    const savedSuggestions = await this.suggestionRepository.save(
      filteredSuggestions,
    );

    // Get all pending suggestions for response
    const allPending = await this.getPendingSuggestions(userId);

    return this.buildResponse(
      allPending,
      savedSuggestions.length,
      startTime,
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
      { pending: 0, approved: 0, rejected: 0, expired: 0 } as Record<string, number>,
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
  async getPendingSuggestions(userId: number): Promise<ExpensePlanSuggestion[]> {
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
        targetAmount: suggestion.yearlyTotal,
        monthlyContribution:
          options.customMonthlyContribution ?? suggestion.monthlyContribution,
        contributionSource: 'calculated',
        frequency: this.mapFrequencyTypeToPlanFrequency(suggestion.frequencyType),
        nextDueDate: suggestion.nextExpectedDate,
        status: 'active',
        autoCalculate: true,
        rolloverSurplus: true,
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

  private async createSuggestions(
    userId: number,
    patterns: DetectedPatternData[],
    classifications: { patternId: string; expenseType: ExpenseType; isEssential: boolean; suggestedPlanName: string; monthlyContribution: number; confidence: number; reasoning: string }[],
  ): Promise<ExpensePlanSuggestion[]> {
    const classificationMap = new Map(
      classifications.map((c) => [c.patternId, c]),
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // Expire in 30 days

    return patterns.map((pattern) => {
      const classification = classificationMap.get(pattern.group.id);

      const suggestion = new ExpensePlanSuggestion();
      suggestion.userId = userId;
      // Truncate to fit database column limits
      const rawSuggestedName =
        classification?.suggestedPlanName ||
        pattern.group.merchantName ||
        pattern.group.representativeDescription.substring(0, 50);
      suggestion.suggestedName = rawSuggestedName?.substring(0, 100) || 'Unnamed Expense';
      suggestion.description = `Detected recurring ${pattern.frequency.type} expense`;
      suggestion.merchantName = pattern.group.merchantName?.substring(0, 255) || null;
      suggestion.representativeDescription = pattern.group.representativeDescription;
      suggestion.categoryId = pattern.group.categoryId;
      suggestion.categoryName = pattern.group.categoryName?.substring(0, 100) || null;
      suggestion.averageAmount = pattern.group.averageAmount;
      suggestion.monthlyContribution =
        classification?.monthlyContribution || pattern.group.averageAmount;
      suggestion.yearlyTotal = suggestion.monthlyContribution * 12;
      suggestion.expenseType = classification?.expenseType || ExpenseType.OTHER_FIXED;
      suggestion.isEssential = classification?.isEssential || false;
      suggestion.frequencyType = pattern.frequency.type;
      suggestion.intervalDays = pattern.frequency.intervalDays;
      suggestion.patternConfidence = pattern.confidence.overall;
      suggestion.classificationConfidence = classification?.confidence || 50;
      suggestion.overallConfidence = Math.round(
        (pattern.confidence.overall * 0.6 + (classification?.confidence || 50) * 0.4),
      );
      suggestion.classificationReasoning = classification?.reasoning || null;
      suggestion.occurrenceCount = pattern.frequency.occurrenceCount;
      suggestion.firstOccurrence = pattern.firstOccurrence;
      suggestion.lastOccurrence = pattern.lastOccurrence;
      suggestion.nextExpectedDate = pattern.nextExpectedDate;
      suggestion.status = 'pending';
      suggestion.expiresAt = expiresAt;
      suggestion.metadata = {
        patternId: pattern.group.id,
        transactionIds: pattern.group.transactions.map((t) => t.id),
        amountRange: {
          min: Math.min(...pattern.group.transactions.map((t) => Math.abs(Number(t.amount)))),
          max: Math.max(...pattern.group.transactions.map((t) => Math.abs(Number(t.amount)))),
        },
        sourceVersion: '1.0',
      };

      return suggestion;
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
      select: ['merchantName', 'categoryId', 'frequencyType'],
    });

    const existingPlanNames = new Set(
      existingPlans.map((p) => p.name.toLowerCase()),
    );

    const existingSuggestionKeys = new Set(
      existingSuggestions.map((s) =>
        `${s.merchantName?.toLowerCase()}|${s.categoryId}|${s.frequencyType}`,
      ),
    );

    return suggestions.filter((suggestion) => {
      // Filter out if a plan with same name exists
      if (existingPlanNames.has(suggestion.suggestedName.toLowerCase())) {
        return false;
      }

      // Filter out if a pending suggestion with same key exists
      const suggestionKey = `${suggestion.merchantName?.toLowerCase()}|${suggestion.categoryId}|${suggestion.frequencyType}`;
      if (existingSuggestionKeys.has(suggestionKey)) {
        return false;
      }

      return true;
    });
  }

  private buildResponse(
    suggestions: ExpensePlanSuggestion[],
    newCount: number,
    startTime: number,
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
      processingTimeMs: Date.now() - startTime,
      summary: {
        byExpenseType,
        totalMonthlyContribution: Math.round(totalMonthlyContribution * 100) / 100,
        essentialCount,
        discretionaryCount,
      },
    };
  }

  private toResponseDto(suggestion: ExpensePlanSuggestion): SuggestionResponseDto {
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
}
