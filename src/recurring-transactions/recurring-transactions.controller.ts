import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query, ParseIntPipe } from '@nestjs/common';
import { RecurringTransactionsService } from './recurring-transactions.service';
import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';
import { UpdateRecurringTransactionDto } from './dto/update-recurring-transaction.dto';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/user.decorator';
import { User } from '../users/user.entity';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TransactionsService } from '../transactions/transactions.service';
import { RecurringPatternDetectorService } from './recurring-pattern-detector.service';

@ApiTags('recurring-transactions')
@ApiBearerAuth()  
@Controller('recurring-transactions')
@UseGuards(AuthGuard('jwt'))
export class RecurringTransactionsController {
  constructor(
    private readonly recurringTransactionsService: RecurringTransactionsService,
    private readonly transactionsService: TransactionsService,
    private readonly patternDetectorService: RecurringPatternDetectorService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new recurring transaction' })
  @ApiResponse({ status: 201, description: 'The recurring transaction has been created.' })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  async create(
    @Body() createDto: CreateRecurringTransactionDto,
    @CurrentUser() user: User,
  ) {
    return this.recurringTransactionsService.create(createDto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Get all recurring transactions' })
  @ApiResponse({ status: 200, description: 'List of all recurring transactions.' })
  async findAll(@CurrentUser() user: User) {
    return this.recurringTransactionsService.findAll(user.id);
  }

  @Get('detect-all-patterns')
  @ApiOperation({ summary: 'Run detection on all transactions (debug/dev)' })
  async detectAllPatterns(@CurrentUser() user: User) {
    return this.recurringTransactionsService.detectAllPatterns(user.id);
  }

  @Get('unconfirmed-patterns')
  @ApiOperation({ summary: 'Get all unconfirmed recurring patterns' })
  @ApiResponse({ status: 200, description: 'List of all unconfirmed recurring patterns.' })
  async getUnconfirmedPatterns(@CurrentUser() user: User) {
    return this.recurringTransactionsService.getUnconfirmedPatterns(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a recurring transaction by ID' })
  @ApiParam({ name: 'id', description: 'Recurring transaction ID' })
  @ApiResponse({ status: 200, description: 'The recurring transaction.' })
  @ApiResponse({ status: 404, description: 'Recurring transaction not found.' })
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.recurringTransactionsService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a recurring transaction' })
  @ApiParam({ name: 'id', description: 'Recurring transaction ID' })
  @ApiResponse({ status: 200, description: 'The recurring transaction has been updated.' })
  @ApiResponse({ status: 404, description: 'Recurring transaction not found.' })
  async update(
    @Param('id') id: number,
    @Body() updateDto: UpdateRecurringTransactionDto,
    @CurrentUser() user: User,
  ) {
    return this.recurringTransactionsService.update(id, updateDto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a recurring transaction' })
  @ApiParam({ name: 'id', description: 'Recurring transaction ID' })
  @ApiResponse({ status: 200, description: 'The recurring transaction has been deleted.' })
  @ApiResponse({ status: 404, description: 'Recurring transaction not found.' })
  async remove(@Param('id') id: number, @CurrentUser() user: User, @Body('deleteOption') deleteOption: 'all' | 'pending' | 'none') {
    return this.recurringTransactionsService.remove(id, user.id, deleteOption);
  }

  @Get(':id/linked-transactions')
  @ApiOperation({ summary: 'Get all transactions linked to a recurring transaction' })
  async getLinkedTransactions(@Param('id') id: string, @CurrentUser() user: User) {
    return this.transactionsService.findByRecurringTransactionId(+id, user.id);
  }

  @Post(':id/confirm-pattern')
  @ApiOperation({ summary: 'Confirm a detected recurring pattern' })
  async confirmPattern(@Param('id') id: string, @CurrentUser() user: User) {
    return this.recurringTransactionsService.confirmPattern(+id, user.id);
  }

  @Post(':id/remove-transaction/:transactionId')
  @ApiOperation({ summary: 'Remove a transaction from a recurring pattern' })
  async removeTransactionFromPattern(
    @Param('id') id: string, 
    @Param('transactionId') transactionId: string,
    @CurrentUser() user: User,
  ) {
    return this.transactionsService.unlinkFromRecurringTransaction(+transactionId, +id, user.id);
  }

  @Post(':id/adjust-pattern')
  @ApiOperation({ summary: 'Adjust a recurring pattern' })
  async adjustPattern(
    @Param('id') id: string,
    @Body() updateDto: UpdateRecurringTransactionDto,
    @CurrentUser() user: User,
  ) {
    return this.recurringTransactionsService.adjustPattern(+id, updateDto, user.id);
  }
}
