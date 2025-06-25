import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { PendingDuplicatesService } from './pending-duplicates.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { UpdatePendingDuplicateDto } from './dto/update-pending-duplicate.dto';
import { DuplicateTransactionChoiceDto } from '../transactions/dto/duplicate-transaction-choice.dto';
import { CurrentUser } from '../auth/user.decorator';
import { User } from '../users/user.entity';

@ApiTags('pending-duplicates')
@ApiBearerAuth()
@Controller('pending-duplicates')
@UseGuards(AuthGuard('jwt'))
export class PendingDuplicatesController {
  constructor(
    private readonly pendingDuplicatesService: PendingDuplicatesService,
    private readonly duplicateDetectionService: DuplicateDetectionService,
  ) {}

  @Get()
  async findAll(@CurrentUser() user: User) {
    return this.pendingDuplicatesService.findPendingDuplicates(user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: number, @CurrentUser() user: User) {
    return this.pendingDuplicatesService.findOne(+id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() updatePendingDuplicateDto: UpdatePendingDuplicateDto,
    @CurrentUser() user: User,
  ) {
    return this.pendingDuplicatesService.update(
      id,
      updatePendingDuplicateDto,
      user.id,
    );
  }

  @Delete(':id')
  @ApiResponse({ status: 204, description: 'Delete a pending duplicate.' })
  remove(@Param('id') id: number, @CurrentUser() user: User) {
    return this.pendingDuplicatesService.delete(id, user.id);
  }

  @Post(':id/resolve')
  async resolve(
    @Param('id') id: number,
    @Body() choiceDto: DuplicateTransactionChoiceDto,
    @CurrentUser() user: User,
  ) {
    return this.pendingDuplicatesService.resolvePendingDuplicate(
      +id,
      user.id,
      choiceDto.choice,
    );
  }

  @Post('bulk-resolve')
  @ApiOperation({
    summary: 'Bulk resolve multiple pending duplicates',
    description: 'Resolve multiple pending duplicates with the same choice',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk resolution completed',
    schema: {
      type: 'object',
      properties: {
        resolved: { type: 'number' },
        errors: { type: 'number' },
        details: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  async bulkResolve(
    @Body() bulkResolveDto: { duplicateIds: number[]; choice: string },
    @CurrentUser() user: User,
  ) {
    return this.pendingDuplicatesService.bulkResolvePendingDuplicates(
      bulkResolveDto.duplicateIds,
      user.id,
      bulkResolveDto.choice,
    );
  }

  @Delete('bulk-delete')
  @ApiOperation({
    summary: 'Bulk delete pending duplicates',
    description: 'Delete multiple pending duplicates without resolving them',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk deletion completed',
    schema: {
      type: 'object',
      properties: {
        deleted: { type: 'number' },
        errors: { type: 'number' },
      },
    },
  })
  async bulkDelete(
    @Body() bulkDeleteDto: { duplicateIds: number[] },
    @CurrentUser() user: User,
  ) {
    return this.pendingDuplicatesService.bulkDeletePendingDuplicates(
      bulkDeleteDto.duplicateIds,
      user.id,
    );
  }

  @Post('detect-duplicates')
  @ApiOperation({
    summary: 'Trigger duplicate detection for current user',
    description:
      'Manually trigger comprehensive duplicate detection that will scan all transactions and create pending duplicates for potential matches',
  })
  @ApiResponse({
    status: 200,
    description: 'Duplicate detection completed successfully',
    schema: {
      type: 'object',
      properties: {
        potentialDuplicatesFound: { type: 'number' },
        pendingDuplicatesCreated: { type: 'number' },
        usersProcessed: { type: 'number' },
        executionTime: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  async detectDuplicates(@CurrentUser() user: User) {
    const result = await this.duplicateDetectionService.detectDuplicates(
      user.id,
    );
    return {
      ...result,
      message: `Found ${result.potentialDuplicatesFound} potential duplicates, created ${result.pendingDuplicatesCreated} pending duplicates in ${result.executionTime}`,
    };
  }

  @Get('detect-duplicates/status')
  @ApiOperation({
    summary: 'Get duplicate detection status',
    description: 'Check if duplicate detection is currently running',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the current status of duplicate detection',
    schema: {
      type: 'object',
      properties: {
        isRunning: { type: 'boolean' },
      },
    },
  })
  async getDetectionStatus() {
    return this.duplicateDetectionService.getStatus();
  }
}
