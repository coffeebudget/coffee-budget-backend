import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
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
import { CurrentUser } from '../auth/user.decorator';
import { IncomePlansService } from './income-plans.service';
import { TransferSuggestionsService } from './transfer-suggestions.service';
import {
  CreateIncomePlanDto,
  UpdateIncomePlanDto,
  MonthlySummaryDto,
  AnnualSummaryDto,
  CreateIncomePlanEntryDto,
  UpdateIncomePlanEntryDto,
  LinkTransactionToIncomePlanDto,
  IncomePlanEntryResponseDto,
  IncomePlanTrackingSummaryDto,
  MonthlyTrackingSummaryDto,
  AnnualTrackingSummaryDto,
  TransactionSuggestionsResponseDto,
  TransferSuggestionsResponseDto,
} from './dto';
import { IncomePlan } from './entities/income-plan.entity';

@ApiTags('Income Plans')
@ApiBearerAuth()
@Controller('income-plans')
@UseGuards(AuthGuard('jwt'))
export class IncomePlansController {
  constructor(
    private readonly incomePlansService: IncomePlansService,
    private readonly transferSuggestionsService: TransferSuggestionsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CRUD OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  @Post()
  @ApiOperation({
    summary: 'Create a new income plan',
    description:
      'Create a new income plan with monthly calendar for tracking expected income',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Income plan created successfully',
    type: IncomePlan,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid income plan data',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async create(
    @Body() createDto: CreateIncomePlanDto,
    @CurrentUser() user: any,
  ): Promise<IncomePlan> {
    return this.incomePlansService.create(user.id, createDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all income plans',
    description: 'Retrieve all income plans for the authenticated user',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'paused', 'archived', 'all'],
    description: 'Filter by status (defaults to all)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Income plans retrieved successfully',
    type: [IncomePlan],
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async findAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
  ): Promise<IncomePlan[]> {
    if (status === 'active') {
      return this.incomePlansService.findActiveByUser(user.id);
    }
    return this.incomePlansService.findAllByUser(user.id);
  }

  @Get('summary/monthly')
  @ApiOperation({
    summary: 'Get monthly income summary',
    description:
      'Get income summary for a specific month, grouped by reliability for budget calculation',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    description: 'Year (defaults to current year)',
    type: Number,
  })
  @ApiQuery({
    name: 'month',
    required: false,
    description: 'Month 1-12 (defaults to current month)',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Monthly summary retrieved successfully',
    type: MonthlySummaryDto,
  })
  async getMonthlySummary(
    @CurrentUser() user: any,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ): Promise<MonthlySummaryDto> {
    const now = new Date();
    const targetYear = year ? parseInt(year, 10) : now.getFullYear();
    const targetMonth = month ? parseInt(month, 10) : now.getMonth() + 1;

    return this.incomePlansService.getMonthlySummary(
      user.id,
      targetYear,
      targetMonth,
    );
  }

  @Get('summary/annual')
  @ApiOperation({
    summary: 'Get annual income summary',
    description: 'Get annual income summary for year-over-year planning',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    description: 'Year (defaults to current year)',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Annual summary retrieved successfully',
    type: AnnualSummaryDto,
  })
  async getAnnualSummary(
    @CurrentUser() user: any,
    @Query('year') year?: string,
  ): Promise<AnnualSummaryDto> {
    const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.incomePlansService.getAnnualSummary(user.id, targetYear);
  }

  @Get('transfer-suggestions')
  @ApiOperation({
    summary: 'Get transfer suggestions for income accounts',
    description:
      'Calculate how much money to transfer from income-receiving accounts based on expense plan obligations',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    description: 'Year (defaults to current year)',
    type: Number,
  })
  @ApiQuery({
    name: 'month',
    required: false,
    description: 'Month 1-12 (defaults to current month)',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transfer suggestions calculated successfully',
  })
  async getTransferSuggestions(
    @CurrentUser() user: any,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ): Promise<TransferSuggestionsResponseDto> {
    const now = new Date();
    const targetYear = year ? parseInt(year, 10) : now.getFullYear();
    const targetMonth = month ? parseInt(month, 10) : now.getMonth() + 1;

    return this.transferSuggestionsService.calculateTransferSuggestions(
      user.id,
      targetYear,
      targetMonth,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single income plan',
    description: 'Retrieve details for a specific income plan',
  })
  @ApiParam({
    name: 'id',
    description: 'Income plan ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Income plan retrieved successfully',
    type: IncomePlan,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Income plan not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<IncomePlan> {
    return this.incomePlansService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an income plan',
    description: 'Update an existing income plan',
  })
  @ApiParam({
    name: 'id',
    description: 'Income plan ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Income plan updated successfully',
    type: IncomePlan,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Income plan not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid update data',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateIncomePlanDto,
    @CurrentUser() user: any,
  ): Promise<IncomePlan> {
    return this.incomePlansService.update(id, user.id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an income plan',
    description: 'Permanently delete an income plan',
  })
  @ApiParam({
    name: 'id',
    description: 'Income plan ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Income plan deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Income plan not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<void> {
    return this.incomePlansService.delete(id, user.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACKING: ENTRY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/entries')
  @ApiOperation({
    summary: 'Record actual income received',
    description:
      'Create or update an entry tracking actual income received for a month',
  })
  @ApiParam({
    name: 'id',
    description: 'Income plan ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Entry created/updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Income plan not found',
  })
  async createEntry(
    @Param('id', ParseIntPipe) id: number,
    @Body() createDto: CreateIncomePlanEntryDto,
    @CurrentUser() user: any,
  ): Promise<IncomePlanEntryResponseDto> {
    return this.incomePlansService.createOrUpdateEntry(id, user.id, createDto);
  }

  @Get(':id/entries')
  @ApiOperation({
    summary: 'Get all entries for an income plan',
    description: 'Retrieve all tracking entries for a specific income plan',
  })
  @ApiParam({
    name: 'id',
    description: 'Income plan ID',
    type: Number,
  })
  @ApiQuery({
    name: 'year',
    required: false,
    description: 'Filter by year',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Entries retrieved successfully',
  })
  async getEntries(
    @Param('id', ParseIntPipe) id: number,
    @Query('year') year: string,
    @CurrentUser() user: any,
  ): Promise<IncomePlanEntryResponseDto[]> {
    const yearNum = year ? parseInt(year, 10) : undefined;
    return this.incomePlansService.getEntriesForPlan(id, user.id, yearNum);
  }

  @Get(':id/entries/:year/:month')
  @ApiOperation({
    summary: 'Get entry for a specific month',
    description: 'Retrieve the tracking entry for a specific month',
  })
  @ApiParam({ name: 'id', description: 'Income plan ID', type: Number })
  @ApiParam({ name: 'year', description: 'Year', type: Number })
  @ApiParam({ name: 'month', description: 'Month (1-12)', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Entry retrieved successfully',
  })
  async getEntryForMonth(
    @Param('id', ParseIntPipe) id: number,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @CurrentUser() user: any,
  ): Promise<IncomePlanEntryResponseDto | null> {
    return this.incomePlansService.getEntryForMonth(id, user.id, year, month);
  }

  @Patch(':id/entries/:entryId')
  @ApiOperation({
    summary: 'Update an entry',
    description: 'Update an existing tracking entry',
  })
  @ApiParam({ name: 'id', description: 'Income plan ID', type: Number })
  @ApiParam({ name: 'entryId', description: 'Entry ID', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Entry updated successfully',
  })
  async updateEntry(
    @Param('id', ParseIntPipe) id: number,
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body() updateDto: UpdateIncomePlanEntryDto,
    @CurrentUser() user: any,
  ): Promise<IncomePlanEntryResponseDto> {
    return this.incomePlansService.updateEntry(entryId, id, user.id, updateDto);
  }

  @Delete(':id/entries/:entryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an entry',
    description: 'Delete a tracking entry',
  })
  @ApiParam({ name: 'id', description: 'Income plan ID', type: Number })
  @ApiParam({ name: 'entryId', description: 'Entry ID', type: Number })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Entry deleted successfully',
  })
  async deleteEntry(
    @Param('id', ParseIntPipe) id: number,
    @Param('entryId', ParseIntPipe) entryId: number,
    @CurrentUser() user: any,
  ): Promise<void> {
    return this.incomePlansService.deleteEntry(entryId, id, user.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACKING: TRANSACTION SUGGESTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get(':id/suggest-transactions/:year/:month')
  @ApiOperation({
    summary: 'Get suggested transactions for linking',
    description:
      'Find income transactions that match this income plan for a specific month. ' +
      'Suggestions are scored based on category match, amount similarity, and date proximity.',
  })
  @ApiParam({ name: 'id', description: 'Income plan ID', type: Number })
  @ApiParam({ name: 'year', description: 'Year', type: Number })
  @ApiParam({ name: 'month', description: 'Month (1-12)', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction suggestions retrieved successfully',
  })
  async suggestTransactions(
    @Param('id', ParseIntPipe) id: number,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @CurrentUser() user: any,
  ): Promise<TransactionSuggestionsResponseDto> {
    return this.incomePlansService.suggestTransactions(
      id,
      user.id,
      year,
      month,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACKING: LINK TRANSACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/link-transaction')
  @ApiOperation({
    summary: 'Link a transaction to an income plan',
    description:
      'Link a transaction to an income plan entry for tracking purposes',
  })
  @ApiParam({ name: 'id', description: 'Income plan ID', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction linked successfully',
  })
  async linkTransaction(
    @Param('id', ParseIntPipe) id: number,
    @Body() linkDto: LinkTransactionToIncomePlanDto,
    @CurrentUser() user: any,
  ): Promise<IncomePlanEntryResponseDto> {
    return this.incomePlansService.linkTransaction(id, user.id, linkDto);
  }

  @Delete(':id/unlink-transaction/:year/:month')
  @ApiOperation({
    summary: 'Unlink a transaction from an income plan entry',
    description: 'Remove the transaction link from an entry',
  })
  @ApiParam({ name: 'id', description: 'Income plan ID', type: Number })
  @ApiParam({ name: 'year', description: 'Year', type: Number })
  @ApiParam({ name: 'month', description: 'Month (1-12)', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction unlinked successfully',
  })
  async unlinkTransaction(
    @Param('id', ParseIntPipe) id: number,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @CurrentUser() user: any,
  ): Promise<IncomePlanEntryResponseDto | null> {
    return this.incomePlansService.unlinkTransaction(id, user.id, year, month);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACKING: SUMMARIES
  // ═══════════════════════════════════════════════════════════════════════════

  @Get(':id/tracking/:year/:month')
  @ApiOperation({
    summary: 'Get tracking summary for a plan',
    description:
      'Get expected vs actual tracking summary for a specific income plan and month',
  })
  @ApiParam({ name: 'id', description: 'Income plan ID', type: Number })
  @ApiParam({ name: 'year', description: 'Year', type: Number })
  @ApiParam({ name: 'month', description: 'Month (1-12)', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tracking summary retrieved successfully',
  })
  async getTrackingSummaryForPlan(
    @Param('id', ParseIntPipe) id: number,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @CurrentUser() user: any,
  ): Promise<IncomePlanTrackingSummaryDto> {
    return this.incomePlansService.getTrackingSummaryForPlan(
      id,
      user.id,
      year,
      month,
    );
  }

  @Get('tracking/monthly/:year/:month')
  @ApiOperation({
    summary: 'Get monthly tracking summary for all plans',
    description:
      'Get expected vs actual tracking summary for all active income plans in a month',
  })
  @ApiParam({ name: 'year', description: 'Year', type: Number })
  @ApiParam({ name: 'month', description: 'Month (1-12)', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Monthly tracking summary retrieved successfully',
  })
  async getMonthlyTrackingSummary(
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @CurrentUser() user: any,
  ): Promise<MonthlyTrackingSummaryDto> {
    return this.incomePlansService.getMonthlyTrackingSummary(
      user.id,
      year,
      month,
    );
  }

  @Get('tracking/annual/:year')
  @ApiOperation({
    summary: 'Get annual tracking summary',
    description:
      'Get expected vs actual tracking summary for all months in a year',
  })
  @ApiParam({ name: 'year', description: 'Year', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Annual tracking summary retrieved successfully',
  })
  async getAnnualTrackingSummary(
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() user: any,
  ): Promise<AnnualTrackingSummaryDto> {
    return this.incomePlansService.getAnnualTrackingSummary(user.id, year);
  }

  @Get(':id/status')
  @ApiOperation({
    summary: 'Get current month status for an income plan',
    description:
      'Get the tracking status (pending/partial/received/exceeded) for the current month',
  })
  @ApiParam({ name: 'id', description: 'Income plan ID', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Status retrieved successfully',
  })
  async getCurrentMonthStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<{ status: string }> {
    const status = await this.incomePlansService.getCurrentMonthStatus(
      id,
      user.id,
    );
    return { status };
  }
}
