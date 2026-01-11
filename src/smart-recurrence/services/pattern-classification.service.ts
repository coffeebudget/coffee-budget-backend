import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PatternClassificationRequest,
  PatternClassificationResponse,
  BatchClassificationRequest,
  BatchClassificationResponse,
  ExpenseType,
  PatternClassificationConfig,
  DEFAULT_CLASSIFICATION_CONFIG,
} from '../interfaces/classification.interface';
import { FrequencyType } from '../interfaces/frequency.interface';

@Injectable()
export class PatternClassificationService {
  private readonly logger = new Logger(PatternClassificationService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly config: PatternClassificationConfig;

  // In-memory cache for classification results
  private readonly cache = new Map<
    string,
    { response: PatternClassificationResponse; expiresAt: Date }
  >();

  // Daily API call counter
  private dailyApiCalls = 0;
  private lastResetDate: string = new Date().toISOString().split('T')[0];

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    this.model = this.configService.get<string>(
      'OPENAI_MODEL',
      'gpt-3.5-turbo',
    );
    this.baseUrl = this.configService.get<string>(
      'OPENAI_BASE_URL',
      'https://api.openai.com/v1',
    );
    this.config = {
      ...DEFAULT_CLASSIFICATION_CONFIG,
      maxBatchSize:
        this.configService.get<number>('PATTERN_BATCH_SIZE') ||
        DEFAULT_CLASSIFICATION_CONFIG.maxBatchSize,
      maxDailyApiCalls:
        this.configService.get<number>('PATTERN_MAX_DAILY_CALLS') ||
        DEFAULT_CLASSIFICATION_CONFIG.maxDailyApiCalls,
    };

    if (!this.apiKey) {
      this.logger.warn(
        'OpenAI API key not configured. Pattern classification will use rule-based fallback.',
      );
    }
  }

  /**
   * Classify a batch of patterns with cost optimization
   * Uses batching to reduce API calls and caching to avoid redundant calls
   */
  async classifyPatterns(
    request: BatchClassificationRequest,
  ): Promise<BatchClassificationResponse> {
    const startTime = Date.now();
    const { patterns, userId } = request;

    this.logger.log(
      `Classifying ${patterns.length} patterns for user ${userId}`,
    );

    // Check and update daily API call limit
    this.resetDailyCounterIfNeeded();

    // Separate cached and uncached patterns
    const cachedResults: PatternClassificationResponse[] = [];
    const uncachedPatterns: PatternClassificationRequest[] = [];

    for (const pattern of patterns) {
      const cacheKey = this.generateCacheKey(pattern);
      const cached = this.getFromCache(cacheKey);

      if (cached) {
        this.logger.debug(`Cache hit for pattern: ${pattern.patternId}`);
        cachedResults.push({ ...cached, patternId: pattern.patternId });
      } else {
        uncachedPatterns.push(pattern);
      }
    }

    this.logger.log(
      `Cache: ${cachedResults.length} hits, ${uncachedPatterns.length} misses`,
    );

    let newClassifications: PatternClassificationResponse[] = [];
    let tokensUsed = 0;

    // Process uncached patterns
    if (uncachedPatterns.length > 0) {
      // Check API rate limit
      if (this.dailyApiCalls >= this.config.maxDailyApiCalls) {
        this.logger.warn(
          'Daily API call limit reached, using rule-based fallback',
        );
        newClassifications = uncachedPatterns.map((p) =>
          this.classifyWithRules(p),
        );
      } else if (!this.apiKey) {
        // No API key - use rule-based classification
        newClassifications = uncachedPatterns.map((p) =>
          this.classifyWithRules(p),
        );
      } else {
        // Process in batches to optimize API calls
        const batches = this.createBatches(
          uncachedPatterns,
          this.config.maxBatchSize,
        );

        for (const batch of batches) {
          if (this.dailyApiCalls >= this.config.maxDailyApiCalls) {
            // Fallback to rules for remaining patterns
            const ruleBasedResults = batch.map((p) =>
              this.classifyWithRules(p),
            );
            newClassifications.push(...ruleBasedResults);
            continue;
          }

          try {
            const { classifications, tokens } =
              await this.classifyBatchWithOpenAI(batch);
            newClassifications.push(...classifications);
            tokensUsed += tokens;
            this.dailyApiCalls++;

            // Cache the new results
            for (const classification of classifications) {
              const pattern = batch.find(
                (p) => p.patternId === classification.patternId,
              );
              if (pattern) {
                const cacheKey = this.generateCacheKey(pattern);
                this.addToCache(cacheKey, classification);
              }
            }
          } catch (error) {
            this.logger.error(
              `Batch classification failed, using rules: ${error.message}`,
            );
            const ruleBasedResults = batch.map((p) =>
              this.classifyWithRules(p),
            );
            newClassifications.push(...ruleBasedResults);
          }
        }
      }
    }

    const allClassifications = [...cachedResults, ...newClassifications];
    const processingTimeMs = Date.now() - startTime;
    const estimatedCost = tokensUsed * this.config.costPerToken;

    this.logger.log(
      `Classification complete: ${allClassifications.length} patterns, ` +
        `${tokensUsed} tokens, $${estimatedCost.toFixed(4)} estimated cost, ` +
        `${processingTimeMs}ms`,
    );

    return {
      classifications: allClassifications,
      tokensUsed,
      estimatedCost,
      processingTimeMs,
    };
  }

