import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';
import {
  ApiTags,
  ApiBearerAuth,
  ApiResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/user.decorator';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { KeywordExtractionService } from './keyword-extraction.service';
import { DefaultCategoriesService } from './default-categories.service';

import { KeywordStatsService } from './keyword-stats.service';
import { ExpenseAnalysisService } from './expense-analysis.service';
import { BudgetManagementService, BudgetSummary, CategorySpending } from './budget-management.service';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
@UseGuards(AuthGuard('jwt')) // ✅ Secure all endpoints with Auth0 authentication
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly keywordExtractionService: KeywordExtractionService,
    private readonly defaultCategoriesService: DefaultCategoriesService,
    private readonly keywordStatsService: KeywordStatsService,
    private readonly expenseAnalysisService: ExpenseAnalysisService,
    private readonly budgetManagementService: BudgetManagementService,
  ) {}

  @Post()
  @ApiResponse({ status: 201, description: 'Create a new category.' })
  create(
    @Body() createCategoryDto: CreateCategoryDto,
    @CurrentUser() user: User,
  ): Promise<Category> {
    return this.categoriesService.create(createCategoryDto, user);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Retrieve all categories.' })
  findAll(@CurrentUser() user: User): Promise<Category[]> {
    return this.categoriesService.findAll(user.id);
  }

  @Post('suggest')
  @ApiOperation({
    summary: 'Suggest a category based on transaction description',
  })
  async suggestCategory(
    @Body('description') description: string,
    @CurrentUser() user: User,
  ): Promise<{ category: Category | null }> {
    const category = await this.categoriesService.suggestCategoryForDescription(
      description,
      user.id,
    );
    return { category };
  }

  @Get('uncategorized-transactions')
  @ApiOperation({ summary: 'Get uncategorized transactions' })
  async getUncategorizedTransactions(
    @CurrentUser() user: User,
  ): Promise<Transaction[]> {
    return this.categoriesService.findUncategorizedTransactions(user.id);
  }

  @Get('common-keywords')
  @ApiOperation({
    summary: 'Find common keywords in uncategorized transactions',
  })
  async getCommonKeywords(
    @CurrentUser() user: User,
  ): Promise<Record<string, number>> {
    return this.keywordExtractionService.findCommonKeywordsInUncategorized(
      user.id,
    );
  }

  @Post('bulk-categorize')
  @ApiOperation({ summary: 'Bulk categorize transactions by keyword' })
  async bulkCategorize(
    @Body('keyword') keyword: string,
    @Body('categoryId') categoryId: number,
    @CurrentUser() user: User,
  ): Promise<{ count: number }> {
    const count = await this.categoriesService.bulkCategorizeByKeyword(
      keyword,
      categoryId,
      user.id,
    );
    return { count };
  }

  @Post('reset-to-defaults')
  async resetToDefaults(
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    await this.defaultCategoriesService.resetCategoriesToDefaults(user);
    return { message: 'Categories have been reset to defaults' };
  }

  @Get('budget-summary')
  @ApiOperation({ 
    summary: 'Get intelligent budget summary',
    description: 'Get budget status, savings recommendations, and category-level insights' 
  })
  @ApiResponse({
    status: 200,
    description: 'Budget summary retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalAutoSaveNeeded: { type: 'number' },
        primaryCategoriesData: { 
          type: 'array',
          items: { type: 'object' }
        },
        secondaryWarnings: { 
          type: 'array',
          items: { type: 'object' }
        },
        optionalSuggestions: { 
          type: 'array',
          items: { type: 'object' }
        },
        monthlyBudgetUtilization: { type: 'number' }
      }
    }
  })
  async getBudgetSummary(@CurrentUser() user: User): Promise<BudgetSummary> {
    return this.budgetManagementService.getBudgetSummary(user.id);
  }

  @Get('budget-categories')
  @ApiOperation({ 
    summary: 'Get all categories with spending data for budget management',
    description: 'Get all categories with their spending statistics, ordered by net flow (same as Annual Savings Plan)' 
  })
  @ApiResponse({
    status: 200,
    description: 'Categories with spending data retrieved successfully',
    type: 'array',
    schema: {
      type: 'array',
      items: { type: 'object' }
    }
  })
  async getAllCategoriesWithSpendingData(@CurrentUser() user: User): Promise<CategorySpending[]> {
    return this.budgetManagementService.getAllCategoriesWithSpendingData(user.id);
  }

  @Get(':id/transactions')
  @ApiOperation({ 
    summary: 'Get transactions for a category with summary statistics',
    description: 'Get all transactions for a specific category in the last N months with financial summary' 
  })
  @ApiResponse({
    status: 200,
    description: 'Category transactions retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        transactions: {
          type: 'array',
          items: { type: 'object' }
        },
        summary: {
          type: 'object',
          properties: {
            totalIncome: { type: 'number' },
            totalExpenses: { type: 'number' },
            netFlow: { type: 'number' },
            transactionCount: { type: 'number' },
            averageMonthlyIncome: { type: 'number' },
            averageMonthlyExpenses: { type: 'number' },
            averageMonthlyNetFlow: { type: 'number' }
          }
        }
      }
    }
  })
  async getCategoryTransactions(
    @Param('id', ParseIntPipe) id: number,
    @Query('months', new ParseIntPipe({ optional: true })) months: number = 12,
    @CurrentUser() user: User,
  ) {
    return this.budgetManagementService.getCategoryTransactions(user.id, id, months);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Retrieve a category by ID.' })
  findOne(
    @Param('id') id: number,
    @CurrentUser() user: User,
  ): Promise<Category> {
    return this.categoriesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, description: 'Update a category.' })
  update(
    @Param('id') id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @CurrentUser() user: User,
  ): Promise<Category> {
    return this.categoriesService.update(id, updateCategoryDto, user.id);
  }

  @Delete(':id')
  @ApiResponse({ status: 204, description: 'Delete a category.' })
  remove(@Param('id') id: number, @CurrentUser() user: User): Promise<void> {
    return this.categoriesService.remove(id, user.id);
  }

  @Get(':id/suggested-keywords')
  @ApiOperation({
    summary:
      'Get suggested keywords for a category based on existing transactions',
  })
  async getSuggestedKeywords(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<string[]> {
    return this.categoriesService.suggestKeywordsForCategory(id, user.id);
  }

  @Post(':id/keywords')
  @ApiOperation({ summary: 'Add a keyword to a category' })
  async addKeyword(
    @Param('id', ParseIntPipe) id: number,
    @Body('keyword') keyword: string,
    @CurrentUser() user: User,
  ): Promise<Category> {
    return this.categoriesService.addKeywordToCategory(id, keyword, user.id);
  }

  @Delete(':id/keywords/:keyword')
  @ApiOperation({ summary: 'Remove a keyword from a category' })
  async removeKeyword(
    @Param('id', ParseIntPipe) id: number,
    @Param('keyword') keyword: string,
    @CurrentUser() user: User,
  ): Promise<Category> {
    return this.categoriesService.removeKeywordFromCategory(
      id,
      keyword,
      user.id,
    );
  }

  // Add to CategoriesController
  @Post(':id/learn-from-transaction')
  @ApiOperation({ summary: 'Learn keywords from a transaction' })
  async learnFromTransaction(
    @Param('id', ParseIntPipe) categoryId: number,
    @Body('transactionId', ParseIntPipe) transactionId: number,
    @CurrentUser() user: User,
  ): Promise<Category> {
    return this.categoriesService.learnKeywordsFromTransaction(
      categoryId,
      transactionId,
      user.id,
    );
  }

  @Get(':id/preview-keyword-impact')
  @ApiOperation({
    summary: 'Preview the impact of adding a keyword to a category',
  })
  async previewKeywordImpact(
    @Param('id', ParseIntPipe) categoryId: number,
    @Query('keyword') keyword: string,
    @Query('onlyUncategorized') onlyUncategorized: boolean = false,
    @CurrentUser() user: User,
  ) {
    // First check if the category exists
    await this.categoriesService.findOne(categoryId, user.id);

    // Then find transactions that would be affected
    const { transactions, categoryCounts } =
      await this.categoriesService.findTransactionsMatchingKeyword(
        keyword,
        user.id,
        onlyUncategorized,
      );

    // Return preview data
    return {
      categoryId,
      keyword,
      totalAffected: transactions.length,
      categoryCounts,
      // Return a sample of transactions for preview (limit to 10)
      sampleTransactions: transactions.slice(0, 10).map((t) => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        executionDate: t.executionDate,
        currentCategory: t.category ? t.category.name : 'Uncategorized',
      })),
    };
  }

  @Post(':id/apply-keyword')
  @ApiOperation({
    summary:
      'Apply a keyword to a category and optionally update existing transactions',
  })
  async applyKeyword(
    @Param('id', ParseIntPipe) categoryId: number,
    @Body('keyword') keyword: string,
    @Body('applyTo')
    applyTo: 'none' | 'uncategorized' | 'all' | string[] = 'none',
    @CurrentUser() user: User,
  ) {
    return this.categoriesService.applyKeywordToCategory(
      categoryId,
      keyword,
      user.id,
      applyTo,
    );
  }

  @Get('keyword-stats')
  @ApiOperation({ summary: 'Get keyword usage statistics' })
  async getKeywordStats(@CurrentUser() user: User) {
    return this.keywordStatsService.getPopularKeywords(user.id);
  }

  @Get('keyword-success-rates')
  @ApiOperation({ summary: 'Get keyword success rates for categorization' })
  async getKeywordSuccessRates(
    @CurrentUser() user: User,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 20,
  ) {
    return this.keywordStatsService.getTopKeywordsByCategorySuccess(
      user.id,
      limit,
    );
  }

  @Post('analyze-expenses')
  @ApiOperation({ 
    summary: 'Analyze spending patterns using AI',
    description: 'Generate insights and recommendations based on spending data' 
  })
  @ApiResponse({
    status: 200,
    description: 'Expense analysis completed',
    schema: {
      type: 'object',
      properties: {
        insights: {
          type: 'array',
          items: { type: 'string' }
        },
        recommendations: {
          type: 'array', 
          items: { type: 'string' }
        },
        patterns: {
          type: 'array',
          items: { type: 'string' }
        },
        warnings: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    }
  })
  async analyzeExpenses(
    @Body() dto: { 
      transactions: Transaction[];
      analysisType?: 'monthly' | 'category' | 'trends';
    },
    @CurrentUser() user: User,
  ) {
    return this.expenseAnalysisService.analyzeSpendingPatterns(
      dto.transactions,
      user.id,
      dto.analysisType || 'monthly',
    );
  }

  @Post('spending-summary')
  @ApiOperation({ 
    summary: 'Generate spending summary for a period',
    description: 'Create a comprehensive spending summary with AI insights' 
  })
  @ApiResponse({
    status: 200,
    description: 'Spending summary generated',
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' }
      }
    }
  })
  async generateSpendingSummary(
    @Body() dto: { 
      transactions: Transaction[];
      period: string;
    },
    @CurrentUser() user: User,
  ) {
    const summary = await this.expenseAnalysisService.generateSpendingSummary(
      dto.transactions,
      dto.period,
    );
    return { summary };
  }

  @Post('ai-budget-analysis')
  @ApiOperation({ 
    summary: 'Analyze budget and spending patterns with AI recommendations',
    description: 'Provide personalized budget optimization suggestions based on categories and spending data' 
  })
  @ApiResponse({
    status: 200,
    description: 'Budget analysis completed',
    schema: {
      type: 'object',
      properties: {
        analysis: { type: 'string' },
        budgetHealthScore: { type: 'number' },
        overspendingCategories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              currentSpent: { type: 'number' },
              budget: { type: 'number' },
              overspendingAmount: { type: 'number' },
              suggestions: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        optimizationTips: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              tip: { type: 'string' },
              potentialSavings: { type: 'number' }
            }
          }
        },
        overallRecommendations: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    }
  })
  async analyzeBudgetWithAI(
    @Body() dto: { 
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
    @CurrentUser() user: User,
  ) {
    return this.expenseAnalysisService.analyzeBudgetWithAI(dto, user.id);
  }

}
