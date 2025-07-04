import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ExpenseAnalysisService {
  private readonly logger = new Logger(ExpenseAnalysisService.name);

  constructor(private configService: ConfigService) {}

  /**
   * Analyze spending patterns and provide insights using ChatGPT
   * This replaces the old AI categorization with more useful expense analysis
   */
  async analyzeSpendingPatterns(
    transactions: any[],
    userId: number,
    analysisType: 'monthly' | 'category' | 'trends' = 'monthly',
  ): Promise<{
    insights: string[];
    recommendations: string[];
    patterns: string[];
    warnings?: string[];
  }> {
    try {
      const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!openaiApiKey) {
        this.logger.warn('OpenAI API key not configured');
        return {
          insights: ['AI analysis not available - OpenAI API key not configured'],
          recommendations: [],
          patterns: [],
        };
      }

      const prompt = this.buildAnalysisPrompt(transactions, analysisType);

      // Log the prompt to see what we're sending to ChatGPT
      this.logger.debug('Full prompt sent to ChatGPT:', prompt);

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini', // More cost-effective for analysis
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500,
            temperature: 0.3,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content?.trim();

      if (!aiResponse) {
        return {
          insights: ['No analysis generated'],
          recommendations: [],
          patterns: [],
        };
      }

      // Log the raw AI response for debugging
      this.logger.debug('Raw AI Response:', aiResponse);

      // Parse AI response (expecting structured format)
      return this.parseAnalysisResponse(aiResponse);
    } catch (error) {
      this.logger.error('Expense analysis failed:', error);
      return {
        insights: ['Analysis temporarily unavailable'],
        recommendations: [],
        patterns: [],
        warnings: ['Analysis service error'],
      };
    }
  }

  /**
   * Build analysis prompt for different types of expense analysis
   */
  private buildAnalysisPrompt(
    transactions: any[],
    analysisType: 'monthly' | 'category' | 'trends',
  ): string {
    // Log some sample transactions to understand the data structure
    this.logger.debug('Sample transactions (first 5):', transactions.slice(0, 5).map(t => ({
      amount: t.amount,
      category: t.category?.name,
      description: t.description || t.note,
      transactionType: t.type, // This is the actual transaction type (expense/income)
      amountType: typeof t.amount
    })));
    
    // Check all unique transaction types in the dataset
    const uniqueTypes = [...new Set(transactions.map(t => t.type))];
    this.logger.debug('All transaction types found in dataset:', uniqueTypes);

    // Try both logics and see which makes more sense
    const negativeAmounts = transactions.filter(t => parseFloat(t.amount) < 0);
    const positiveAmounts = transactions.filter(t => parseFloat(t.amount) > 0);
    
    this.logger.debug('Negative amounts count:', negativeAmounts.length, 'Positive amounts count:', positiveAmounts.length);
    
    // Bank logic often has: positive = outgoing (expenses), negative = incoming (income)
    // But let's check what makes sense based on categories
    const bankTransferPositive = transactions.filter(t => 
      t.category?.name === 'Bank Transfers' && parseFloat(t.amount) > 0
    ).length;
    const bankTransferNegative = transactions.filter(t => 
      t.category?.name === 'Bank Transfers' && parseFloat(t.amount) < 0
    ).length;
    
    this.logger.debug('Bank Transfers: positive count:', bankTransferPositive, 'negative count:', bankTransferNegative);
    
    // DEFINITIVE LOGIC: Use the type column instead of amount sign
    // This is much more reliable than guessing from positive/negative amounts
    const expenses = transactions.filter(t => t.type === 'expense');
    const income = transactions.filter(t => t.type === 'income');
    
    this.logger.debug('USING TYPE COLUMN - Expenses (type=expense):', expenses.length, 'Income (type=income):', income.length);
    
    // BANK TRANSFERS ANALYSIS: Check income vs expense breakdown
    const bankTransferIncome = transactions.filter(t => 
      t.category?.name === 'Bank Transfers' && t.type === 'income'
    );
    const bankTransferExpense = transactions.filter(t => 
      t.category?.name === 'Bank Transfers' && t.type === 'expense'
    );
    
    // DETAILED BANK TRANSFERS LOGGING
    const bankTransferIncomeSum = bankTransferIncome.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const bankTransferExpenseSum = bankTransferExpense.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const bankTransferTotal = bankTransferIncomeSum + bankTransferExpenseSum;
    
    this.logger.log('=== DETAILED BANK TRANSFERS BREAKDOWN ===');
    this.logger.log('- Income transactions:', bankTransferIncome.length);
    this.logger.log('- Expense transactions:', bankTransferExpense.length);
    this.logger.log('- Income sum (raw amounts):', bankTransferIncomeSum.toFixed(2));
    this.logger.log('- Expense sum (raw amounts):', bankTransferExpenseSum.toFixed(2));
    this.logger.log('- Total Bank Transfers net:', bankTransferTotal.toFixed(2));
    this.logger.log('- Sample income Bank Transfers:', bankTransferIncome.slice(0, 3).map(t => ({
      amount: t.amount,
      description: t.description?.substring(0, 60) + '...'
    })));
    this.logger.log('- Sample expense Bank Transfers:', bankTransferExpense.slice(0, 3).map(t => ({
      amount: t.amount,
      description: t.description?.substring(0, 60) + '...'
    })));
    
    // TEST: Let's check specific categories we're looking for
    const salaryCategories = transactions.filter(t => 
      t.category?.name && t.category.name.toLowerCase().includes('salary')
    );
    const aleCategories = transactions.filter(t => 
      t.category?.name && t.category.name.toLowerCase().includes('ale')
    );
    const robyCategories = transactions.filter(t => 
      t.category?.name && t.category.name.toLowerCase().includes('roby')
    );
    
    this.logger.debug('Salary categories found:', salaryCategories.length, 
      salaryCategories.map(t => ({ category: t.category?.name, amount: t.amount })).slice(0, 5));
    this.logger.debug('Ale categories found:', aleCategories.length, 
      aleCategories.map(t => ({ category: t.category?.name, amount: t.amount })).slice(0, 5));
    this.logger.debug('Roby categories found:', robyCategories.length, 
      robyCategories.map(t => ({ category: t.category?.name, amount: t.amount })).slice(0, 5));
    
    const totalExpenses = expenses.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
    const totalIncome = income.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
    const netFlow = totalIncome - totalExpenses;
    
    // IMPROVED: Calculate NET by category instead of separate income/expense
    // This gives a more accurate view for mixed categories like Bank Transfers
    const categoryNets: Record<string, { income: number; expense: number; net: number }> = 
      transactions.reduce((acc, t) => {
        const category = t.category?.name || 'Uncategorized';
        const amount = parseFloat(t.amount) || 0;
        
        if (!acc[category]) {
          acc[category] = { income: 0, expense: 0, net: 0 };
        }
        
        if (t.type === 'income') {
          acc[category].income += Math.abs(amount);
        } else {
          acc[category].expense += Math.abs(amount);
        }
        
        // NET = income - expense (positive = net income, negative = net expense)
        acc[category].net = acc[category].income - acc[category].expense;
        
        return acc;
      }, {} as Record<string, { income: number; expense: number; net: number }>);

    this.logger.log('=== CATEGORY NET ANALYSIS ===');
    Object.entries(categoryNets).forEach(([category, data]) => {
      if (Math.abs(data.net) > 1000) { // Only log significant categories
        this.logger.log(`${category}: Income €${data.income.toFixed(2)}, Expense €${data.expense.toFixed(2)}, NET €${data.net.toFixed(2)}`);
      }
    });

    // Separate categories into net expenses and net income
    const netExpenseCategories: Record<string, number> = {};
    const netIncomeCategories: Record<string, number> = {};
    
    Object.entries(categoryNets).forEach(([category, data]) => {
      if (data.net < 0) {
        // Net expense (spent more than received)
        netExpenseCategories[category] = Math.abs(data.net);
      } else if (data.net > 0) {
        // Net income (received more than spent)
        netIncomeCategories[category] = data.net;
      }
      // If net = 0, we ignore it from tops
    });
    
    // DEBUG: Check Bank Transfers NET calculation
    this.logger.log('=== BANK TRANSFERS NET CHECK ===');
    const bankTransfersData = categoryNets['Bank Transfers'];
    if (bankTransfersData) {
      this.logger.log('- Bank Transfers Income:', bankTransfersData.income.toFixed(2));
      this.logger.log('- Bank Transfers Expense:', bankTransfersData.expense.toFixed(2));
      this.logger.log('- Bank Transfers NET:', bankTransfersData.net.toFixed(2));
      this.logger.log('- Classification:', bankTransfersData.net < 0 ? 'Net Expense' : 'Net Income');
    }
    
    // TEST: Log the NET categories we found
    this.logger.debug('Net expense categories found:', Object.keys(netExpenseCategories));
    this.logger.debug('Net income categories found:', Object.keys(netIncomeCategories));
    this.logger.debug('Sample income transactions:', income.slice(0, 3).map(t => ({ 
      category: t.category?.name, 
      amount: t.amount, 
      description: t.description?.substring(0, 50) + '...' 
    })));

    // Top NET expense categories (categories with negative net impact)
    const topExpenseCategories = Object.entries(netExpenseCategories)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 5)
      .map(([name, amount]) => `${name}: €${Number(amount).toFixed(2)}`);

    // Top NET income categories (categories with positive net impact)
    const topIncomeCategories = Object.entries(netIncomeCategories)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3)
      .map(([name, amount]) => `${name}: €${Number(amount).toFixed(2)}`);

    const basePrompt = `
Analizza questi dati finanziari italiani e fornisci insights utili:

DATI FINANZIARI COMPLETI:
- Totale transazioni: ${transactions.length}
- Spese totali: €${totalExpenses.toFixed(2)} (${expenses.length} transazioni)
- Entrate totali: €${totalIncome.toFixed(2)} (${income.length} transazioni)
- Flusso netto: €${netFlow.toFixed(2)} ${netFlow >= 0 ? '(positivo)' : '(negativo)'}

TOP 5 CATEGORIE DI SPESA:
${topExpenseCategories.join(', ')}

TOP 3 CATEGORIE DI ENTRATA:
${topIncomeCategories.join(', ')}

TIPO ANALISI: ${analysisType}
`;

    switch (analysisType) {
      case 'monthly':
        return basePrompt + `
Fornisci un'analisi finanziaria mensile con:
1. Pattern di spesa e entrata principali
2. Raccomandazioni per ottimizzare il budget e il flusso di cassa
3. Avvisi su categorie di spesa elevate o squilibri

IMPORTANTE: Rispondi SOLO con un JSON valido, senza code fences o testo aggiuntivo.

Formato richiesto:
{
  "insights": ["insight1", "insight2", "insight3"],
  "recommendations": ["raccomandazione1", "raccomandazione2", "raccomandazione3"],
  "patterns": ["pattern1", "pattern2", "pattern3"],
  "warnings": ["avviso1", "avviso2"] 
}

Non usare \`\`\` o \`\`\`json. Restituisci solo il JSON puro.`;

      case 'category':
        return basePrompt + `
Fornisci un'analisi per categorie con:
1. Categorie con maggiore spesa vs. maggiori entrate
2. Suggerimenti per ridurre costi in specifiche categorie di spesa
3. Confronto tra categorie essenziali e non essenziali (sia spese che entrate)

IMPORTANTE: Rispondi SOLO con un JSON valido, senza code fences o testo aggiuntivo.

Formato richiesto:
{
  "insights": ["insight1", "insight2", "insight3"],
  "recommendations": ["raccomandazione1", "raccomandazione2", "raccomandazione3"],
  "patterns": ["pattern1", "pattern2", "pattern3"],
  "warnings": ["avviso1", "avviso2"] 
}

Non usare \`\`\` o \`\`\`json. Restituisci solo il JSON puro.`;

      case 'trends':
        return basePrompt + `
Identifica trend finanziari con:
1. Tendenze generali nelle spese e entrate
2. Raccomandazioni per il futuro basate sul flusso di cassa
3. Aree di miglioramento per ottimizzare le finanze

IMPORTANTE: Rispondi SOLO con un JSON valido, senza code fences o testo aggiuntivo.

Formato richiesto:
{
  "insights": ["insight1", "insight2", "insight3"],
  "recommendations": ["raccomandazione1", "raccomandazione2", "raccomandazione3"],
  "patterns": ["pattern1", "pattern2", "pattern3"],
  "warnings": ["avviso1", "avviso2"] 
}

Non usare \`\`\` o \`\`\`json. Restituisci solo il JSON puro.`;

      default:
        return basePrompt + `
Fornisci un'analisi finanziaria generale includendo sia spese che entrate.

IMPORTANTE: Rispondi SOLO con un JSON valido, senza code fences o testo aggiuntivo.

Formato richiesto:
{
  "insights": ["insight1", "insight2", "insight3"],
  "recommendations": ["raccomandazione1", "raccomandazione2", "raccomandazione3"],
  "patterns": ["pattern1", "pattern2", "pattern3"],
  "warnings": ["avviso1", "avviso2"] 
}

Non usare \`\`\` o \`\`\`json. Restituisci solo il JSON puro.`;
    }
  }

  /**
   * Parse AI response safely with improved error handling
   */
  private parseAnalysisResponse(response: string): {
    insights: string[];
    recommendations: string[];
    patterns: string[];
    warnings?: string[];
  } {
    try {
      // Clean the response by removing code fences and extra formatting
      let cleanedResponse = response.trim();
      
      this.logger.debug('Original response:', response);
      
      // Remove code fences if present
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      this.logger.debug('Cleaned response:', cleanedResponse);
      
      // Try to parse as JSON
      const parsed = JSON.parse(cleanedResponse);
      
      this.logger.debug('Parsed JSON:', parsed);
      
      // If the AI returned a different structure, try to adapt it
      if (parsed.analisi_spese || parsed.categories || parsed.analysis) {
        this.logger.debug('Using adaptNonStandardResponse');
        return this.adaptNonStandardResponse(parsed);
      }
      
      // Standard format
      this.logger.debug('Using standard format');
      return {
        insights: Array.isArray(parsed.insights) ? parsed.insights : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : undefined,
      };
    } catch (error) {
      this.logger.warn('Failed to parse AI response as JSON, attempting fallback parsing');
      
      // Enhanced fallback parsing
      const lines = response.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.trim())
        .filter(line => !line.startsWith('{') && !line.startsWith('}') && !line.startsWith('"'));
      
      if (lines.length === 0) {
        return {
          insights: ['Analisi non disponibile al momento'],
          recommendations: ['Riprova più tardi'],
          patterns: ['Dati insufficienti'],
        };
      }
      
      // Split lines into sections
      const third = Math.ceil(lines.length / 3);
      return {
        insights: lines.slice(0, third),
        recommendations: lines.slice(third, third * 2),
        patterns: lines.slice(third * 2),
      };
    }
  }

  /**
   * Adapt non-standard AI response format to our expected format
   */
  private adaptNonStandardResponse(parsed: any): {
    insights: string[];
    recommendations: string[];
    patterns: string[];
    warnings?: string[];
  } {
    const insights: string[] = [];
    const recommendations: string[] = [];
    const patterns: string[] = [];
    const warnings: string[] = [];

    // Try to extract meaningful information from the AI's custom format
    if (parsed.analisi_spese) {
      const analysis = parsed.analisi_spese;
      
      // Extract insights from category analysis
      if (analysis.categorie_maggiore_spesa) {
        Object.entries(analysis.categorie_maggiore_spesa).forEach(([category, data]: [string, any]) => {
          if (data.importo && data.percentuale_totale) {
            insights.push(`${category}: €${data.importo.toFixed(2)} (${data.percentuale_totale}% del totale)`);
          }
        });
      }
      
      // Extract recommendations
      if (analysis.raccomandazioni) {
        recommendations.push(...analysis.raccomandazioni);
      }
      
      // Extract patterns
      if (analysis.pattern) {
        patterns.push(...analysis.pattern);
      }
    }

    return {
      insights: insights.length > 0 ? insights : ['Analisi completata con successo'],
      recommendations: recommendations.length > 0 ? recommendations : ['Continua a monitorare le tue spese'],
      patterns: patterns.length > 0 ? patterns : ['Pattern identificati nei dati'],
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Generate spending summary for a period
   */
  async generateSpendingSummary(
    transactions: any[],
    period: string,
  ): Promise<string> {
    const analysis = await this.analyzeSpendingPatterns(transactions, 0, 'monthly');
    
    const summary = [
      `📊 Riepilogo Spese ${period}`,
      '',
      '💡 Insights Principali:',
      ...analysis.insights.map(insight => `• ${insight}`),
      '',
      '🎯 Raccomandazioni:',
      ...analysis.recommendations.map(rec => `• ${rec}`),
    ];

    if (analysis.warnings && analysis.warnings.length > 0) {
      summary.push('');
      summary.push('⚠️ Avvisi:');
      summary.push(...analysis.warnings.map(warning => `• ${warning}`));
    }

    return summary.join('\n');
  }

  /**
   * Analyze budget with AI for optimization recommendations
   */
  async analyzeBudgetWithAI(
    data: {
      budgetOverview: {
        averageMonthlyIncome: number;
        averageMonthlyExpenses: number;
        averageMonthlyNetFlow: number;
        monthlyBudgetUtilization: number;
        totalAutoSaveNeeded: number;
      };
      categories: Array<{
        name: string;
        budgetLevel: 'primary' | 'secondary' | 'optional';
        currentMonthSpent: number;
        monthlyBudget: number | null;
        averageMonthlySpending: number;
        budgetStatus: 'under' | 'warning' | 'over' | 'no_budget';
        suggestedSavings: number;
      }>;
      period: number;
    },
    userId: number,
  ): Promise<{
    analysis: string;
    budgetHealthScore: number;
    overspendingCategories: Array<{
      category: string;
      currentSpent: number;
      budget: number;
      overspendingAmount: number;
      suggestions: string[];
    }>;
    optimizationTips: Array<{
      category: string;
      tip: string;
      potentialSavings: number;
    }>;
    overallRecommendations: string[];
  }> {
    try {
      const { budgetOverview, categories } = data;

      // Calculate budget health score
      const budgetHealthScore = this.calculateBudgetHealthScore(budgetOverview, categories);

      // Identify overspending categories
      const overspendingCategories = categories
        .filter(cat => cat.budgetStatus === 'over' && cat.monthlyBudget)
        .map(cat => ({
          category: cat.name,
          currentSpent: cat.currentMonthSpent,
          budget: cat.monthlyBudget!,
          overspendingAmount: cat.currentMonthSpent - cat.monthlyBudget!,
          suggestions: [] as string[]
        }));

      // Build AI prompt for budget analysis
      const prompt = this.buildBudgetAnalysisPrompt(budgetOverview, categories, overspendingCategories);

      // Call OpenAI API
      const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Sei un consulente finanziario esperto. Analizza i dati di budget e fornisci consigli pratici e personalizzati per ottimizzare le spese. Rispondi sempre in italiano con un tono professionale ma amichevole.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const aiResponse = await response.json();
      const aiContent = aiResponse.choices[0]?.message?.content || '';

      // Log AI response for debugging
      this.logger.debug('Raw AI Response for budget analysis:', aiContent);

      // Parse AI response
      const parsedResponse = this.parseBudgetAnalysisResponse(aiContent);
      this.logger.debug('Parsed AI Response:', JSON.stringify(parsedResponse, null, 2));

      // Add AI suggestions to overspending categories - Match by category name with fuzzy matching
      overspendingCategories.forEach(cat => {
        const aiSuggestion = parsedResponse.overspendingCategories.find(
          aiCat => aiCat.category && this.matchCategoryNames(aiCat.category, cat.category)
        );
        
        if (aiSuggestion && aiSuggestion.suggestions && aiSuggestion.suggestions.length > 0) {
          cat.suggestions = aiSuggestion.suggestions;
          this.logger.debug(`Matched AI suggestions for ${cat.category}:`, aiSuggestion.suggestions);
        } else {
          // Fallback suggestions if AI didn't provide specific ones
          cat.suggestions = [
            `Monitora più attentamente le spese nella categoria ${cat.category}`,
            'Considera di aumentare il budget o ridurre le spese',
            'Cerca alternative più economiche per questa categoria'
          ];
          this.logger.debug(`Using fallback suggestions for ${cat.category}`);
        }
      });

      return {
        analysis: parsedResponse.analysis,
        budgetHealthScore,
        overspendingCategories,
        optimizationTips: parsedResponse.optimizationTips,
        overallRecommendations: parsedResponse.overallRecommendations,
      };

    } catch (error) {
      this.logger.error('Error in AI budget analysis:', error);
      
      // Return fallback analysis
      return this.getFallbackBudgetAnalysis(data);
    }
  }

  /**
   * Calculate budget health score (0-100) - More balanced calculation
   */
  private calculateBudgetHealthScore(
    budgetOverview: any,
    categories: any[]
  ): number {
    let score = 100;

    // More balanced deduction for budget utilization
    const utilization = budgetOverview.monthlyBudgetUtilization || 0;
    if (utilization > 110) {
      score -= 25;
    } else if (utilization > 100) {
      score -= 15;
    } else if (utilization > 90) {
      score -= 10;
    } else if (utilization > 80) {
      score -= 5;
    }

    // Deduct points for negative net flow (less punitive)
    if (budgetOverview.averageMonthlyNetFlow < 0) {
      score -= 20;
    } else if (budgetOverview.averageMonthlyNetFlow < budgetOverview.averageMonthlyIncome * 0.1) {
      score -= 5; // Less than 10% savings rate
    }

    // More balanced deduction for overspending categories
    const overspendingCount = categories.filter(c => c.budgetStatus === 'over').length;
    const totalCategories = categories.length;
    const overspendingRatio = totalCategories > 0 ? overspendingCount / totalCategories : 0;
    
    if (overspendingRatio > 0.5) {
      score -= 20; // More than 50% categories overspending
    } else if (overspendingRatio > 0.3) {
      score -= 15; // More than 30% categories overspending
    } else if (overspendingRatio > 0.1) {
      score -= 10; // More than 10% categories overspending
    } else {
      score -= overspendingCount * 2; // Small penalty per category
    }

    // Bonus for positive financial management
    if (budgetOverview.averageMonthlyNetFlow > budgetOverview.averageMonthlyIncome * 0.15) {
      score += 5; // Good savings rate
    }

    return Math.max(15, Math.min(100, score)); // Minimum score of 15, not 0
  }

  /**
   * Match category names with fuzzy logic to handle AI response variations
   */
  private matchCategoryNames(aiCategory: string, ourCategory: string): boolean {
    if (!aiCategory || !ourCategory) return false;
    
    // Normalize strings: lowercase, remove spaces, slashes, and special characters
    const normalize = (str: string) => str.toLowerCase()
      .replace(/[\/\-\s&]+/g, '')
      .replace(/[^\w]/g, '');
    
    const normalizedAi = normalize(aiCategory);
    const normalizedOur = normalize(ourCategory);
    
    // Exact match after normalization
    if (normalizedAi === normalizedOur) return true;
    
    // Check if one contains the other (for cases like "Books" vs "Books / Media")
    if (normalizedAi.includes(normalizedOur) || normalizedOur.includes(normalizedAi)) return true;
    
    // Check similarity for common variations
    const similarityThreshold = 0.8;
    const similarity = this.calculateStringSimilarity(normalizedAi, normalizedOur);
    
    return similarity >= similarityThreshold;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;
    
    const distance = this.levenshteinDistance(str1, str2);
    return (maxLength - distance) / maxLength;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator  // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Build AI prompt for budget analysis
   */
  private buildBudgetAnalysisPrompt(
    budgetOverview: any,
    categories: any[],
    overspendingCategories: any[]
  ): string {
    // Format enriched categories data
    const categoriesDataFormatted = categories.map(cat => {
      const statusIcon = cat.budgetStatus === 'over' ? '🔴' : cat.budgetStatus === 'warning' ? '🟡' : '🟢';
      return `- ${cat.name} (${cat.budgetLevel}):
  * Mese corrente: €${cat.currentMonthSpent} / €${cat.monthlyBudget} (${cat.percentage}%) ${statusIcon}
  * Rimanente: €${cat.remaining}
  * Proiezione fine mese: €${cat.projectedSpend} (${cat.projectedPercentage}%)
  * Rolling 12M: €${cat.rolling12MSpent} / €${cat.rolling12MBudget} (${cat.rolling12MPercentage}%)
  * Media mensile: €${cat.averageMonthlySpending}`;
    }).join('\n\n');

    // Calculate statistics
    const overspendingCount = categories.filter(c => c.budgetStatus === 'over').length;
    const warningCount = categories.filter(c => c.budgetStatus === 'warning').length;
    const underBudgetCount = categories.filter(c => c.budgetStatus === 'under').length;
    const total12MBudget = categories.reduce((sum, c) => sum + (c.rolling12MBudget || 0), 0);
    const total12MSpent = categories.reduce((sum, c) => sum + (c.rolling12MSpent || 0), 0);

    return `
Analizza questo budget personale e fornisci consigli di ottimizzazione:

PANORAMICA FINANZIARIA:
- Entrata media mensile: €${budgetOverview.averageMonthlyIncome}
- Spesa media mensile: €${budgetOverview.averageMonthlyExpenses}
- Flusso netto mensile: €${budgetOverview.averageMonthlyNetFlow}
- Utilizzo budget corretto: ${Math.round(budgetOverview.monthlyBudgetUtilization * 10) / 10}%
- Budget totale configurato: €${budgetOverview.totalConfiguredBudget}
- Spesa media su categorie con budget: €${Math.round(budgetOverview.totalCurrentSpent)}
- Giorni rimanenti nel mese: ${budgetOverview.daysRemaining}

BREAKDOWN PER LIVELLO:
- Primary (€${budgetOverview.primaryBudgetConfigured || 0} budget): €${Math.round(budgetOverview.primaryCurrentSpent || 0)} spesa media
- Secondary (€${budgetOverview.secondaryBudgetConfigured || 0} budget): €${Math.round(budgetOverview.secondaryCurrentSpent || 0)} spesa media  
- Optional (€${budgetOverview.optionalBudgetConfigured || 0} budget): €${Math.round(budgetOverview.optionalCurrentSpent || 0)} spesa media

DETTAGLIO CATEGORIE CON BUDGET (ordinate per criticità):
${categoriesDataFormatted}

STATISTICHE RAPIDE:
- Categorie in sforamento: ${overspendingCount}
- Categorie in warning: ${warningCount}
- Categorie sotto budget: ${underBudgetCount}

ANALISI ROLLING 12M:
- Budget 12M totale: €${total12MBudget}
- Spesa 12M proiettata: €${total12MSpent}

Per favore fornisci:
1. Un'analisi generale della situazione finanziaria considerando sia il mese corrente che la proiezione 12M
2. Consigli specifici per le categorie più critiche (in sforamento o con proiezioni negative)
3. Suggerimenti di ottimizzazione per categorie con potenziali risparmi
4. Raccomandazioni generali per migliorare la gestione del budget a breve e lungo termine

IMPORTANTE: Rispondi SOLO con un JSON valido nel seguente formato:
{
  "analysis": "Analisi generale della situazione finanziaria (2-3 frasi che considerino sia il mese corrente che la proiezione annuale)",
  "overspendingCategories": [
    {
      "category": "Nome categoria",
      "suggestions": ["suggerimento1", "suggerimento2"]
    }
  ],
  "optimizationTips": [
    {
      "category": "Nome categoria",
      "tip": "Consiglio specifico con dettagli sui potenziali risparmi",
      "potentialSavings": 50
    }
  ],
  "overallRecommendations": [
    "Raccomandazione generale 1",
    "Raccomandazione generale 2",
    "Raccomandazione generale 3"
  ]
}

Non usare code fences o testo aggiuntivo, solo JSON puro.
`;
  }

  /**
   * Parse AI budget analysis response
   */
  private parseBudgetAnalysisResponse(response: string): {
    analysis: string;
    overspendingCategories: Array<{
      category: string;
      suggestions: string[];
    }>;
    optimizationTips: Array<{
      category: string;
      tip: string;
      potentialSavings: number;
    }>;
    overallRecommendations: string[];
  } {
    try {
      let cleanedResponse = response.trim();
      
      // Remove code fences if present
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const parsed = JSON.parse(cleanedResponse);
      
      return {
        analysis: parsed.analysis || 'Analisi completata',
        overspendingCategories: Array.isArray(parsed.overspendingCategories) ? parsed.overspendingCategories : [],
        optimizationTips: Array.isArray(parsed.optimizationTips) ? parsed.optimizationTips : [],
        overallRecommendations: Array.isArray(parsed.overallRecommendations) ? parsed.overallRecommendations : [],
      };
    } catch (error) {
      this.logger.warn('Failed to parse AI budget analysis response');
      return {
        analysis: 'Analisi del budget completata. Controlla le categorie in sforamento e considera di ottimizzare le spese.',
        overspendingCategories: [],
        optimizationTips: [],
        overallRecommendations: [
          'Monitora regolarmente le tue spese',
          'Imposta budget realistici per ogni categoria',
          'Cerca di aumentare il tuo tasso di risparmio'
        ],
      };
    }
  }

  /**
   * Fallback budget analysis when AI fails
   */
  private getFallbackBudgetAnalysis(data: any): {
    analysis: string;
    budgetHealthScore: number;
    overspendingCategories: any[];
    optimizationTips: any[];
    overallRecommendations: string[];
  } {
    const { budgetOverview, categories } = data;
    const budgetHealthScore = this.calculateBudgetHealthScore(budgetOverview, categories);
    
    const overspendingCategories = categories
      .filter(cat => cat.budgetStatus === 'over' && cat.monthlyBudget)
      .map(cat => ({
        category: cat.name,
        currentSpent: cat.currentMonthSpent,
        budget: cat.monthlyBudget,
        overspendingAmount: cat.currentMonthSpent - cat.monthlyBudget,
        suggestions: [
          'Monitora più attentamente le spese in questa categoria',
          'Considera di aumentare il budget o ridurre le spese',
          'Cerca alternative più economiche'
        ]
      }));

    return {
      analysis: budgetHealthScore >= 70 
        ? 'Il tuo budget è in buone condizioni, ma ci sono sempre margini di miglioramento.'
        : 'Il tuo budget necessita di alcune ottimizzazioni per migliorare la situazione finanziaria.',
      budgetHealthScore,
      overspendingCategories,
      optimizationTips: [
        {
          category: 'Generale',
          tip: 'Rivedi periodicamente i tuoi budget e adattali alle tue esigenze',
          potentialSavings: 100
        }
      ],
      overallRecommendations: [
        'Monitora regolarmente le tue spese',
        'Imposta budget realistici per ogni categoria',
        'Cerca di aumentare il tuo tasso di risparmio'
      ],
    };
  }
} 