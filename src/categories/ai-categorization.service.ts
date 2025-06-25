import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';

@Injectable()
export class AiCategorizationService {
  private readonly logger = new Logger(AiCategorizationService.name);

  constructor(
    private configService: ConfigService,
    private categoriesService: CategoriesService,
  ) {}

  /**
   * Enhanced categorization using AI + existing keywords
   */
  async suggestCategoryWithAI(
    description: string,
    amount: number,
    userId: number,
    transactionType: 'income' | 'expense',
  ): Promise<{
    category: Category | null;
    confidence: number;
    reasoning: string;
  }> {
    // First try existing keyword matching
    const keywordCategory =
      await this.categoriesService.suggestCategoryForDescription(
        description,
        userId,
      );

    if (keywordCategory) {
      return {
        category: keywordCategory,
        confidence: 0.9,
        reasoning: 'Matched existing keywords',
      };
    }

    // If no keyword match, use AI
    return this.categorizeWithOpenAI(
      description,
      amount,
      userId,
      transactionType,
    );
  }

  /**
   * OpenAI-powered categorization for Italian transactions
   */
  private async categorizeWithOpenAI(
    description: string,
    amount: number,
    userId: number,
    transactionType: 'income' | 'expense',
  ): Promise<{
    category: Category | null;
    confidence: number;
    reasoning: string;
  }> {
    try {
      // Get user's existing categories
      const userCategories = await this.categoriesService.findAll(userId);
      const categoryNames = userCategories.map((c) => c.name);

      const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!openaiApiKey) {
        this.logger.warn('OpenAI API key not configured');
        return {
          category: null,
          confidence: 0,
          reasoning: 'No AI service available',
        };
      }

      const prompt = this.buildItalianCategorizationPrompt(
        description,
        amount,
        transactionType,
        categoryNames,
      );

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 150,
            temperature: 0.1,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content?.trim();

      if (!aiResponse) {
        return { category: null, confidence: 0, reasoning: 'No AI response' };
      }

      // Parse AI response (expecting JSON format)
      const parsed = this.parseAIResponse(aiResponse);

      // Find matching category
      const matchedCategory = userCategories.find(
        (c) => c.name.toLowerCase() === parsed.category.toLowerCase(),
      );

      return {
        category: matchedCategory || null,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      this.logger.error('AI categorization failed:', error);
      return { category: null, confidence: 0, reasoning: 'AI service error' };
    }
  }

  /**
   * Build specialized prompt for Italian banking transactions
   */
  private buildItalianCategorizationPrompt(
    description: string,
    amount: number,
    transactionType: 'income' | 'expense',
    existingCategories: string[],
  ): string {
    return `
Analizza questa transazione bancaria italiana e suggerisci la categoria più appropriata.

TRANSAZIONE:
Descrizione: "${description}"
Importo: €${amount}
Tipo: ${transactionType === 'income' ? 'Entrata' : 'Uscita'}

CATEGORIE DISPONIBILI:
${existingCategories.join(', ')}

REGOLE ITALIANE:
- "Bar", "caffè", "espresso" → Coffee & Drinks
- "Ristorante", "pizzeria", "trattoria", "osteria" → Restaurants  
- "Supermercato", "Conad", "Coop", "Esselunga", "Carrefour" → Groceries
- "Affitto", "canone", "locazione" → Housing
- "Benzina", "carburante", "Eni", "IP", "Q8" → Transportation
- "Stipendio", "salario", "cedolino" → Salary
- "Bolletta", "Enel", "Tim", "Vodafone", "gas" → Utilities
- "Farmacia", "farmaci", "medicinali" → Healthcare
- "Amazon", "shopping", "acquisto" → Shopping

Rispondi in formato JSON:
{
  "category": "nome_categoria_esatta",
  "confidence": 0.8,
  "reasoning": "spiegazione breve"
}

Se nessuna categoria si adatta perfettamente, scegli "Other" con confidence bassa.
    `;
  }

  /**
   * Parse AI JSON response safely
   */
  private parseAIResponse(response: string): {
    category: string;
    confidence: number;
    reasoning: string;
  } {
    try {
      const parsed = JSON.parse(response);
      return {
        category: parsed.category || 'Other',
        confidence: Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
        reasoning: parsed.reasoning || 'AI suggestion',
      };
    } catch {
      // Fallback parsing for non-JSON responses
      return {
        category: 'Other',
        confidence: 0.3,
        reasoning: 'Failed to parse AI response',
      };
    }
  }

