import {
  Controller,
  Get,
  Post,
  Patch,
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
import {
  IncomeDistributionService,
  PendingDistribution,
} from './income-distribution.service';
import {
  CreateIncomeDistributionRuleDto,
  UpdateIncomeDistributionRuleDto,
} from './dto';
import { IncomeDistributionRule } from './entities/income-distribution-rule.entity';

@ApiTags('Income Distribution')
@ApiBearerAuth()
@Controller('income-distribution')
@UseGuards(AuthGuard('jwt'))
export class IncomeDistributionController {
  constructor(
    private readonly incomeDistributionService: IncomeDistributionService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // RULES CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('rules')
  @ApiOperation({
    summary: 'Get all income distribution rules',
    description:
      'Retrieve all income distribution rules for the authenticated user',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Rules retrieved successfully',
    type: [IncomeDistributionRule],
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getRules(@CurrentUser() user: any): Promise<IncomeDistributionRule[]> {
    return this.incomeDistributionService.findAllRules(user.id);
  }

  @Get('rules/:id')
  @ApiOperation({
    summary: 'Get a specific income distribution rule',
    description: 'Retrieve detailed information for a single rule',
  })
  @ApiParam({
    name: 'id',
    description: 'Rule ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Rule retrieved successfully',
    type: IncomeDistributionRule,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Rule not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getRule(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<IncomeDistributionRule> {
    return this.incomeDistributionService.findOneRule(id, user.id);
  }

  @Post('rules')
  @ApiOperation({
    summary: 'Create a new income distribution rule',
    description:
      'Create a rule for automatically distributing income to expense plans',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Rule created successfully',
    type: IncomeDistributionRule,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid rule data',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async createRule(
    @Body() dto: CreateIncomeDistributionRuleDto,
    @CurrentUser() user: any,
  ): Promise<IncomeDistributionRule> {
    return this.incomeDistributionService.createRule(user.id, dto);
  }

  @Patch('rules/:id')
  @ApiOperation({
    summary: 'Update an income distribution rule',
    description: 'Modify an existing rule settings',
  })
  @ApiParam({
    name: 'id',
    description: 'Rule ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Rule updated successfully',
    type: IncomeDistributionRule,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Rule not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid update data',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async updateRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIncomeDistributionRuleDto,
    @CurrentUser() user: any,
  ): Promise<IncomeDistributionRule> {
    return this.incomeDistributionService.updateRule(id, user.id, dto);
  }

  @Delete('rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an income distribution rule',
    description: 'Remove an income distribution rule',
  })
  @ApiParam({
    name: 'id',
    description: 'Rule ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Rule deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Rule not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async deleteRule(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<void> {
    await this.incomeDistributionService.deleteRule(id, user.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DISTRIBUTION INFO
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('pending-distributions')
  @ApiOperation({
    summary: 'Get pending distributions',
    description:
      'Get a list of expense plans that need funding with their required amounts',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pending distributions retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getPendingDistributions(
    @CurrentUser() user: any,
  ): Promise<PendingDistribution[]> {
    return this.incomeDistributionService.getPendingDistributions(user.id);
  }
}
