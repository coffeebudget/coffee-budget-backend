import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OpenAICategorizationRequest {
  merchantName: string;
  merchantCategoryCode?: string;
  description: string;
  amount: number;
  transactionType: 'expense' | 'income';
  availableCategories: Array<{
    id: number;
    name: string;
    keywords: string[];
  }>;
}

export interface OpenAICategorizationResponse {
  categoryId: number;
  categoryName: string;
  confidence: number;
  reasoning: string;
}

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    this.model = this.configService.get<string>('OPENAI_MODEL', 'gpt-3.5-turbo');
    this.maxTokens = this.configService.get<number>('OPENAI_MAX_TOKENS', 150);
    this.baseUrl = this.configService.get<string>('OPENAI_BASE_URL', 'https://api.openai.com/v1');

    if (!this.apiKey) {
      this.logger.warn('OpenAI API key not configured. AI categorization will be disabled.');
    }
  }

  /**
   * Categorize a transaction using OpenAI
   */
  async categorizeTransaction(request: OpenAICategorizationRequest): Promise<OpenAICategorizationResponse | null> {
    if (!this.apiKey) {
      this.logger.debug('OpenAI API key not configured, skipping AI categorization');
      return null;
    }

    try {
      const prompt = this.buildCategorizationPrompt(request);
      const response = await this.callOpenAI(prompt);
      
      if (!response) {
        return null;
      }

      return this.parseCategorizationResponse(response, request.availableCategories);
    } catch (error) {
      this.logger.error('Error calling OpenAI API:', error);
      return null;
    }
  }

  /**
   * Build the prompt for OpenAI categorization
   */
  private buildCategorizationPrompt(request: OpenAICategorizationRequest): string {
    const { merchantName, merchantCategoryCode, description, amount, transactionType, availableCategories } = request;
    
    const categoriesList = availableCategories
      .map(cat => `- ${cat.id}: ${cat.name} (keywords: ${cat.keywords.join(', ')})`)
      .join('\n');

    const mccInfo = merchantCategoryCode ? `\nMerchant Category Code (MCC): ${merchantCategoryCode}` : '';
    
    return `You are a financial categorization expert. Categorize this transaction based on the merchant and description.

Transaction Details:
- Merchant: ${merchantName}
- Description: ${description}
- Amount: ${amount} (${transactionType})
- Type: ${transactionType}${mccInfo}

Available Categories:
${categoriesList}

Instructions:
1. Choose the most appropriate category based on the merchant name and description
2. Consider the Merchant Category Code (MCC) if provided
3. For expenses, focus on what was purchased or the service received
4. For income, focus on the source of the money
5. If uncertain, choose the most likely category
6. Provide a confidence score (0-100) based on how certain you are

Respond in this exact JSON format:
{
  "categoryId": <number>,
  "categoryName": "<string>",
  "confidence": <number>,
  "reasoning": "<brief explanation>"
}`;
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(prompt: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a financial categorization expert. Always respond with valid JSON in the exact format requested.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: this.maxTokens,
          temperature: 0.1, // Low temperature for consistent categorization
        }),
      });

      if (!response.ok) {
        this.logger.error(`OpenAI API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (error) {
      this.logger.error('OpenAI API call failed:', error);
      return null;
    }
  }

  /**
   * Parse OpenAI response into categorization result
   */
  private parseCategorizationResponse(
    response: string, 
    availableCategories: Array<{ id: number; name: string }>
  ): OpenAICategorizationResponse | null {
    try {
      // Clean the response - remove any markdown formatting
      const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const parsed = JSON.parse(cleanResponse);
      
      // Validate the response structure
      if (!parsed.categoryId || !parsed.categoryName || typeof parsed.confidence !== 'number') {
        this.logger.warn('Invalid OpenAI response structure:', parsed);
        return null;
      }

      // Validate that the category exists
      const categoryExists = availableCategories.some(cat => cat.id === parsed.categoryId);
      if (!categoryExists) {
        this.logger.warn(`OpenAI returned invalid category ID: ${parsed.categoryId}`);
        return null;
      }

      // Clamp confidence to 0-100 range
      const confidence = Math.max(0, Math.min(100, parsed.confidence));

      return {
        categoryId: parsed.categoryId,
        categoryName: parsed.categoryName,
        confidence,
        reasoning: parsed.reasoning || 'AI categorization'
      };
    } catch (error) {
      this.logger.error('Failed to parse OpenAI response:', error);
      this.logger.debug('Raw response:', response);
      return null;
    }
  }

  /**
   * Test OpenAI connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.ok;
    } catch (error) {
      this.logger.error('OpenAI connection test failed:', error);
      return false;
    }
  }
}
