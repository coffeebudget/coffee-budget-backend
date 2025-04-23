import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreateTagDto } from './dto/create-tag.dto';
import { Tag } from './entities/tag.entity';
import { Transaction } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { TransactionOperationsService } from '../shared/transaction-operations.service';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private tagsRepository: Repository<Tag>,
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(RecurringTransaction)
    private recurringTransactionsRepository: Repository<RecurringTransaction>,
    private transactionOperationsService: TransactionOperationsService,
  ) {}

  async create(createTagDto: CreateTagDto, user: User): Promise<Tag> {
    // Check if a tag with the same name already exists
    const existingTag = await this.tagsRepository.findOne({
      where: { name: createTagDto.name },
    });
    if (existingTag) {
      throw new ConflictException(`Tag with name ${createTagDto.name} already exists`);
    }

    const tag = this.tagsRepository.create({
      ...createTagDto,
      user,
    });
    return this.tagsRepository.save(tag);
  }

  async findAll(userId: number): Promise<Tag[]> {
    return this.tagsRepository.find({
      where: { user: { id: userId } },
      relations: ['user'],
    });
  }

  async findOne(id: number, userId: number): Promise<Tag> {
    const tag = await this.tagsRepository.findOne({
      where: { id, user: { id: userId } },
      relations: ['user'],
    });
    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    }
    return tag;
  }

  async update(id: number, updateTagDto: Partial<Tag>, userId: number): Promise<Tag> {
    await this.findOne(id, userId); // Necessary to ensure the tag exists and belongs to the user
    
    // Check if the new name already exists
    if (updateTagDto.name) {
      const existingTag = await this.tagsRepository.findOne({
        where: { name: updateTagDto.name, user: { id: userId } }, 
      });
      if (existingTag && existingTag.id !== id) {
        throw new ConflictException(`Tag with name ${updateTagDto.name} already exists`);
      }
    }

    await this.tagsRepository.update(id, updateTagDto);
    return this.findOne(id, userId);
  }

  async remove(id: number, userId: number): Promise<void> {
    const queryRunner = this.tagsRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check if tag exists and belongs to user
      const tag = await this.findOne(id, userId);

      // Check if tag is used in any transactions
      const transactionsWithTag = await queryRunner.manager.find('Transaction', {
        where: { tags: { id }, user: { id: userId } }
      });

      if (transactionsWithTag.length > 0) {
        throw new ConflictException(
          `Cannot delete tag: it is used in ${transactionsWithTag.length} transaction(s)`
        );
      }

      const result = await queryRunner.manager.delete('Tag', { id, user: { id: userId } });
      
      if (result.affected === 0) {
        throw new NotFoundException(`Tag with ID ${id} not found`);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findByName(name: string, userId: number): Promise<Tag | null> {
    return this.tagsRepository.findOne({ where: { name, user: { id: userId } } });
  }

  async resolveTagsFromString(input: string, userId: number): Promise<Tag[]> {
    const tagNames = input.split(/[,;/]/).map(t => t.trim()).filter(Boolean);
    const tags: Tag[] = [];
  
    for (const name of tagNames) {
      const existing = await this.findByName(name, userId);
      tags.push(existing ?? await this.create({ name }, { id: userId } as User));
    }
  
    return tags;
  }

  /**
   * Bulk tag transactions by their IDs
   * @param transactionIds Array of transaction IDs to tag
   * @param tagIds Array of tag IDs to apply
   * @param userId User ID
   * @returns Number of transactions that were tagged
   */
  async bulkTagByIds(
    transactionIds: number[], 
    tagIds: number[], 
    userId: number
  ): Promise<number> {
    if (!transactionIds || !transactionIds.length) {
      throw new NotFoundException('Transaction IDs array is required');
    }

    if (!tagIds || !tagIds.length) {
      throw new NotFoundException('Tag IDs array is required');
    }

    // Verify the tags exist and belong to the user
    const tags = await this.tagsRepository.find({
      where: { 
        id: In(tagIds),
        user: { id: userId } 
      }
    });

    if (tags.length !== tagIds.length) {
      throw new NotFoundException('One or more tags not found');
    }

    // Find all the transactions that belong to the user
    const transactions = await this.transactionsRepository.find({
      where: { 
        id: In(transactionIds),
        user: { id: userId } 
      },
      relations: ['tags']
    });

    if (!transactions.length) {
      return 0;
    }

    // Add tags to each transaction
    let modifiedCount = 0;

    for (const transaction of transactions) {
      const existingTagIds = transaction.tags.map(tag => tag.id);
      let modified = false;
      
      for (const tag of tags) {
        if (!existingTagIds.includes(tag.id)) {
          transaction.tags.push(tag);
          modified = true;
        }
      }
      
      if (modified) {
        modifiedCount++;
      }
    }

    // Save all transactions if any were modified
    if (modifiedCount > 0) {
      await this.transactionsRepository.save(transactions);
    }

    return modifiedCount;
  }
}