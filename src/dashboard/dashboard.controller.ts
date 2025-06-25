import {
  Controller,
  Get,
  UseGuards,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../auth/user.decorator';
import { User } from '../users/user.entity';
import { ParseDatePipe } from '../pipes/parse-date.pipe';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('expense-distribution')
  async getExpenseDistribution(
    @CurrentUser() user: User,
    @Query('startDate', ParseDatePipe)
    startDate: Date = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    ),
    @Query('endDate', ParseDatePipe) endDate: Date = new Date(),
  ) {
    return this.dashboardService.getExpenseDistributionByCategory(
      user.id,
      startDate,
      endDate,
    );
  }

  @Get('monthly-summary')
  async getMonthlyIncomeAndExpenses(
    @CurrentUser() user: User,
    @Query('months', new ParseIntPipe({ optional: true })) months: number = 6,
  ) {
    return this.dashboardService.getMonthlyIncomeAndExpenses(user.id, months);
  }

  @Get('statistics')
  async getMonthlyStatistics(
    @CurrentUser() user: User,
    @Query('date', ParseDatePipe) date: Date = new Date(),
  ) {
    return this.dashboardService.getMonthlyStatistics(user.id, date);
  }

  @Get('transactions')
  async getFilteredTransactions(
    @CurrentUser() user: User,
    @Query('startDate', ParseDatePipe) startDate?: Date,
    @Query('endDate', ParseDatePipe) endDate?: Date,
    @Query('categoryIds') categoryIds?: string,
    @Query('tagIds') tagIds?: string,
    @Query('minAmount', new ParseIntPipe({ optional: true }))
    minAmount?: number,
    @Query('maxAmount', new ParseIntPipe({ optional: true }))
    maxAmount?: number,
    @Query('type') type?: 'income' | 'expense',
    @Query('searchTerm') searchTerm?: string,
    @Query('orderBy') orderBy?: 'executionDate' | 'amount' | 'description',
    @Query('orderDirection') orderDirection?: 'asc' | 'desc',
    @Query('uncategorizedOnly') uncategorizedOnly?: string,
    @Query('bankAccountIds') bankAccountIds?: string,
    @Query('creditCardIds') creditCardIds?: string,
  ) {
    const parsedCategoryIds = categoryIds
      ? categoryIds.split(',').map((id) => parseInt(id, 10))
      : undefined;
    const parsedTagIds = tagIds
      ? tagIds.split(',').map((id) => parseInt(id, 10))
      : undefined;
    const parsedBankAccountIds = bankAccountIds
      ? bankAccountIds.split(',').map((id) => parseInt(id, 10))
      : undefined;
    const parsedCreditCardIds = creditCardIds
      ? creditCardIds.split(',').map((id) => parseInt(id, 10))
      : undefined;
    const isUncategorizedOnly = uncategorizedOnly === 'true';

    return this.dashboardService.getFilteredTransactions(user.id, {
      startDate,
      endDate,
      categoryIds: parsedCategoryIds,
      tagIds: parsedTagIds,
      minAmount,
      maxAmount,
      type,
      searchTerm,
      orderBy,
      orderDirection,
      uncategorizedOnly: isUncategorizedOnly,
      bankAccountIds: parsedBankAccountIds,
      creditCardIds: parsedCreditCardIds,
    });
  }

  @Get('current-balance')
  async getCurrentBalance(@CurrentUser() user: User) {
    return this.dashboardService.getCurrentBalance(user.id);
  }

  @Get('cash-flow-forecast')
  async getCashFlowForecast(
    @Query('mode') mode: 'recurring' | 'historical' = 'historical',
    @Query('months') months = 24,
    @CurrentUser() user: User,
  ) {
    return this.dashboardService.getCashFlowForecast(user.id, months, mode);
  }

  @Get('savings-plan')
  async getSavingsPlan(@CurrentUser() user: User) {
    return this.dashboardService.getSavingsPlanByCategory(user.id);
  }
}
