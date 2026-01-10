import {
  Controller,
  Post,
  Headers,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { GocardlessSchedulerService } from './gocardless-scheduler.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('cron')
@Controller('cron')
export class GocardlessCronController {
  private readonly logger = new Logger(GocardlessCronController.name);

  constructor(
    private readonly schedulerService: GocardlessSchedulerService,
    private readonly configService: ConfigService,
  ) {}

  @Post('daily-bank-sync')
  @ApiOperation({
    summary: 'Trigger daily bank sync for all users (Cron endpoint)',
    description:
      'This endpoint triggers the daily bank synchronization for all users with connected GoCardless accounts. Requires CRON_SECRET header for authentication.',
  })
  @ApiHeader({
    name: 'x-cron-secret',
    description: 'Secret key for cron job authentication',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Daily bank sync triggered successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing cron secret',
  })
  async triggerDailyBankSync(
    @Headers('x-cron-secret') cronSecret: string,
  ): Promise<{ message: string; status: string }> {
    this.logger.log('Daily bank sync endpoint called');

    // Verify cron secret
    const expectedSecret = this.configService.get<string>('CRON_SECRET');

    if (!expectedSecret) {
      this.logger.error('CRON_SECRET not configured in environment variables');
      throw new UnauthorizedException('Cron endpoint not properly configured');
    }

    if (!cronSecret || cronSecret !== expectedSecret) {
      this.logger.warn('Unauthorized cron request - invalid secret');
      throw new UnauthorizedException('Invalid cron secret');
    }

    // Trigger the daily sync
    this.logger.log('Triggering daily bank sync...');

    try {
      await this.schedulerService.dailyBankSync();
      this.logger.log('Daily bank sync completed successfully');

      return {
        message: 'Daily bank sync triggered successfully',
        status: 'success',
      };
    } catch (error) {
      this.logger.error(
        `Daily bank sync failed: ${error.message}`,
        error.stack,
      );
      return {
        message: `Daily bank sync failed: ${error.message}`,
        status: 'error',
      };
    }
  }
}
