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
} from './dto';
import { PaymentAccount } from './payment-account.entity';

@ApiTags('Payment Accounts')
@ApiBearerAuth()
@Controller('payment-accounts')
@UseGuards(AuthGuard('jwt'))
export class PaymentAccountsController {
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
    return this.paymentAccountsService.create(user.userId, createDto);
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
    return this.paymentAccountsService.findAllByUser(user.userId);
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
    return this.paymentAccountsService.findOne(id, user.userId);
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
    return this.paymentAccountsService.update(id, user.userId, updateDto);
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
    await this.paymentAccountsService.delete(id, user.userId);
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
    return this.paymentAccountsService.findByProvider(user.userId, provider);
  }
}
