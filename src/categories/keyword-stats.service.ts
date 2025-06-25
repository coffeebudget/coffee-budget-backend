import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { KeywordStats } from './entities/keyword-stats.entity';
import { Category } from './entities/category.entity';
import { User } from '../users/user.entity';

@Injectable()
export class KeywordStatsService {
  private readonly logger = new Logger(KeywordStatsService.name);

  constructor(
    @InjectRepository(KeywordStats)
    private keywordStatsRepository: Repository<KeywordStats>,
  ) {}

  /**
   * Track keyword usage
   */
  async trackKeywordUsage(
    keyword: string,
    category: Category | null,
    user: User,
    success: boolean = false,
  ): Promise<KeywordStats | null> {
    try {
      // Normalize the keyword
      const normalizedKeyword = keyword.trim().toLowerCase();

      // Find existing stats
      let stats = await this.keywordStatsRepository.findOne({
        where: category
          ? {
              keyword: normalizedKeyword,
              user: { id: user.id },
              category: { id: category.id },
            }
          : {
              keyword: normalizedKeyword,
              user: { id: user.id },
              category: IsNull(),
            },
      });

      if (!stats) {
        stats = this.keywordStatsRepository.create({
          keyword: normalizedKeyword,
          category,
          user,
          count: 0,
          successCount: 0,
        });
      }

      // Update stats
      stats.count++;
      if (success) {
        stats.successCount++;
      }
      stats.lastUsed = new Date();

      return this.keywordStatsRepository.save(stats);
    } catch (error) {
      this.logger.error(
        `Error tracking keyword usage: ${error.message}`,
        error.stack,
      );
      // Don't throw, just return null to avoid breaking the main process
      return null;
    }
  }

  /**
   * Get keyword usage statistics for a user
   */
  async getKeywordStats(userId: number): Promise<KeywordStats[]> {
    return this.keywordStatsRepository.find({
      where: { user: { id: userId } },
      relations: ['category'],
      order: { count: 'DESC' },
      take: 100,
    });
  }

  /**
   * Get popular keywords for a user
   */
  async getPopularKeywords(
    userId: number,
  ): Promise<{ keyword: string; count: number; success: number }[]> {
    const stats = await this.keywordStatsRepository.find({
      where: { user: { id: userId } },
      order: { count: 'DESC' },
      take: 50,
    });

    return stats.map((stat) => ({
      keyword: stat.keyword,
      count: stat.count,
      success: stat.successCount,
    }));
  }

  /**
   * Get top keywords by success rate (for categorizations)
   */
  async getTopKeywordsByCategorySuccess(
    userId: number,
    limit: number = 20,
  ): Promise<{ keyword: string; category: Category; successRate: number }[]> {
    const stats = await this.keywordStatsRepository.find({
      where: {
        user: { id: userId },
        category: IsNull(),
      },
      relations: ['category'],
      order: { successCount: 'DESC' },
      take: limit * 2, // Fetch more since we'll filter some out
    });

    return stats
      .filter((stat) => stat.count > 0 && stat.category !== null)
      .map((stat) => ({
        keyword: stat.keyword,
        category: stat.category as Category, // Safe cast since we filtered nulls
        successRate: (stat.successCount / stat.count) * 100,
      }))
      .slice(0, limit); // Limit to requested amount
  }
}
