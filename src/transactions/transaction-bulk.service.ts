import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { Transaction } from './transaction.entity';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';
import { Tag } from '../tags/entities/tag.entity';
import { Category } from '../categories/entities/category.entity';
import { PendingDuplicatesService } from '../pending-duplicates/pending-duplicates.service';
import { TagsService } from '../tags/tags.service';
import { CategoriesService } from '../categories/categories.service';

export interface BulkCategorizationResult {
  totalProcessed: number;
  keywordMatched: number;
  aiSuggestions: number;
  errors: number;
  estimatedCost: number;
}

export interface ValidationResult {
  isValid: boolean;
  foundTransactions: number;
  missingTransactions: number[];
  conflicts: Array<{
    transactionId: number;
    type: string;
    message: string;
  }>;
}

export interface BulkStats {
  totalTransactions: number;
  categorizedCount: number;
  uncategorizedCount: number;
  statusCounts: Record<string, number>;
  categoryDistribution: Record<string, number>;
}

@Injectable()
export class TransactionBulkService {
  private readonly logger = new Logger(TransactionBulkService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(PendingDuplicate)
    private readonly pendingDuplicateRepository: Repository<PendingDuplicate>,
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly pendingDuplicatesService: PendingDuplicatesService,
    private readonly tagsService: TagsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  /**
   * Bulk delete transactions by their IDs
   * @param transactionIds Array of transaction IDs to delete
   * @param userId User ID
   * @returns Number of transactions that were deleted
   */
  async bulkDeleteByIds(
    transactionIds: number[],
    userId: number,
  ): Promise<number> {
    if (!transactionIds || !transactionIds.length) {
      throw new BadRequestException('Transaction IDs array is required');
    }

    // First check if the transactions exist and belong to the user
    const transactions = await this.transactionRepository.find({
      where: {
        id: In(transactionIds),
        user: { id: userId },
      },
    });

    if (!transactions.length) {
      return 0;
    }

    // Check for pending duplicates for each transaction
    for (const transaction of transactions) {
      const pendingDuplicates =
        await this.pendingDuplicatesService.findAllByExistingTransactionId(
          transaction.id,
        );
      const unresolvedDuplicates = pendingDuplicates.filter(
        (pd) => !pd.resolved,
      );

      if (unresolvedDuplicates.length > 0) {
        throw new ConflictException(
          `Cannot delete transaction ${transaction.id}: it is referenced by ${unresolvedDuplicates.length} unresolved pending duplicate(s)`,
        );
      }

      // Clean up resolved pending duplicates
      if (pendingDuplicates.length > 0) {
        for (const pd of pendingDuplicates) {
          await this.pendingDuplicatesService.update(
            pd.id,
            { existingTransaction: null },
            userId,
          );
        }
      }
    }

    // Delete all transactions in bulk
    const result = await this.transactionRepository.delete({
      id: In(transactionIds),
      user: { id: userId },
    });

    return result.affected || 0;
  }

  /**
   * Bulk categorize uncategorized transactions
   * @param userId User ID
   * @param batchSize Batch size for processing
   * @returns Categorization results
   */
  async bulkCategorizeUncategorized(
    userId: number,
    batchSize: number = 50,
  ): Promise<BulkCategorizationResult> {
    // Find uncategorized transactions
    const uncategorizedTransactions = await this.transactionRepository.find({
      where: {
        user: { id: userId },
        category: IsNull(),
        suggestedCategory: IsNull(),
      },
      relations: ['user'],
      order: { executionDate: 'DESC' },
    });

    let totalProcessed = 0;
    let keywordMatched = 0;
    let errors = 0;

    // Process transactions in batches
    for (let i = 0; i < uncategorizedTransactions.length; i += batchSize) {
      const batch = uncategorizedTransactions.slice(i, i + batchSize);
      
      for (const transaction of batch) {
        try {
          if (transaction.description) {
            const suggestedCategory = await this.categoriesService.suggestCategoryForDescription(
              transaction.description,
              userId,
            );

            if (suggestedCategory) {
              transaction.category = suggestedCategory;
              keywordMatched++;
            }
          }
        } catch (error) {
          this.logger.error(
            `Error categorizing transaction ${transaction.id}: ${error.message}`,
          );
          errors++;
        }
      }

      // Save the batch
      if (batch.length > 0) {
        await this.transactionRepository.save(batch);
      }

      totalProcessed += batch.length;
    }

    return {
      totalProcessed,
      keywordMatched,
      aiSuggestions: 0, // AI categorization removed
      errors,
      estimatedCost: 0, // No AI cost
    };
  }

  /**
   * Bulk update status of multiple transactions
   * @param transactionIds Array of transaction IDs to update
   * @param status New status
   * @param userId User ID
   * @returns Number of transactions that were updated
   */
  async bulkUpdateStatus(
    transactionIds: number[],
    status: string,
    userId: number,
  ): Promise<number> {
    if (!transactionIds || !transactionIds.length) {
      throw new BadRequestException('Transaction IDs array is required');
    }

    if (!status || status.trim().length === 0) {
      throw new BadRequestException('Status is required');
    }

    // Find transactions
    const transactions = await this.transactionRepository.find({
      where: {
        id: In(transactionIds),
        user: { id: userId },
      },
    });

    if (!transactions.length) {
      return 0;
    }

    // Update status
    for (const transaction of transactions) {
      transaction.status = status as any;
    }

    await this.transactionRepository.save(transactions);
    return transactions.length;
  }

  /**
   * Bulk update tags for multiple transactions
   * @param transactionIds Array of transaction IDs to update
   * @param tagIds Array of tag IDs to assign
   * @param userId User ID
   * @returns Number of transactions that were updated
   */
  async bulkUpdateTags(
    transactionIds: number[],
    tagIds: number[],
    userId: number,
  ): Promise<number> {
    if (!transactionIds || !transactionIds.length) {
      throw new BadRequestException('Transaction IDs array is required');
    }

    if (!tagIds || !tagIds.length) {
      throw new BadRequestException('Tag IDs array is required');
    }

    // Find transactions
    const transactions = await this.transactionRepository.find({
      where: {
        id: In(transactionIds),
        user: { id: userId },
      },
      relations: ['tags'],
    });

    if (!transactions.length) {
      return 0;
    }

    // Find tags
    const tags = await this.tagRepository.find({
      where: { id: In(tagIds) },
    });

    if (!tags.length) {
      throw new NotFoundException('No valid tags found');
    }

    // Update tags
    for (const transaction of transactions) {
      transaction.tags = tags;
    }

    await this.transactionRepository.save(transactions);
    return transactions.length;
  }

  /**
   * Validate bulk operation parameters
   * @param transactionIds Array of transaction IDs to validate
   * @param userId User ID
   * @returns Validation results
   */
  async validateBulkOperation(
    transactionIds: number[],
    userId: number,
  ): Promise<ValidationResult> {
    if (!transactionIds || !transactionIds.length) {
      throw new BadRequestException('Transaction IDs array is required');
    }

    // Find transactions
    const transactions = await this.transactionRepository.find({
      where: {
        id: In(transactionIds),
        user: { id: userId },
      },
    });

    const foundTransactionIds = transactions.map(t => t.id);
    const missingTransactions = transactionIds.filter(id => !foundTransactionIds.includes(id));

    // Check for conflicts
    const conflicts: Array<{
      transactionId: number;
      type: string;
      message: string;
    }> = [];

    for (const transaction of transactions) {
      const pendingDuplicates =
        await this.pendingDuplicatesService.findAllByExistingTransactionId(
          transaction.id,
        );
      const unresolvedDuplicates = pendingDuplicates.filter(
        (pd) => !pd.resolved,
      );

      if (unresolvedDuplicates.length > 0) {
        conflicts.push({
          transactionId: transaction.id,
          type: 'pending_duplicate',
          message: `Transaction has ${unresolvedDuplicates.length} unresolved pending duplicates`,
        });
      }
    }

    return {
      isValid: conflicts.length === 0 && missingTransactions.length === 0,
      foundTransactions: transactions.length,
      missingTransactions,
      conflicts,
    };
  }

  /**
   * Get statistics for bulk operations
   * @param transactionIds Array of transaction IDs to analyze
   * @param userId User ID
   * @returns Bulk operation statistics
   */
  async getBulkOperationStats(
    transactionIds: number[],
    userId: number,
  ): Promise<BulkStats> {
    if (!transactionIds || !transactionIds.length) {
      return {
        totalTransactions: 0,
        categorizedCount: 0,
        uncategorizedCount: 0,
        statusCounts: {},
        categoryDistribution: {},
      };
    }

    // Find transactions
    const transactions = await this.transactionRepository.find({
      where: {
        id: In(transactionIds),
        user: { id: userId },
      },
      relations: ['category'],
    });

    const totalTransactions = transactions.length;
    const categorizedCount = transactions.filter(t => t.category).length;
    const uncategorizedCount = totalTransactions - categorizedCount;

    // Count statuses
    const statusCounts: Record<string, number> = {};
    for (const transaction of transactions) {
      const status = transaction.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    // Count category distribution
    const categoryDistribution: Record<string, number> = {};
    for (const transaction of transactions) {
      if (transaction.category) {
        const categoryName = transaction.category.name;
        categoryDistribution[categoryName] = (categoryDistribution[categoryName] || 0) + 1;
      }
    }

    return {
      totalTransactions,
      categorizedCount,
      uncategorizedCount,
      statusCounts,
      categoryDistribution,
    };
  }
}