  /**
   * Extract merchant name from transaction description
   * This focuses on the first part of the description which should be the merchant name
   * after our GoCardless parser improvements
   *
   * Examples:
   * "Starbucks | Purchase at location" → "starbucks"
   * "McDonald's Roma | Card payment" → "mcdonald's roma"
   * "Esselunga" → "esselunga"
   * "PAYPAL *MERCHANT | Online payment" → "paypal *merchant" (filtered out as PayPal)
   */
  extractMerchantName(description: string): string | null {
    if (!description || description.trim().length === 0) {
      return null;
    }

    // Clean the description
    let cleaned = description.trim();

    // Remove [PENDING] prefix if present
    cleaned = cleaned.replace(/^\[PENDING\]\s*/i, '');

    // Split by common separators and take the first meaningful part (the merchant)
    const parts = cleaned.split(/\s*\|\s*/);
    let merchantPart = parts[0].trim();

    // If it's too short or looks like a transaction code, try next part
    if (merchantPart.length <= 3 || merchantPart.match(/^[A-Z0-9\-_]{1,10}$/)) {
      merchantPart = parts[1]?.trim() || merchantPart;
    }

    // Clean up common transaction prefixes/suffixes
    merchantPart = merchantPart
      .replace(/^(bonifico|pagamento|carta|pos|bancomat)\s+/i, '')
      .replace(/\s+(s\.p\.a\.|spa|srl|s\.r\.l\.)$/i, '')
      .replace(/\s*\(.*\)$/, '') // Remove anything in parentheses at the end
      .trim();

    // Skip PayPal transactions - they should be handled by PayPal-specific logic
    if (merchantPart.toLowerCase().includes('paypal')) {
      return null;
    }

    // Validate the merchant name
    if (
      merchantPart.length >= 3 &&
      merchantPart.length <= 50 &&
      !merchantPart.match(/^\d+$/) && // Not just numbers
      !merchantPart.match(/^[A-Z0-9\-_]{1,10}$/) && // Not just short codes
      !merchantPart.toLowerCase().includes('transaction') &&
      !merchantPart.toLowerCase().includes('bank transaction')
    ) {
      return merchantPart.toLowerCase();
    }

    return null;
  }

  /**
   * Learn from user corrections - add only merchant names as keywords
   */
  async learnFromAcceptedSuggestion(
    description: string,
    categoryId: number,
    userId: number,
  ): Promise<void> {
    try {
      // Extract merchant name from description
      const merchantName = this.extractMerchantName(description);

      if (merchantName) {
        // Add merchant name as keyword to the category
        await this.categoriesService.addKeywordToCategory(
          categoryId,
          merchantName,
          userId,
        );

        this.logger.log(
          `Auto-learned merchant keyword: "${merchantName}" → category ${categoryId}`,
        );
      } else {
        this.logger.debug(`No merchant name extracted from: "${description}"`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to learn from accepted suggestion: ${error.message}`,
      );
    }
  }

  /**
   * Learn from user corrections to improve future suggestions
   */
  async learnFromCorrection(
    originalDescription: string,
    suggestedCategory: string,
    actualCategory: string,
    _userId: number,
  ): Promise<void> {
    // DISABLED: Automatic keyword learning causes false positives
    // The AI will still suggest categories, but won't automatically add keywords
    // Users can manually add keywords if they want through the category management UI

    // // Extract key terms from the description
    // const keyTerms = this.extractKeyTerms(originalDescription);

    // // Add these terms as keywords to the actual category
    // for (const term of keyTerms) {
    //   try {
    //     await this.categoriesService.addKeywordToCategory(
    //       parseInt(actualCategory),
    //       term,
    //       userId,
    //     );
    //   } catch (error) {
    //     this.logger.debug(`Could not add keyword "${term}":`, error.message);
    //   }
    // }

    this.logger.log(
      `AI categorization logged (auto-learning disabled): "${originalDescription}" → ${actualCategory}`,
    );
  }

  /**
   * Extract meaningful terms from transaction description
   */
  private extractKeyTerms(description: string): string[] {
    const commonWords = [
      'di',
      'a',
      'da',
      'in',
      'con',
      'su',
      'per',
      'tra',
      'fra',
      'the',
      'and',
      'or',
      'pagamento',
      'acquisto',
      'bonifico',
      'carta',
      'pos',
      'bancomat',
    ];

    return description
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .filter((word) => !commonWords.includes(word))
      .filter((word) => !/^\d+$/.test(word))
      .slice(0, 3); // Take top 3 meaningful terms
  }
}
