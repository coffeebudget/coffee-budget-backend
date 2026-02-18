import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/user.decorator';
import { PaymentAccountsService } from './payment-accounts.service';
import {
  CreatePaymentAccountDto,
  UpdatePaymentAccountDto,
  GocardlessConnectionRequestDto,
  GocardlessCallbackDto,
} from './dto';
import { PaymentAccount } from './payment-account.entity';

@ApiTags('Payment Accounts')
@ApiBearerAuth()
@Controller('payment-accounts')
@UseGuards(AuthGuard('jwt'))
export class PaymentAccountsController {
  private readonly logger = new Logger(PaymentAccountsController.name);

  constructor(
    private readonly paymentAccountsService: PaymentAccountsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new payment account',
    description:
      'Register a new payment intermediary service account (PayPal, Klarna, etc.) for transaction tracking and reconciliation',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment account created successfully',
    type: PaymentAccount,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid payment account data',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async create(
    @Body() createDto: CreatePaymentAccountDto,
    @CurrentUser() user: any,
  ): Promise<PaymentAccount> {
    return this.paymentAccountsService.create(user.id, createDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all payment accounts for authenticated user',
    description: 'Retrieve all registered payment accounts',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment accounts retrieved successfully',
    type: [PaymentAccount],
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async findAll(@CurrentUser() user: any): Promise<PaymentAccount[]> {
    return this.paymentAccountsService.findAllByUser(user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a specific payment account by ID',
    description: 'Retrieve detailed information for a single payment account',
  })
  @ApiParam({
    name: 'id',
    description: 'Payment account ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment account retrieved successfully',
    type: PaymentAccount,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment account not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<PaymentAccount> {
    return this.paymentAccountsService.findOne(id, user.id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update a payment account',
    description: 'Modify payment account configuration or display name',
  })
  @ApiParam({
    name: 'id',
    description: 'Payment account ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment account updated successfully',
    type: PaymentAccount,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment account not found',
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
    @Body() updateDto: UpdatePaymentAccountDto,
    @CurrentUser() user: any,
  ): Promise<PaymentAccount> {
    return this.paymentAccountsService.update(id, user.id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a payment account',
    description: 'Remove a payment account and all associated activities',
  })
  @ApiParam({
    name: 'id',
    description: 'Payment account ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Payment account deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment account not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<void> {
    await this.paymentAccountsService.delete(id, user.id);
  }

  @Get('provider/:provider')
  @ApiOperation({
    summary: 'Find payment accounts by provider',
    description:
      'Get all payment accounts for a specific provider (e.g., "paypal", "klarna")',
  })
  @ApiParam({
    name: 'provider',
    description: 'Payment provider identifier',
    example: 'paypal',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment accounts retrieved successfully',
    type: [PaymentAccount],
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async findByProvider(
    @Param('provider') provider: string,
    @CurrentUser() user: any,
  ): Promise<PaymentAccount | null> {
    return this.paymentAccountsService.findByProvider(user.id, provider);
  }

  @Post('gocardless/connect')
  @ApiOperation({
    summary: 'Initiate GoCardless connection for payment account',
    description:
      'Creates a GoCardless requisition and returns authorization URL for OAuth flow',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Requisition created successfully, returns auth URL',
    schema: {
      properties: {
        authUrl: { type: 'string', example: 'https://gocardless.com/auth...' },
        requisitionId: { type: 'string', example: 'req_xyz789' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment account not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async connectGocardless(
    @Body() connectionRequest: GocardlessConnectionRequestDto,
    @CurrentUser() user: any,
  ): Promise<{ authUrl: string; requisitionId: string }> {
    return this.paymentAccountsService.initiateGocardlessConnection(
      user.id,
      connectionRequest.paymentAccountId,
      connectionRequest.institutionId,
      connectionRequest.redirectUrl,
    );
  }

  @Post('gocardless/callback')
  @ApiOperation({
    summary: 'Complete GoCardless connection after OAuth callback',
    description:
      'Processes the OAuth callback and updates payment account with GoCardless details',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'GoCardless connection completed successfully',
    type: PaymentAccount,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment account not found or no accounts in requisition',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async gocardlessCallback(
    @Body() callbackData: GocardlessCallbackDto,
    @CurrentUser() user: any,
  ): Promise<PaymentAccount> {
    this.logger.log(
      `GoCardless callback received for user ${user.id}, paymentAccount ${callbackData.paymentAccountId}`,
    );

    try {
      const result =
        await this.paymentAccountsService.completeGocardlessConnection(
          user.id,
          callbackData.paymentAccountId,
          callbackData.requisitionId,
        );
      this.logger.log('GoCardless connection completed successfully');
      return result;
    } catch (error) {
      this.logger.error('Error completing GoCardless connection', error);
      throw error;
    }
  }

  @Post(':id/gocardless/disconnect')
  @ApiOperation({
    summary: 'Disconnect GoCardless from payment account',
    description: 'Removes GoCardless integration from the payment account',
  })
  @ApiParam({
    name: 'id',
    description: 'Payment account ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'GoCardless connection removed successfully',
    type: PaymentAccount,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment account not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async disconnectGocardless(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<PaymentAccount> {
    return this.paymentAccountsService.disconnectGocardless(id, user.id);
  }
}
