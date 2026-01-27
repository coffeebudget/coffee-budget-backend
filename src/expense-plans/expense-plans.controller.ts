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
} from './expense-plans.service';
import {
  CreateExpensePlanDto,
  UpdateExpensePlanDto,
  ContributeDto,
  WithdrawDto,
  AdjustBalanceDto,
  LinkTransactionDto,
  CoverageSummaryResponse,
  ExpensePlanWithStatusDto,
  LongTermStatusSummary,
  AccountAllocationSummaryResponse,
} from './dto';
import {
  AcceptAdjustmentDto,
  ReviewSummaryDto,
} from './dto/adjustment-action.dto';
import { ExpensePlan } from './entities/expense-plan.entity';
import { ExpensePlanTransaction } from './entities/expense-plan-transaction.entity';
import { ExpensePlanAdjustmentService } from './expense-plan-adjustment.service';

@ApiTags('Expense Plans')
@ApiBearerAuth()
@Controller('expense-plans')
@UseGuards(AuthGuard('jwt'))
export class ExpensePlansController {
  constructor(
    private readonly expensePlansService: ExpensePlansService,
    private readonly adjustmentService: ExpensePlanAdjustmentService,
  ) {}

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

  @Get('with-status')
  @ApiOperation({
    summary: 'Get all expense plans with funding status',
    description:
      'Retrieve all expense plans with calculated funding status fields for progress display',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'paused', 'completed', 'all'],
    description: 'Filter by status (defaults to all)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Expense plans with funding status retrieved successfully',
    type: [ExpensePlanWithStatusDto],
  })
  async findAllWithStatus(
    @CurrentUser() user: any,
  ): Promise<ExpensePlanWithStatusDto[]> {
    return this.expensePlansService.findAllByUserWithStatus(user.id);
  }

  @Get('long-term-status')
  @ApiOperation({
    summary: 'Get long-term sinking fund status',
    description:
      'Get a summary of all sinking funds and their funding status for coverage section integration',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Long-term status summary retrieved successfully',
    type: LongTermStatusSummary,
  })
  async getLongTermStatus(
    @CurrentUser() user: any,
  ): Promise<LongTermStatusSummary> {
    return this.expensePlansService.getLongTermStatus(user.id);
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

  @Get('summary/account-allocation')
  @ApiOperation({
    summary: 'Get account allocation summary',
    description:
      'Get what each account should hold TODAY, comparing required allocations (fixed monthly + sinking fund progress) against current balance',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Account allocation summary retrieved successfully',
    type: AccountAllocationSummaryResponse,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getAccountAllocationSummary(
    @CurrentUser() user: any,
  ): Promise<AccountAllocationSummaryResponse> {
    return this.expensePlansService.getAccountAllocationSummary(user.id);
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
  // TRANSACTION LINKING
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // ADJUSTMENT SUGGESTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/accept-adjustment')
  @ApiOperation({
    summary: 'Accept adjustment suggestion',
    description:
      'Accept the suggested monthly contribution adjustment or provide a custom value',
  })
  @ApiParam({
    name: 'id',
    description: 'Expense plan ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Adjustment accepted successfully',
    type: ExpensePlan,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Expense plan not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'No adjustment suggestion exists for this plan',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async acceptAdjustment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcceptAdjustmentDto,
    @CurrentUser() user: any,
  ): Promise<ExpensePlan> {
    return this.adjustmentService.acceptAdjustment(
      id,
      user.id,
      dto.customAmount,
    );
  }

  @Post(':id/dismiss-adjustment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dismiss adjustment suggestion',
    description:
      'Dismiss the adjustment suggestion. It will not be shown again for 30 days.',
  })
  @ApiParam({
    name: 'id',
    description: 'Expense plan ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Adjustment dismissed successfully',
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
  async dismissAdjustment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<ExpensePlan> {
    return this.adjustmentService.dismissAdjustment(id, user.id);
  }

  @Post('review-adjustments')
  @ApiOperation({
    summary: 'Review all expense plans for adjustments',
    description:
      'Manually trigger a review of all active expense plans to detect if any need adjustment suggestions',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Review completed successfully',
    type: ReviewSummaryDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async reviewAdjustments(@CurrentUser() user: any): Promise<ReviewSummaryDto> {
    return this.adjustmentService.reviewAllPlansForUser(user.id);
  }
}
