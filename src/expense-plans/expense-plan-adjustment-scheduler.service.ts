import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { ExpensePlanAdjustmentService } from './expense-plan-adjustment.service';

export interface WeeklyReviewResult {
  usersProcessed: number;
  usersFailed: number;
  totalPlansReviewed: number;
  totalNewSuggestions: number;
  totalClearedSuggestions: number;
}

@Injectable()
export class ExpensePlanAdjustmentSchedulerService {
  private readonly logger = new Logger(
    ExpensePlanAdjustmentSchedulerService.name,
  );

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly adjustmentService: ExpensePlanAdjustmentService,
  ) {}

  /**
   * Weekly job to review all active expense plans and detect adjustment needs.
   * Runs every Sunday at 2:00 AM.
   */
  @Cron('0 2 * * 0') // Sunday at 2:00 AM
  async weeklyAdjustmentReview(): Promise<WeeklyReviewResult> {
    this.logger.log('Starting weekly expense plan adjustment review...');

    const users = await this.userRepository.find({
      where: { isDemoUser: false },
    });

    this.logger.log(`Found ${users.length} non-demo users to process`);

    let usersProcessed = 0;
    let usersFailed = 0;
    let totalPlansReviewed = 0;
    let totalNewSuggestions = 0;
    let totalClearedSuggestions = 0;

    for (const user of users) {
      try {
        const result = await this.adjustmentService.reviewAllPlansForUser(
          user.id,
        );
        usersProcessed++;
        totalPlansReviewed += result.plansReviewed;
        totalNewSuggestions += result.newSuggestions;
        totalClearedSuggestions += result.clearedSuggestions;
      } catch (error) {
        usersFailed++;
        this.logger.error(
          `Failed to process user ${user.id}: ${error.message}`,
          error.stack,
        );
      }
    }

    const summary: WeeklyReviewResult = {
      usersProcessed,
      usersFailed,
      totalPlansReviewed,
      totalNewSuggestions,
      totalClearedSuggestions,
    };

    this.logger.log(
      `Weekly review complete: ${usersProcessed} users processed, ${totalPlansReviewed} plans reviewed, ` +
        `${totalNewSuggestions} new suggestions, ${totalClearedSuggestions} cleared`,
    );

    return summary;
  }
}
