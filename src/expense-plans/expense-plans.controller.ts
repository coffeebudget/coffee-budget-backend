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
import {
  ExpensePlansService,
  MonthlyDepositSummary,
  TimelineEntry,
  BulkFundResult,
  BulkQuickFundResult,
} from './expense-plans.service';
import {
  CreateExpensePlanDto,
  UpdateExpensePlanDto,
  ContributeDto,
  WithdrawDto,
  AdjustBalanceDto,
  BulkFundDto,
  LinkTransactionDto,
  CoverageSummaryResponse,
} from './dto';
import { ExpensePlan } from './entities/expense-plan.entity';
import { ExpensePlanTransaction } from './entities/expense-plan-transaction.entity';

@ApiTags('Expense Plans')
@ApiBearerAuth()
@Controller('expense-plans')
@UseGuards(AuthGuard('jwt'))
export class ExpensePlansController {
  constructor(private readonly expensePlansService: ExpensePlansService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CRUD OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  @Post()
  @ApiOperation({
    summary: 'Create a new expense plan',
    description:
      'Create a virtual envelope/sinking fund for tracking future expenses',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Expense plan created successfully',
    type: ExpensePlan,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid expense plan data',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async create(
    @Body() createDto: CreateExpensePlanDto,
    @CurrentUser() user: any,
  ): Promise<ExpensePlan> {
    return this.expensePlansService.create(user.id, createDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all expense plans',
    description: 'Retrieve all expense plans for the authenticated user',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'paused', 'completed', 'all'],
    description: 'Filter by status (defaults to all)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Expense plans retrieved successfully',
    type: [ExpensePlan],
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async findAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
  ): Promise<ExpensePlan[]> {
    if (status === 'active') {
      return this.expensePlansService.findActiveByUser(user.id);
    }
    return this.expensePlansService.findAllByUser(user.id);
  }

  @Get('summary/monthly-deposit')
  @ApiOperation({
    summary: 'Get monthly deposit summary',
    description:
      'Get the total monthly amount needed for all expense plans with breakdown by type',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Monthly deposit summary retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getMonthlyDepositSummary(
    @CurrentUser() user: any,
  ): Promise<MonthlyDepositSummary> {
    return this.expensePlansService.getMonthlyDepositSummary(user.id);
  }

  @Get('summary/timeline')
  @ApiOperation({
    summary: 'Get upcoming expense timeline',
    description:
      'Get a chronological view of upcoming expense plan due dates within the specified time period',
  })
  @ApiQuery({
    name: 'months',
    required: false,
    type: Number,
    description: 'Number of months to look ahead (default: 12)',
    example: 12,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Timeline retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getTimeline(
    @CurrentUser() user: any,
    @Query('months') months?: number,
  ): Promise<TimelineEntry[]> {
    return this.expensePlansService.getTimelineView(user.id, months || 12);
  }

  @Get('summary/coverage')
  @ApiOperation({
    summary: 'Get coverage summary',
    description:
      'Get a summary of expense plan coverage status for the next 30 days, showing which bank accounts have sufficient funds',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Coverage summary retrieved successfully',
    type: CoverageSummaryResponse,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getCoverageSummary(
    @CurrentUser() user: any,
  ): Promise<CoverageSummaryResponse> {
    return this.expensePlansService.getCoverageSummary(user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a specific expense plan',
    description: 'Retrieve detailed information for a single expense plan',
  })
  @ApiParam({
    name: 'id',
    description: 'Expense plan ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Expense plan retrieved successfully',
    type: ExpensePlan,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Expense plan not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<ExpensePlan> {
    return this.expensePlansService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an expense plan',
    description: 'Modify expense plan settings, amounts, or status',
  })
  @ApiParam({
    name: 'id',
    description: 'Expense plan ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Expense plan updated successfully',
    type: ExpensePlan,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Expense plan not found',
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
    @Body() updateDto: UpdateExpensePlanDto,
    @CurrentUser() user: any,
  ): Promise<ExpensePlan> {
    return this.expensePlansService.update(id, user.id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an expense plan',
    description: 'Remove an expense plan and all associated transactions',
  })
  @ApiParam({
    name: 'id',
    description: 'Expense plan ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Expense plan deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Expense plan not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<void> {
    await this.expensePlansService.delete(id, user.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get(':id/transactions')
  @ApiOperation({
    summary: 'Get expense plan transactions',
    description:
      'Retrieve all contribution and withdrawal transactions for an expense plan',
  })
  @ApiParam({
    name: 'id',
    description: 'Expense plan ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transactions retrieved successfully',
    type: [ExpensePlanTransaction],
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Expense plan not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getTransactions(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<ExpensePlanTransaction[]> {
    return this.expensePlansService.getTransactions(id, user.id);
  }

  @Post(':id/contribute')
  @ApiOperation({
    summary: 'Add contribution to expense plan',
    description: 'Manually add money to the expense plan virtual envelope',
  })
  @ApiParam({
    name: 'id',
    description: 'Expense plan ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Contribution added successfully',
    type: ExpensePlanTransaction,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Expense plan not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid contribution data',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async contribute(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ContributeDto,
    @CurrentUser() user: any,
  ): Promise<ExpensePlanTransaction> {
    return this.expensePlansService.contribute(
      id,
      user.id,
      dto.amount,
      dto.note,
    );
  }

  @Post(':id/withdraw')
  @ApiOperation({
    summary: 'Withdraw from expense plan',
    description:
      'Manually withdraw money from the expense plan when the expense occurs',
  })
  @ApiParam({
    name: 'id',
    description: 'Expense plan ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Withdrawal completed successfully',
    type: ExpensePlanTransaction,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Expense plan not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Insufficient balance or invalid withdrawal data',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async withdraw(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WithdrawDto,
    @CurrentUser() user: any,
  ): Promise<ExpensePlanTransaction> {
    return this.expensePlansService.withdraw(id, user.id, dto.amount, dto.note);
  }

  @Post(':id/adjust')
  @ApiOperation({
    summary: 'Adjust expense plan balance',
    description:
      'Manually adjust the balance of an expense plan to a specific amount (for corrections)',
  })
  @ApiParam({
    name: 'id',
    description: 'Expense plan ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Balance adjusted successfully',
    type: ExpensePlanTransaction,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Expense plan not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid adjustment data',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async adjustBalance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustBalanceDto,
    @CurrentUser() user: any,
  ): Promise<ExpensePlanTransaction> {
    return this.expensePlansService.adjustBalance(
      id,
      user.id,
      dto.newBalance,
      dto.note,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4: MANUAL FUNDING FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/quick-fund')
  @ApiOperation({
    summary: 'Quick fund expense plan',
    description:
      'Add the monthly contribution amount to the expense plan in one click',
  })
  @ApiParam({
    name: 'id',
    description: 'Expense plan ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Quick fund completed successfully',
    type: ExpensePlanTransaction,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Expense plan not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async quickFund(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<ExpensePlanTransaction> {
    return this.expensePlansService.quickFund(id, user.id);
  }

  @Post(':id/fund-to-target')
  @ApiOperation({
    summary: 'Fund expense plan to target',
    description:
      'Add enough funds to reach the target amount. Returns null if already fully funded.',
  })
  @ApiParam({
    name: 'id',
    description: 'Expense plan ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Fund to target completed successfully',
    type: ExpensePlanTransaction,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Plan already fully funded (no action taken)',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Expense plan not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async fundToTarget(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<ExpensePlanTransaction | null> {
    return this.expensePlansService.fundToTarget(id, user.id);
  }

  @Post('bulk-fund')
  @ApiOperation({
    summary: 'Bulk fund multiple expense plans',
    description: 'Fund multiple expense plans at once with specified amounts',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Bulk funding completed',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid bulk funding data',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async bulkFund(
    @Body() dto: BulkFundDto,
    @CurrentUser() user: any,
  ): Promise<BulkFundResult> {
    return this.expensePlansService.bulkFund(user.id, dto.items);
  }

  @Post('bulk-quick-fund')
  @ApiOperation({
    summary: 'Quick fund all active expense plans',
    description:
      'Add monthly contribution to all active expense plans. Skips fully funded plans.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Bulk quick funding completed',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async bulkQuickFund(@CurrentUser() user: any): Promise<BulkQuickFundResult> {
    return this.expensePlansService.bulkQuickFund(user.id);
  }

  @Post('transactions/:transactionId/link')
  @ApiOperation({
    summary: 'Link transaction to plan transaction',
    description:
      'Link an existing transaction to a plan contribution or withdrawal',
  })
  @ApiParam({
    name: 'transactionId',
    description: 'Plan transaction ID (not the linked transaction ID)',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction linked successfully',
    type: ExpensePlanTransaction,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Plan transaction not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async linkTransaction(
    @Param('transactionId', ParseIntPipe) planTransactionId: number,
    @Body() dto: LinkTransactionDto,
    @CurrentUser() user: any,
  ): Promise<ExpensePlanTransaction> {
    return this.expensePlansService.linkTransaction(
      planTransactionId,
      dto.transactionId,
      user.id,
    );
  }

  @Delete('transactions/:transactionId/link')
  @ApiOperation({
    summary: 'Unlink transaction from plan transaction',
    description:
      'Remove the link between a transaction and a plan contribution or withdrawal',
  })
  @ApiParam({
    name: 'transactionId',
    description: 'Plan transaction ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction unlinked successfully',
    type: ExpensePlanTransaction,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Plan transaction not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async unlinkTransaction(
    @Param('transactionId', ParseIntPipe) planTransactionId: number,
    @CurrentUser() user: any,
  ): Promise<ExpensePlanTransaction> {
    return this.expensePlansService.unlinkTransaction(
      planTransactionId,
      user.id,
    );
  }
}