  /**
   * Classify a single pattern (convenience method)
   */
  async classifyPattern(
    pattern: PatternClassificationRequest,
    userId: number,
  ): Promise<PatternClassificationResponse> {
    const result = await this.classifyPatterns({
      patterns: [pattern],
      userId,
    });
    return result.classifications[0];
  }

  /**
   * Classify a batch of patterns using OpenAI
   */
  private async classifyBatchWithOpenAI(
    patterns: PatternClassificationRequest[],
  ): Promise<{
    classifications: PatternClassificationResponse[];
    tokens: number;
  }> {
    const prompt = this.buildBatchClassificationPrompt(patterns);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are a financial expense classification expert. Analyze recurring payment patterns and classify them for expense planning. Always respond with valid JSON in the exact format requested.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: this.config.maxTokensPerRequest,
        temperature: 0.1, // Low temperature for consistent classification
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const tokensUsed = data.usage?.total_tokens || 0;

    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const classifications = this.parseBatchResponse(content, patterns);

    return { classifications, tokens: tokensUsed };
  }

  /**
   * Build prompt for batch classification
   */
  private buildBatchClassificationPrompt(
    patterns: PatternClassificationRequest[],
  ): string {
    const patternsJson = patterns.map((p, index) => ({
      index,
      patternId: p.patternId,
      merchant: p.merchantName || 'Unknown',
      category: p.categoryName || 'Uncategorized',
      description: p.representativeDescription,
      averageAmount: p.averageAmount.toFixed(2),
      frequency: p.frequencyType,
      occurrences: p.occurrenceCount,
    }));

    const expenseTypes = Object.values(ExpenseType).join(', ');

    return `Analyze these recurring payment patterns and classify each one for expense planning.

PATTERNS TO CLASSIFY:
${JSON.stringify(patternsJson, null, 2)}

EXPENSE TYPES AVAILABLE:
${expenseTypes}

For each pattern, determine:
1. expenseType: The most appropriate type from the list above
2. isEssential: true if this is a necessary expense (utilities, insurance, mortgage), false for discretionary
3. suggestedPlanName: A clear, user-friendly name for the expense plan (e.g., "Netflix Subscription", "Home Insurance"). IMPORTANT: Make names unique - if you have multiple similar expenses (like multiple cafe visits), differentiate them by adding the merchant name or description.
4. monthlyContribution: The CALCULATED numeric amount to save monthly. Calculate this yourself based on averageAmount and frequency. DO NOT write mathematical expressions - write the final calculated number only.
5. confidence: 0-100 based on how certain you are about the classification
6. reasoning: Brief explanation of your classification

FREQUENCY MULTIPLIERS for monthlyContribution (calculate the result, don't write the formula):
- weekly: averageAmount multiplied by 4.33
- biweekly: averageAmount multiplied by 2.17
- monthly: use averageAmount as-is
- quarterly: averageAmount divided by 3
- semiannual: averageAmount divided by 6
- annual: averageAmount divided by 12

CRITICAL JSON FORMATTING RULES:
- monthlyContribution MUST be a plain number (e.g., 99.15), NOT a mathematical expression (e.g., 22.90 * 4.33)
- All numbers must be numeric values, not strings or formulas
- The response must be valid JSON that can be parsed by JSON.parse()

Respond with a JSON array in this exact format:
[
  {
    "patternId": "<string>",
    "expenseType": "<ExpenseType>",
    "isEssential": <boolean>,
    "suggestedPlanName": "<string>",
    "monthlyContribution": <calculated_number>,
    "confidence": <number>,
    "reasoning": "<string>"
  }
]`;
  }

