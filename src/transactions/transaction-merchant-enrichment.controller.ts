import { Controller, Post, Body, UseGuards, Get, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/user.decorator';
import { User } from '../users/user.entity';
import { TransactionMerchantEnrichmentService, EnrichmentResult } from './transaction-merchant-enrichment.service';

@Controller('admin/merchant-enrichment')
@UseGuards(AuthGuard('jwt'))
export class TransactionMerchantEnrichmentController {
  constructor(
    private readonly enrichmentService: TransactionMerchantEnrichmentService,
  ) {}

  @Post('enrich')
  async enrichTransactionsWithMerchantData(
    @CurrentUser() user: User,
    @Body() body: { dryRun?: boolean } = {}
  ): Promise<EnrichmentResult> {
    const { dryRun = true } = body;
    return this.enrichmentService.enrichTransactionsWithMerchantData(user.id, dryRun);
  }

  @Get('stats')
  async getEnrichmentStats(@CurrentUser() user: User) {
    return this.enrichmentService.getEnrichmentStats(user.id);
  }

  @Get('test-enrichment')
  async testEnrichment(
    @CurrentUser() user: User,
    @Query('dryRun') dryRun: string = 'true'
  ): Promise<EnrichmentResult> {
    const isDryRun = dryRun.toLowerCase() === 'true';
    return this.enrichmentService.enrichTransactionsWithMerchantData(user.id, isDryRun);
  }

}