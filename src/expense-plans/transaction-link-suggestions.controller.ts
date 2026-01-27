import {
  Controller,
  Get,
  Post,
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
import { TransactionLinkSuggestionService } from './transaction-link-suggestion.service';
import {
  TransactionLinkSuggestionResponseDto,
  SuggestionCountsDto,
  ApproveLinkSuggestionDto,
  RejectLinkSuggestionDto,
  ApprovalResultDto,
  BulkApproveSuggestionsDto,
  BulkRejectSuggestionsDto,
  BulkApprovalResultDto,
  BulkRejectionResultDto,
} from './dto/transaction-link-suggestion.dto';

@ApiTags('Transaction Link Suggestions')
@ApiBearerAuth()
@Controller('transaction-link-suggestions')
@UseGuards(AuthGuard('jwt'))
export class TransactionLinkSuggestionsController {
  constructor(
    private readonly suggestionService: TransactionLinkSuggestionService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST & COUNTS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get()
  @ApiOperation({
    summary: 'Get pending transaction link suggestions',
    description:
      'Retrieve all pending suggestions for linking bank transactions to expense plans',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pending suggestions retrieved successfully',
    type: [TransactionLinkSuggestionResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async findPending(
    @CurrentUser() user: any,
  ): Promise<TransactionLinkSuggestionResponseDto[]> {
    return this.suggestionService.findPending(user.id);
  }

  @Get('counts')
  @ApiOperation({
    summary: 'Get suggestion counts',
    description:
      'Get the count of pending and total suggestions for badge display',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Counts retrieved successfully',
    type: SuggestionCountsDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getCounts(@CurrentUser() user: any): Promise<SuggestionCountsDto> {
    return this.suggestionService.getCounts(user.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPROVE
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve a link suggestion',
    description:
      'Approve a suggestion to link a transaction to an expense plan. This creates a withdrawal/contribution on the plan.',
  })
  @ApiParam({
    name: 'id',
    description: 'Suggestion ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Suggestion approved and transaction linked successfully',
    type: ApprovalResultDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Suggestion not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Suggestion already processed or insufficient plan balance',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveLinkSuggestionDto,
    @CurrentUser() user: any,
  ): Promise<ApprovalResultDto> {
    return this.suggestionService.approve(id, user.id, dto.customAmount);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REJECT
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reject a link suggestion',
    description:
      'Reject a suggestion. Optionally provide a reason and disable future suggestions for this plan.',
  })
  @ApiParam({
    name: 'id',
    description: 'Suggestion ID',
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Suggestion rejected successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Suggestion not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Suggestion already processed',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectLinkSuggestionDto,
    @CurrentUser() user: any,
  ): Promise<void> {
    await this.suggestionService.reject(
      id,
      user.id,
      dto.reason,
      dto.neverAskForPlan,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BULK OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('bulk-approve')
  @ApiOperation({
    summary: 'Bulk approve suggestions',
    description: 'Approve multiple link suggestions at once',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bulk approval completed',
    type: BulkApprovalResultDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async bulkApprove(
    @Body() dto: BulkApproveSuggestionsDto,
    @CurrentUser() user: any,
  ): Promise<BulkApprovalResultDto> {
    return this.suggestionService.bulkApprove(dto.ids, user.id);
  }

  @Post('bulk-reject')
  @ApiOperation({
    summary: 'Bulk reject suggestions',
    description: 'Reject multiple link suggestions at once',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bulk rejection completed',
    type: BulkRejectionResultDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async bulkReject(
    @Body() dto: BulkRejectSuggestionsDto,
    @CurrentUser() user: any,
  ): Promise<BulkRejectionResultDto> {
    return this.suggestionService.bulkReject(dto.ids, user.id, dto.reason);
  }
}
