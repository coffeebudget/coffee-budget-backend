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
  ValidationPipe,
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
  CoverageSummaryResponse,
  ExpensePlanWithStatusDto,
  LongTermStatusSummary,
  AccountAllocationSummaryResponse,
  CoveragePeriodType,
  VALID_COVERAGE_PERIODS,
  LinkTransactionDto,
  ExpensePlanPaymentResponseDto,
} from './dto';
import {
  AcceptAdjustmentDto,
  ReviewSummaryDto,
} from './dto/adjustment-action.dto';
import { ExpensePlan } from './entities/expense-plan.entity';
import { ExpensePlanAdjustmentService } from './expense-plan-adjustment.service';
import { TransactionLinkingService } from './transaction-linking.service';

// Helper to safely convert date to ISO string (handles both Date objects and strings from DB)
function toDateString(date: Date | string | null): string | null {
  if (!date) return null;
  if (date instanceof Date) return date.toISOString().split('T')[0];
  return String(date).split('T')[0];
}

function toISOString(date: Date | string | null): string | null {
  if (!date) return null;
  if (date instanceof Date) return date.toISOString();
  return String(date);
}

@ApiTags('Expense Plans')
@ApiBearerAuth()
@Controller('expense-plans')
@UseGuards(AuthGuard('jwt'))
export class ExpensePlansController {
  constructor(
    private readonly expensePlansService: ExpensePlansService,
    private readonly adjustmentService: ExpensePlanAdjustmentService,
    private readonly linkingService: TransactionLinkingService,
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
      'Get a summary of expense plan coverage status for a configurable period, showing which bank accounts have sufficient funds',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: VALID_COVERAGE_PERIODS,
    description:
      'Time period for coverage calculation (defaults to next_30_days)',
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
    @Query('period') period?: CoveragePeriodType,
  ): Promise<CoverageSummaryResponse> {
    return this.expensePlansService.getCoverageSummary(user.id, period);
  }

  @Get('summary/account-allocation')
  @ApiOperation({
    summary: 'Get account allocation summary',
    description:
      'Get what each account should hold for a configurable period, comparing required allocations (fixed monthly + sinking fund progress) against current balance',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: VALID_COVERAGE_PERIODS,
    description:
      'Time period for allocation calculation (defaults to this_month)',
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
    @Query('period') period?: CoveragePeriodType,
  ): Promise<AccountAllocationSummaryResponse> {
    return this.expensePlansService.getAccountAllocationSummary(
      user.id,
      period,
    );
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYMENT LINKING
  // ═══════════════════════════════════════════════════════════════════════════

  @Get(':id/payments')
  @ApiOperation({
    summary: 'Get payments for an expense plan',
    description:
      'Retrieve all linked payments/transactions for an expense plan',
  })
  @ApiParam({
    name: 'id',
    description: 'Expense plan ID',
    example: 1,
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: Number,
    description: 'Filter by year',
    example: 2025,
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Filter by month (1-12)',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payments retrieved successfully',
    type: [ExpensePlanPaymentResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Expense plan not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getPayments(
    @Param('id', ParseIntPipe) id: number,
    @Query('year') year: number | undefined,
    @Query('month') month: number | undefined,
    @CurrentUser() user: any,
  ): Promise<ExpensePlanPaymentResponseDto[]> {
    let payments;

    if (year && month) {
      payments = await this.linkingService.getPaymentsForPeriod(
        id,
        year,
        month,
        user.id,
      );
    } else {
      payments = await this.linkingService.getPaymentsForPlan(id, user.id);
    }

    return payments.map((payment) => ({
      id: payment.id,
      expensePlanId: payment.expensePlanId,
      year: payment.year,
      month: payment.month,
      period: payment.getPeriod(),
      amount: Number(payment.amount),
      paymentDate: toDateString(payment.paymentDate)!,
      paymentType: payment.paymentType,
      transactionId: payment.transactionId,
      transaction: payment.transaction
        ? {
            id: payment.transaction.id,
            description: payment.transaction.description,
            amount: Number(payment.transaction.amount),
            executionDate: toDateString(payment.transaction.executionDate),
          }
        : null,
      notes: payment.notes,
      createdAt: toISOString(payment.createdAt)!,
    }));
  }

  @Post(':id/link-transaction')
  @ApiOperation({
    summary: 'Link a transaction to an expense plan',
    description:
      'Manually link a transaction as a payment against an expense plan',
  })
  @ApiParam({
    name: 'id',
    description: 'Expense plan ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Transaction linked successfully',
    type: ExpensePlanPaymentResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Expense plan or transaction not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async linkTransaction(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe()) dto: LinkTransactionDto,
    @CurrentUser() user: any,
  ): Promise<ExpensePlanPaymentResponseDto> {
    const payment = await this.linkingService.linkTransaction(
      id,
      dto.transactionId,
      user.id,
      dto.notes,
    );

    return {
      id: payment.id,
      expensePlanId: payment.expensePlanId,
      year: payment.year,
      month: payment.month,
      period: payment.getPeriod(),
      amount: Number(payment.amount),
      paymentDate: toDateString(payment.paymentDate)!,
      paymentType: payment.paymentType,
      transactionId: payment.transactionId,
      transaction: null, // Not loaded in linkTransaction
      notes: payment.notes,
      createdAt: toISOString(payment.createdAt)!,
    };
  }

  @Delete(':planId/payments/:paymentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a payment link',
    description:
      'Remove a linked payment from an expense plan. The transaction is not deleted.',
  })
  @ApiParam({
    name: 'planId',
    description: 'Expense plan ID',
    example: 1,
  })
  @ApiParam({
    name: 'paymentId',
    description: 'Payment ID',
    example: 42,
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Payment link deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async deletePayment(
    @Param('planId', ParseIntPipe) _planId: number,
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @CurrentUser() user: any,
  ): Promise<void> {
    await this.linkingService.deletePayment(paymentId, user.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSACTION LINK INFO
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('linked-plans-by-transactions')
  @ApiOperation({
    summary: 'Get linked expense plans for transactions',
    description:
      'Returns which expense plans are linked to the provided transaction IDs',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Linked plans retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getLinkedPlansByTransactions(
    @Body('transactionIds') transactionIds: number[],
    @CurrentUser() user: any,
  ): Promise<
    Record<
      number,
      { planId: number; planName: string; planIcon: string | null }[]
    >
  > {
    const result = await this.linkingService.getLinkedPlansForTransactions(
      transactionIds || [],
      user.id,
    );

    // Convert Map to plain object for JSON serialization
    const response: Record<
      number,
      { planId: number; planName: string; planIcon: string | null }[]
    > = {};
    for (const [key, value] of result.entries()) {
      response[key] = value;
    }
    return response;
  }
}
