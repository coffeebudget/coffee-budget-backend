import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../auth/user.decorator';
import { SuggestionGeneratorService } from '../services/suggestion-generator.service';
import {
  GenerateSuggestionsDto,
  GenerateSuggestionsResponseDto,
  SuggestionListResponseDto,
  SuggestionResponseDto,
  ApproveSuggestionDto,
  RejectSuggestionDto,
  BulkActionDto,
  ApprovalResultDto,
  BulkActionResultDto,
  ApiUsageStatsDto,
} from '../dto/suggestion.dto';
import { SuggestionStatus } from '../entities/expense-plan-suggestion.entity';
import { PatternClassificationService } from '../services/pattern-classification.service';

@ApiTags('Expense Plan Suggestions')
@ApiBearerAuth()
@Controller('expense-plan-suggestions')
@UseGuards(AuthGuard('jwt'))
export class ExpensePlanSuggestionsController {
  constructor(
    private readonly suggestionGenerator: SuggestionGeneratorService,
    private readonly patternClassification: PatternClassificationService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('generate')
  @ApiOperation({
    summary: 'Generate expense plan suggestions',
    description:
      'Analyzes transaction history to detect recurring patterns and generate ' +
      'AI-classified expense plan suggestions. Uses caching to minimize API costs.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Suggestions generated successfully',
    type: GenerateSuggestionsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async generateSuggestions(
    @Body() dto: GenerateSuggestionsDto,
    @CurrentUser() user: any,
  ): Promise<GenerateSuggestionsResponseDto> {
    return this.suggestionGenerator.generateSuggestions(user.id, dto);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LISTING & RETRIEVAL
  // ═══════════════════════════════════════════════════════════════════════════

  @Get()
  @ApiOperation({
    summary: 'Get all suggestions',
    description:
      'Retrieve all expense plan suggestions for the authenticated user',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'approved', 'rejected', 'expired'],
    description: 'Filter by status',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Suggestions retrieved successfully',
    type: SuggestionListResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getSuggestions(
    @CurrentUser() user: any,
    @Query('status') status?: SuggestionStatus,
  ): Promise<SuggestionListResponseDto> {
    return this.suggestionGenerator.getSuggestions(user.id, status);
  }

  @Get('pending')
  @ApiOperation({
    summary: 'Get pending suggestions',
    description: 'Retrieve only pending suggestions awaiting user review',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pending suggestions retrieved successfully',
    type: SuggestionListResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getPendingSuggestions(
    @CurrentUser() user: any,
  ): Promise<SuggestionListResponseDto> {
    return this.suggestionGenerator.getSuggestions(user.id, 'pending');
  }

  @Get('api-usage')
  @ApiOperation({
    summary: 'Get API usage statistics',
    description: 'Get current OpenAI API usage for cost monitoring',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'API usage statistics retrieved',
    type: ApiUsageStatsDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getApiUsage(): Promise<ApiUsageStatsDto> {
    const stats = this.patternClassification.getApiUsageStats();
    return {
      dailyApiCalls: stats.dailyApiCalls,
      maxDailyApiCalls: stats.maxDailyApiCalls,
      remainingCalls: stats.remainingCalls,
      cacheSize: stats.cacheSize,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a specific suggestion',
    description: 'Retrieve detailed information for a single suggestion',
  })
  @ApiParam({
    name: 'id',
    description: 'Suggestion ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Suggestion retrieved successfully',
    type: SuggestionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Suggestion not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getSuggestion(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<SuggestionResponseDto> {
    const suggestion = await this.suggestionGenerator.getSuggestionById(
      user.id,
      id,
    );
    if (!suggestion) {
      throw new NotFoundException(`Suggestion with ID ${id} not found`);
    }
    return suggestion;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPROVAL & REJECTION
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve a suggestion',
    description:
      'Approve a suggestion and create an expense plan from it. ' +
      'Optionally provide custom name, amount, or category.',
  })
  @ApiParam({
    name: 'id',
    description: 'Suggestion ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Suggestion approved and expense plan created',
    type: ApprovalResultDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Suggestion not found or already processed',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async approveSuggestion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveSuggestionDto,
    @CurrentUser() user: any,
  ): Promise<ApprovalResultDto> {
    return this.suggestionGenerator.approveSuggestion(user.id, id, dto);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject a suggestion',
    description: 'Reject a suggestion with optional reason',
  })
  @ApiParam({
    name: 'id',
    description: 'Suggestion ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Suggestion rejected',
    type: ApprovalResultDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Suggestion not found or already processed',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async rejectSuggestion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectSuggestionDto,
    @CurrentUser() user: any,
  ): Promise<ApprovalResultDto> {
    return this.suggestionGenerator.rejectSuggestion(user.id, id, dto);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BULK OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('bulk-approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk approve suggestions',
    description: 'Approve multiple suggestions at once',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bulk approval completed',
    type: BulkActionResultDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async bulkApprove(
    @Body() dto: BulkActionDto,
    @CurrentUser() user: any,
  ): Promise<BulkActionResultDto> {
    return this.suggestionGenerator.bulkApprove(user.id, dto.suggestionIds);
  }

  @Post('bulk-reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk reject suggestions',
    description: 'Reject multiple suggestions at once',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bulk rejection completed',
    type: BulkActionResultDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async bulkReject(
    @Body() dto: BulkActionDto,
    @CurrentUser() user: any,
  ): Promise<BulkActionResultDto> {
    return this.suggestionGenerator.bulkReject(user.id, dto.suggestionIds);
  }
}
