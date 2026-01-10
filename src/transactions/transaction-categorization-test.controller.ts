import { Controller, Post, Body, UseGuards, Get, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/user.decorator';
import { User } from '../users/user.entity';
import {
  TransactionCategorizationTestService,
  CategorizationQualityReport,
} from './transaction-categorization-test.service';

@Controller('transactions/categorization-test')
@UseGuards(AuthGuard('jwt'))
export class TransactionCategorizationTestController {
  constructor(
    private readonly categorizationTestService: TransactionCategorizationTestService,
  ) {}

  @Post('test-quality')
  async testCategorizationQuality(
    @CurrentUser() user: User,
    @Body() body: { dryRun?: boolean } = {},
  ): Promise<CategorizationQualityReport> {
    const { dryRun = true } = body;
    return this.categorizationTestService.testCategorizationQuality(
      user.id,
      dryRun,
    );
  }

  @Post('test-gocardless')
  async testGoCardlessCategorization(
    @CurrentUser() user: User,
    @Body() body: { dryRun?: boolean } = {},
  ): Promise<CategorizationQualityReport> {
    const { dryRun = true } = body;
    return this.categorizationTestService.testGoCardlessCategorization(
      user.id,
      dryRun,
    );
  }

  @Get('stats')
  async getCategorizationStats(@CurrentUser() user: User) {
    // Get basic stats about uncategorized transactions
    const dryRunReport =
      await this.categorizationTestService.testCategorizationQuality(
        user.id,
        true,
      );
    const goCardlessReport =
      await this.categorizationTestService.testGoCardlessCategorization(
        user.id,
        true,
      );

    return {
      uncategorized: {
        total: dryRunReport.totalTransactions,
        withMerchantData: goCardlessReport.totalTransactions,
        withoutMerchantData:
          dryRunReport.totalTransactions - goCardlessReport.totalTransactions,
      },
      potentialSuccess: {
        overall: dryRunReport.successRate,
        gocardless: goCardlessReport.successRate,
      },
      recommendations: this.generateRecommendations(
        dryRunReport,
        goCardlessReport,
      ),
    };
  }

  private generateRecommendations(
    overallReport: CategorizationQualityReport,
    goCardlessReport: CategorizationQualityReport,
  ): string[] {
    const recommendations: string[] = [];

    if (overallReport.totalTransactions === 0) {
      recommendations.push(
        'No uncategorized transactions found in the last 90 days.',
      );
      return recommendations;
    }

    if (goCardlessReport.successRate > overallReport.successRate) {
      recommendations.push(
        'GoCardless transactions have higher categorization success rate. Consider importing more GoCardless data.',
      );
    }

    if (overallReport.averageConfidence < 70) {
      recommendations.push(
        'Average confidence is below 70%. Consider improving category keywords or adding more training data.',
      );
    }

    if (
      goCardlessReport.totalTransactions > 0 &&
      goCardlessReport.successRate > 80
    ) {
      recommendations.push(
        'GoCardless AI categorization is performing well. Ready for production use.',
      );
    }

    if (
      overallReport.summary.bySource.ai &&
      overallReport.summary.bySource.ai > 0
    ) {
      recommendations.push(
        'AI categorization is being used. Ensure OpenAI API key is configured for production.',
      );
    }

    return recommendations;
  }
}
