import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Transaction } from './transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { CategoriesService } from '../categories/categories.service';

@Injectable()
export class TransactionCategorizationService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly categoriesService: CategoriesService,
  ) {}

  async categorizeTransactionByDescription(
    transaction: Transaction,
    userId: number,
  ): Promise<Transaction> {
    if (!transaction.description) {
      return transaction;
    }

    try {
      const suggestedCategory = await this.categoriesService.suggestCategoryForDescription(
        transaction.description,
        userId,
      );

      if (suggestedCategory) {
        transaction.category = suggestedCategory;
        await this.transactionRepository.save(transaction);
      }

      return transaction;
    } catch (error) {
      throw error;
    }
  }

  async bulkCategorizeByIds(
    transactionIds: number[],
    categoryId: number,
    userId: number,
  ): Promise<number> {
    if (!transactionIds || !transactionIds.length) {
      throw new BadRequestException('Transaction IDs array is required');
    }

    const category = await this.categoryRepository.findOne({
      where: { id: categoryId, user: { id: userId } },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }

    const transactions = await this.transactionRepository.find({
      where: {
        id: In(transactionIds),
        user: { id: userId },
      },
      relations: ['category'],
    });

    if (!transactions.length) {
      return 0;
    }

    for (const transaction of transactions) {
      transaction.category = category;
    }

    await this.transactionRepository.save(transactions);
    return transactions.length;
  }

  async bulkUncategorizeByIds(
    transactionIds: number[],
    userId: number,
  ): Promise<number> {
    if (!transactionIds || !transactionIds.length) {
      throw new BadRequestException('Transaction IDs array is required');
    }

    const result = await this.transactionRepository.query(
      `UPDATE "transaction" 
       SET "categoryId" = NULL 
       WHERE "id" IN (${transactionIds.join(',')}) 
       AND "userId" = $1`,
      [userId],
    );

    return result.affected || 0;
  }

  async acceptSuggestedCategory(
    transactionId: number,
    userId: number,
  ): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId, user: { id: userId } },
      relations: ['suggestedCategory', 'category'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (!transaction.suggestedCategory) {
      throw new BadRequestException('No suggested category available');
    }

    const acceptedCategory = transaction.suggestedCategory;
    transaction.category = acceptedCategory;
    transaction.suggestedCategory = null;
    transaction.suggestedCategoryName = null;

    return await this.transactionRepository.save(transaction);
  }

  async rejectSuggestedCategory(
    transactionId: number,
    userId: number,
  ): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId, user: { id: userId } },
      relations: ['suggestedCategory'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    transaction.suggestedCategory = null;
    transaction.suggestedCategoryName = null;

    return await this.transactionRepository.save(transaction);
  }

  async validateCategoryForUser(
    categoryId: number,
    userId: number,
  ): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId, user: { id: userId } },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }

    return category;
  }

  async suggestCategoryForTransaction(
    description: string,
    userId: number,
  ): Promise<Category | null> {
    if (!description || description.trim().length === 0) {
      return null;
    }

    return await this.categoriesService.suggestCategoryForDescription(
      description,
      userId,
    );
  }
}
