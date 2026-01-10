import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/user.decorator';
import { SyncHistoryService } from './sync-history.service';
import { SyncStatus, SyncSource } from './entities/sync-report.entity';

@ApiTags('sync-history')
@Controller('sync-history')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class SyncHistoryController {
  constructor(private readonly syncHistoryService: SyncHistoryService) {}

  @Get()
  @ApiOperation({
    summary: 'Get paginated sync history for authenticated user',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: SyncStatus,
    description: 'Filter by sync status',
  })
  @ApiQuery({
    name: 'source',
    required: false,
    enum: SyncSource,
    description: 'Filter by sync source (gocardless, paypal, stripe, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of sync reports',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSyncHistory(
    @CurrentUser() user: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number = 10,
    @Query('status') status?: SyncStatus,
    @Query('source') source?: SyncSource,
  ) {
    const options: any = { page, limit };
    if (status) {
      options.status = status;
    }
    if (source) {
      options.source = source;
    }
    return this.syncHistoryService.getUserSyncHistory(user.id, options);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get sync statistics for authenticated user' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to analyze (default: 30)',
  })
  @ApiQuery({
    name: 'source',
    required: false,
    enum: SyncSource,
    description:
      'Filter statistics by source (gocardless, paypal, stripe, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Sync statistics for the specified period',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSyncStatistics(
    @CurrentUser() user: any,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number = 30,
    @Query('source') source?: SyncSource,
  ) {
    return this.syncHistoryService.getSyncStatistics(user.id, days, source);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get specific sync report with detailed information',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Sync report ID' })
  @ApiResponse({
    status: 200,
    description: 'Detailed sync report with relations',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Access denied - user does not own this sync report',
  })
  @ApiResponse({ status: 404, description: 'Sync report not found' })
  async getSyncReportById(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.syncHistoryService.getSyncReportById(id, user.id);
  }
}
