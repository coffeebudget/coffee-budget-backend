import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
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
import { PaymentActivitiesService } from './payment-activities.service';
import { PaymentAccountImportService } from './payment-account-import.service';
import {
  CreatePaymentActivityDto,
  UpdatePaymentActivityDto,
} from './dto';
import { PaymentActivity } from './payment-activity.entity';

@ApiTags('Payment Activities')
@ApiBearerAuth()
@Controller('payment-activities')
@UseGuards(AuthGuard('jwt'))
export class PaymentActivitiesController {
  constructor(
    private readonly paymentActivitiesService: PaymentActivitiesService,
    private readonly paymentAccountImportService: PaymentAccountImportService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new payment activity',
    description:
      'Record a transaction from a payment provider for reconciliation and merchant enrichment',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment activity created successfully',
    type: PaymentActivity,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid payment activity data',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async create(
    @Body() createDto: CreatePaymentActivityDto,
    @CurrentUser() user: any,
  ): Promise<PaymentActivity> {
    return this.paymentActivitiesService.create(user.userId, {
      ...createDto,
      executionDate: new Date(createDto.executionDate),
    });
  }

  @Get('payment-account/:paymentAccountId')
  @ApiOperation({
    summary: 'Get all activities for a payment account',
    description: 'Retrieve all payment activities for a specific payment account',
  })
  @ApiParam({
    name: 'paymentAccountId',
    description: 'Payment account ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment activities retrieved successfully',
    type: [PaymentActivity],
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment account not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async findAllByPaymentAccount(
    @Param('paymentAccountId', ParseIntPipe) paymentAccountId: number,
    @CurrentUser() user: any,
  ): Promise<PaymentActivity[]> {
    return this.paymentActivitiesService.findAllByPaymentAccount(
      paymentAccountId,
      user.userId,
    );
  }

  @Get('pending/:paymentAccountId')
  @ApiOperation({
    summary: 'Get pending activities for reconciliation',
    description:
      'Retrieve all unreconciled payment activities for a specific payment account',
  })
  @ApiParam({
    name: 'paymentAccountId',
    description: 'Payment account ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pending payment activities retrieved successfully',
    type: [PaymentActivity],
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment account not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async findPending(
    @Param('paymentAccountId', ParseIntPipe) paymentAccountId: number,
    @CurrentUser() user: any,
  ): Promise<PaymentActivity[]> {
    return this.paymentActivitiesService.findPending(user.userId);
  }

  @Get('date-range/:paymentAccountId')
  @ApiOperation({
    summary: 'Get activities within a date range',
    description:
      'Retrieve payment activities for a specific payment account within a date range',
  })
  @ApiParam({
    name: 'paymentAccountId',
    description: 'Payment account ID',
    example: 1,
  })
  @ApiQuery({
    name: 'startDate',
    description: 'Start date (ISO 8601)',
    example: '2024-01-01',
  })
  @ApiQuery({
    name: 'endDate',
    description: 'End date (ISO 8601)',
    example: '2024-01-31',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment activities retrieved successfully',
    type: [PaymentActivity],
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid date format',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async findByDateRange(
    @Param('paymentAccountId', ParseIntPipe) paymentAccountId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: any,
  ): Promise<PaymentActivity[]> {
    return this.paymentActivitiesService.findByDateRange(
      user.userId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('stats/:paymentAccountId')
  @ApiOperation({
    summary: 'Get reconciliation statistics',
    description:
      'Retrieve statistics about reconciliation status for a payment account',
  })
  @ApiParam({
    name: 'paymentAccountId',
    description: 'Payment account ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Reconciliation statistics retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment account not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getReconciliationStats(
    @Param('paymentAccountId', ParseIntPipe) paymentAccountId: number,
    @CurrentUser() user: any,
  ) {
    return this.paymentActivitiesService.getReconciliationStats(user.userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a specific payment activity by ID',
    description: 'Retrieve detailed information for a single payment activity',
  })
  @ApiParam({
    name: 'id',
    description: 'Payment activity ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment activity retrieved successfully',
    type: PaymentActivity,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment activity not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<PaymentActivity> {
    return this.paymentActivitiesService.findOne(id, user.userId);
  }

  @Put(':id/reconciliation')
  @ApiOperation({
    summary: 'Update reconciliation status',
    description:
      'Update the reconciliation status and confidence for a payment activity',
  })
  @ApiParam({
    name: 'id',
    description: 'Payment activity ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Reconciliation status updated successfully',
    type: PaymentActivity,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment activity not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid reconciliation data',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async updateReconciliation(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdatePaymentActivityDto,
    @CurrentUser() user: any,
  ): Promise<PaymentActivity> {
    return this.paymentActivitiesService.updateReconciliation(
      id,
      user.userId,
      {
        reconciledTransactionId: updateDto.reconciledTransactionId!,
        reconciliationStatus: updateDto.reconciliationStatus as 'reconciled' | 'failed' | 'manual',
        reconciliationConfidence: updateDto.reconciliationConfidence,
      },
    );
  }

  @Put(':id/reconciliation/fail')
  @ApiOperation({
    summary: 'Mark reconciliation as failed',
    description: 'Mark a payment activity reconciliation attempt as failed',
  })
  @ApiParam({
    name: 'id',
    description: 'Payment activity ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Reconciliation marked as failed successfully',
    type: PaymentActivity,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment activity not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async markReconciliationFailed(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<PaymentActivity> {
    return this.paymentActivitiesService.markReconciliationFailed(
      id,
      user.userId,
    );
  }

  @Post('import/:paymentAccountId')
  @ApiOperation({
    summary: 'Import payment activities from GoCardless',
    description:
      'Import payment activities for a payment account from GoCardless API. Supports date range filtering.',
  })
  @ApiParam({
    name: 'paymentAccountId',
    description: 'Payment account ID',
    example: 1,
  })
  @ApiQuery({
    name: 'dateFrom',
    description: 'Start date (ISO 8601, defaults to 90 days ago)',
    required: false,
    example: '2024-01-01',
  })
  @ApiQuery({
    name: 'dateTo',
    description: 'End date (ISO 8601, defaults to today)',
    required: false,
    example: '2024-03-31',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Import completed successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment account not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async importPaymentActivities(
    @Param('paymentAccountId', ParseIntPipe) paymentAccountId: number,
    @CurrentUser() user: any,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const dateFromParsed = dateFrom ? new Date(dateFrom) : undefined;
    const dateToParsed = dateTo ? new Date(dateTo) : undefined;

    return this.paymentAccountImportService.importFromGoCardless(
      paymentAccountId,
      user.userId,
      dateFromParsed,
      dateToParsed,
    );
  }

  @Post('import-all-paypal')
  @ApiOperation({
    summary: 'Import payment activities for all PayPal accounts',
    description:
      'Import payment activities from GoCardless for all PayPal accounts of the authenticated user',
  })
  @ApiQuery({
    name: 'dateFrom',
    description: 'Start date (ISO 8601, defaults to 90 days ago)',
    required: false,
    example: '2024-01-01',
  })
  @ApiQuery({
    name: 'dateTo',
    description: 'End date (ISO 8601, defaults to today)',
    required: false,
    example: '2024-03-31',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Import completed successfully for all PayPal accounts',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async importAllPayPalAccounts(
    @CurrentUser() user: any,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const dateFromParsed = dateFrom ? new Date(dateFrom) : undefined;
    const dateToParsed = dateTo ? new Date(dateTo) : undefined;

    return this.paymentAccountImportService.importAllPayPalAccountsForUser(
      user.userId,
      dateFromParsed,
      dateToParsed,
    );
  }
}