  /**
   * Parse batch response from OpenAI
   */
  private parseBatchResponse(
    response: string,
    patterns: PatternClassificationRequest[],
  ): PatternClassificationResponse[] {
    try {
      // Clean the response - remove any markdown formatting
      let cleanResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Fix mathematical expressions in monthlyContribution that OpenAI sometimes returns
      // e.g., "monthlyContribution": 22.90 * 4.33 → "monthlyContribution": 99.157
      cleanResponse = this.fixMathExpressionsInJson(cleanResponse);

      const parsed = JSON.parse(cleanResponse);

      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }

      return parsed.map((item) => {
        // Validate expense type
        const expenseType = Object.values(ExpenseType).includes(
          item.expenseType,
        )
          ? item.expenseType
          : ExpenseType.OTHER_FIXED;

        return {
          patternId: item.patternId,
          expenseType,
          isEssential: Boolean(item.isEssential),
          suggestedPlanName: item.suggestedPlanName || 'Unnamed Expense',
          monthlyContribution: Number(item.monthlyContribution) || 0,
          confidence: Math.max(0, Math.min(100, Number(item.confidence) || 50)),
          reasoning: item.reasoning || 'AI classification',
        };
      });
    } catch (error) {
      this.logger.error('Failed to parse OpenAI batch response:', error);
      this.logger.debug('Raw response:', response);

      // Fallback to rule-based classification
      return patterns.map((p) => this.classifyWithRules(p));
    }
  }

  /**
   * Fix mathematical expressions in JSON that OpenAI sometimes returns
   * e.g., "monthlyContribution": 22.90 * 4.33 → "monthlyContribution": 99.157
   */
  private fixMathExpressionsInJson(jsonString: string): string {
    // Match patterns like: "monthlyContribution": <number> <operator> <number>
    // Operators: *, /, +, -
    const mathExpressionPattern =
      /"monthlyContribution"\s*:\s*([\d.]+)\s*([*\/+-])\s*([\d.]+)/g;

    return jsonString.replace(mathExpressionPattern, (match, num1, operator, num2) => {
      const a = parseFloat(num1);
      const b = parseFloat(num2);
      let result: number;

      switch (operator) {
        case '*':
          result = a * b;
          break;
        case '/':
          result = a / b;
          break;
        case '+':
          result = a + b;
          break;
        case '-':
          result = a - b;
          break;
        default:
          result = a;
      }

      // Round to 2 decimal places
      result = Math.round(result * 100) / 100;

      this.logger.debug(
        `Fixed math expression: ${num1} ${operator} ${num2} = ${result}`,
      );

      return `"monthlyContribution": ${result}`;
    });
  }

  /**
   * Rule-based classification fallback when API is unavailable
   */
  classifyWithRules(
    pattern: PatternClassificationRequest,
  ): PatternClassificationResponse {
    const {
      merchantName,
      categoryName,
      representativeDescription,
      averageAmount,
      frequencyType,
    } = pattern;

    const searchText = [merchantName, categoryName, representativeDescription]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    let expenseType = ExpenseType.OTHER_FIXED;
    let isEssential = false;
    let suggestedPlanName = 'Expense';
    let confidence = 50;

    // Subscription detection
    if (
      this.matchesKeywords(searchText, [
        'netflix',
        'spotify',
        'disney',
        'hbo',
        'prime',
        'youtube',
        'apple music',
        'dazn',
        'sky',
      ])
    ) {
      expenseType = ExpenseType.SUBSCRIPTION;
      isEssential = false;
      suggestedPlanName = this.extractPlanName(merchantName, 'Subscription');
      confidence = 80;
    }
    // Utility detection
    else if (
      this.matchesKeywords(searchText, [
        'electric',
        'enel',
        'gas',
        'water',
        'utility',
        'bolletta',
        'luce',
        'acqua',
      ])
    ) {
      expenseType = ExpenseType.UTILITY;
      isEssential = true;
      suggestedPlanName = this.extractPlanName(merchantName, 'Utility Bill');
      confidence = 85;
    }
    // Insurance detection
    else if (
      this.matchesKeywords(searchText, [
        'insurance',
        'assicura',
        'polizza',
        'allianz',
        'generali',
        'unipol',
        'axa',
      ])
    ) {
      expenseType = ExpenseType.INSURANCE;
      isEssential = true;
      suggestedPlanName = this.extractPlanName(merchantName, 'Insurance');
      confidence = 85;
    }
    // Mortgage/Rent detection
    else if (
      this.matchesKeywords(searchText, [
        'mortgage',
        'mutuo',
        'rent',
        'affitto',
        'housing',
      ])
    ) {
      expenseType =
        searchText.includes('rent') || searchText.includes('affitto')
          ? ExpenseType.RENT
          : ExpenseType.MORTGAGE;
      isEssential = true;
      suggestedPlanName =
        expenseType === ExpenseType.RENT ? 'Rent Payment' : 'Mortgage Payment';
      confidence = 90;
    }
    // Loan detection
    else if (
      this.matchesKeywords(searchText, [
        'loan',
        'prestito',
        'finanziamento',
        'rata',
      ])
    ) {
      expenseType = ExpenseType.LOAN;
      isEssential = true;
      suggestedPlanName = this.extractPlanName(merchantName, 'Loan Payment');
      confidence = 75;
    }
    // Salary detection (income)
    else if (
      this.matchesKeywords(searchText, [
        'salary',
        'stipendio',
        'wage',
        'payroll',
        'paga',
      ])
    ) {
      expenseType = ExpenseType.SALARY;
      isEssential = false;
      suggestedPlanName = 'Salary Income';
      confidence = 90;
    }
    // Tax detection
    else if (
      this.matchesKeywords(searchText, ['tax', 'tasse', 'imu', 'tari', 'irpef'])
    ) {
      expenseType = ExpenseType.TAX;
      isEssential = true;
      suggestedPlanName = this.extractPlanName(merchantName, 'Tax Payment');
      confidence = 80;
    }

    // Calculate monthly contribution based on frequency
    const monthlyContribution = this.calculateMonthlyContribution(
      averageAmount,
      frequencyType,
    );

    return {
      patternId: pattern.patternId,
      expenseType,
      isEssential,
      suggestedPlanName,
      monthlyContribution,
      confidence,
      reasoning: 'Rule-based classification',
    };
  }

  /**
   * Check if text matches any of the keywords
   */
  private matchesKeywords(text: string, keywords: string[]): boolean {
    return keywords.some((kw) => text.includes(kw));
  }

  /**
   * Extract a clean plan name from merchant name
   */
  private extractPlanName(
    merchantName: string | null,
    fallback: string,
  ): string {
    if (!merchantName) return fallback;

    // Clean up common suffixes and normalize
    return (
      merchantName
        .replace(/\s*(s\.?r\.?l\.?|s\.?p\.?a\.?|inc\.?|ltd\.?|llc\.?)/gi, '')
        .trim() || fallback
    );
  }

  /**
   * Calculate monthly contribution based on frequency
   */
  private calculateMonthlyContribution(
    amount: number,
    frequency: FrequencyType,
  ): number {
    const absAmount = Math.abs(amount);

    switch (frequency) {
      case FrequencyType.WEEKLY:
        return Math.round(absAmount * 4.33 * 100) / 100;
      case FrequencyType.BIWEEKLY:
        return Math.round(absAmount * 2.17 * 100) / 100;
      case FrequencyType.MONTHLY:
        return absAmount;
      case FrequencyType.QUARTERLY:
        return Math.round((absAmount / 3) * 100) / 100;
      case FrequencyType.SEMIANNUAL:
        return Math.round((absAmount / 6) * 100) / 100;
      case FrequencyType.ANNUAL:
        return Math.round((absAmount / 12) * 100) / 100;
      default:
        return absAmount;
    }
  }

  /**
   * Generate cache key from pattern
   */
  private generateCacheKey(pattern: PatternClassificationRequest): string {
    // Key based on stable pattern characteristics
    const keyParts = [
      pattern.merchantName || 'unknown',
      pattern.categoryName || 'unknown',
      pattern.frequencyType,
      Math.round(pattern.averageAmount), // Round to avoid cache misses on small variations
    ];
    return keyParts.join('|').toLowerCase();
  }

  /**
   * Get cached classification
   */
  private getFromCache(key: string): PatternClassificationResponse | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (new Date() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.response;
  }

  /**
   * Add classification to cache
   */
  private addToCache(
    key: string,
    response: PatternClassificationResponse,
  ): void {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.config.cacheTtlMinutes);

    this.cache.set(key, { response, expiresAt });
  }

  /**
   * Create batches from array
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Reset daily counter if new day
   */
  private resetDailyCounterIfNeeded(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.dailyApiCalls = 0;
      this.lastResetDate = today;
      this.logger.log('Daily API call counter reset');
    }
  }

  /**
   * Get current API usage stats
   */
  getApiUsageStats(): {
    dailyApiCalls: number;
    maxDailyApiCalls: number;
    remainingCalls: number;
    cacheSize: number;
  } {
    this.resetDailyCounterIfNeeded();
    return {
      dailyApiCalls: this.dailyApiCalls,
      maxDailyApiCalls: this.config.maxDailyApiCalls,
      remainingCalls: Math.max(
        0,
        this.config.maxDailyApiCalls - this.dailyApiCalls,
      ),
      cacheSize: this.cache.size,
    };
  }

  /**
   * Clear classification cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.log('Classification cache cleared');
  }
}
