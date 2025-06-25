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
import { AiCategorizationService } from './ai-categorization.service';

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
    private readonly aiCategorizationService: AiCategorizationService,
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

  @Post('ai-suggest')
  @ApiOperation({ summary: 'Get AI-powered category suggestion' })
  @ApiResponse({
    status: 200,
    description: 'AI category suggestion',
  })
  async getAISuggestion(
    @Body()
    dto: { description: string; amount: number; type: 'income' | 'expense' },
    @CurrentUser() user: User,
  ) {
    return this.aiCategorizationService.suggestCategoryWithAI(
      dto.description,
      dto.amount,
      user.id,
      dto.type,
    );
  }
}
