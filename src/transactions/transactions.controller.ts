import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe, Request, ConflictException, UnauthorizedException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { Transaction } from './transaction.entity';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/user.decorator';
import { User } from '../users/user.entity';
import { DuplicateTransactionChoiceDto } from './dto/duplicate-transaction-choice.dto';
import { ImportTransactionDto } from './dto/import-transaction.dto';

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('transactions')
@UseGuards(AuthGuard('jwt'))
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiResponse({ status: 201, description: 'Create a new transaction.' })
  async create(@Body() createTransactionDto: CreateTransactionDto, @CurrentUser() user: User) {
    try {
      if (!user || !user.id) {
        throw new UnauthorizedException('User not authenticated or user ID missing');
      }

      return await this.transactionsService.createAndSaveTransaction(createTransactionDto, user.id, createTransactionDto.duplicateChoice || undefined);
    } catch (error) {
      if (error instanceof ConflictException && error.message === 'Duplicate transaction detected') {
        // Return the conflict with details so the frontend can handle it
        throw error;
      }
      throw error;
    }
  }

  @Post('resolve-duplicate/:id')
  async resolveDuplicate(
    @Param('id') duplicateId: string,
    @Body() choiceDto: DuplicateTransactionChoiceDto,
    @Body() createTransactionDto: CreateTransactionDto,
    @CurrentUser() user: User
  ) {
    const duplicateTransaction = await this.transactionsService.findOne(+duplicateId, user.id);
    
    return this.transactionsService.handleDuplicateConfirmation(
      duplicateTransaction,
      createTransactionDto,
      user.id,
      choiceDto.choice
    );
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Retrieve all transactions.' })
  findAll(@CurrentUser() user: User): Promise<Transaction[]> {
    return this.transactionsService.findAll(user.id);
  }

  @Get('income')
  @ApiResponse({ status: 200, description: 'Retrieve all income transactions.' })
  findIncome(@CurrentUser() user: User): Promise<Transaction[]> {
    return this.transactionsService.findByType("income", user.id); // ✅ Fetch only incomes
  }

  @Get('expense')
  @ApiResponse({ status: 200, description: 'Retrieve all expense transactions.' })
  findExpenses(@CurrentUser() user: User): Promise<Transaction[]> {
    return this.transactionsService.findByType("expense", user.id); // ✅ Fetch only expenses
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Retrieve a transaction by ID.' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User): Promise<Transaction> {
    return this.transactionsService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, description: 'Update a transaction.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTransactionDto: UpdateTransactionDto,
    @CurrentUser() user: User
  ): Promise<Transaction> {
    return this.transactionsService.update(id, updateTransactionDto, user.id);
  }

  @Delete(':id')
  @ApiResponse({ status: 204, description: 'Delete a transaction.' })
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User): Promise<void> {
    return this.transactionsService.delete(id, user.id);
  }

  @Post('import')
  async importTransactions(@Body() importDto: ImportTransactionDto, @CurrentUser() user: User) {
    return this.transactionsService.importTransactions(importDto, user.id);
  }
}
