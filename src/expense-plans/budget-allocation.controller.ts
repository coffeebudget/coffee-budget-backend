import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { BudgetAllocationService } from './budget-allocation.service';
import {
  AllocationStateDto,
  SaveAllocationsDto,
  SaveAllocationsResultDto,
  SetIncomeOverrideDto,
  AutoAllocateResultDto,
  IncomeBreakdownDto,
} from './dto/budget-allocation.dto';
import { CurrentUser } from '../auth/user.decorator';

@ApiTags('Budget Allocation')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('budget-allocation')
export class BudgetAllocationController {
  constructor(
    private readonly budgetAllocationService: BudgetAllocationService,
  ) {}

  @Get(':month')
  @ApiOperation({
    summary: 'Get allocation state for a month',
    description:
      'Returns the current allocation state including income, allocations, and unallocated amount',
  })
  @ApiParam({
    name: 'month',
    description: 'Month in format YYYY-MM',
    example: '2026-01',
  })
  @ApiResponse({ status: 200, type: AllocationStateDto })
  async getAllocationState(
    @Param('month') month: string,
    @CurrentUser() user: any,
  ): Promise<AllocationStateDto> {
    return this.budgetAllocationService.getAllocationState(user.id, month);
  }

  @Post(':month')
  @ApiOperation({
    summary: 'Save allocations for a month',
    description: 'Saves the allocation amounts for each expense plan',
  })
  @ApiParam({
    name: 'month',
    description: 'Month in format YYYY-MM',
    example: '2026-01',
  })
  @ApiResponse({ status: 200, type: SaveAllocationsResultDto })
  async saveAllocations(
    @Param('month') month: string,
    @Body() dto: SaveAllocationsDto,
    @CurrentUser() user: any,
  ): Promise<SaveAllocationsResultDto> {
    return this.budgetAllocationService.saveAllocations(
      user.id,
      month,
      dto,
    );
  }

  @Get(':month/income')
  @ApiOperation({
    summary: 'Get income breakdown for a month',
    description:
      'Returns auto-detected income, manual override, and income transactions',
  })
  @ApiParam({
    name: 'month',
    description: 'Month in format YYYY-MM',
    example: '2026-01',
  })
  @ApiResponse({ status: 200, type: IncomeBreakdownDto })
  async getIncomeBreakdown(
    @Param('month') month: string,
    @CurrentUser() user: any,
  ): Promise<IncomeBreakdownDto> {
    const state = await this.budgetAllocationService.getAllocationState(
      user.id,
      month,
    );
    return state.income;
  }

  @Post(':month/income')
  @ApiOperation({
    summary: 'Set income override for a month',
    description:
      'Allows user to manually override the detected income amount',
  })
  @ApiParam({
    name: 'month',
    description: 'Month in format YYYY-MM',
    example: '2026-01',
  })
  @ApiResponse({ status: 200, type: AllocationStateDto })
  async setIncomeOverride(
    @Param('month') month: string,
    @Body() dto: SetIncomeOverrideDto,
    @CurrentUser() user: any,
  ): Promise<AllocationStateDto> {
    return this.budgetAllocationService.setIncomeOverride(
      user.id,
      month,
      dto,
    );
  }

  @Post(':month/auto')
  @ApiOperation({
    summary: 'Auto-allocate to all plans',
    description:
      'Automatically allocates income to expense plans using their suggested amounts',
  })
  @ApiParam({
    name: 'month',
    description: 'Month in format YYYY-MM',
    example: '2026-01',
  })
  @ApiResponse({ status: 200, type: AutoAllocateResultDto })
  async autoAllocate(
    @Param('month') month: string,
    @CurrentUser() user: any,
  ): Promise<AutoAllocateResultDto> {
    return this.budgetAllocationService.autoAllocate(user.id, month);
  }
}
