import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RecurringTransaction } from './entities/recurring-transaction.entity';
import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';
import { UpdateRecurringTransactionDto } from './dto/update-recurring-transaction.dto';
import { User } from '../users/user.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { RecurringTransactionGeneratorService } from './recurring-transaction-generator.service';
import { Logger } from '@nestjs/common';
import { RecurringPatternDetectorService } from './recurring-pattern-detector.service';

/**
 * Service for managing recurring transactions
 * Simplified for analytics purposes only - no transaction generation or linking
 */
@Injectable()
export class RecurringTransactionsService {
  private readonly logger = new Logger(RecurringTransactionsService.name);

  constructor(
    @InjectRepository(RecurringTransaction)
    private recurringTransactionRepository: Repository<RecurringTransaction>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectRepository(Tag)
    private tagRepository: Repository<Tag>,
    @InjectRepository(BankAccount)
    private bankAccountRepository: Repository<BankAccount>,
    @InjectRepository(CreditCard)
    private creditCardRepository: Repository<CreditCard>,
    private recurringTransactionGeneratorService: RecurringTransactionGeneratorService,
    private recurringPatternDetectorService: RecurringPatternDetectorService,
  ) {}

  async create(
    createRecurringTransactionDto: CreateRecurringTransactionDto,
    user: User,
  ): Promise<RecurringTransaction> {
    // Ensure name is not too long
    if (
      createRecurringTransactionDto.name &&
      createRecurringTransactionDto.name.length > 255
    ) {
      createRecurringTransactionDto.name =
        createRecurringTransactionDto.name.substring(0, 255);
    }

    if (!createRecurringTransactionDto.categoryId) {
      throw new BadRequestException('Category ID is required');
    }

    const category = await this.categoryRepository.findOne({
      where: {
        id: createRecurringTransactionDto.categoryId,
        user: { id: user.id },
      },
    });
    if (!category) {
      throw new NotFoundException(
        `Category with ID ${createRecurringTransactionDto.categoryId} not found`,
      );
    }

    let tags: Tag[] = [];
    if (createRecurringTransactionDto.tagIds?.length) {
      tags = await this.tagRepository.find({
        where: {
          id: In(createRecurringTransactionDto.tagIds),
          user: { id: user.id },
        },
      });
      if (tags.length !== createRecurringTransactionDto.tagIds.length) {
        throw new NotFoundException('One or more tags not found');
      }
    }

    const bankAccount = createRecurringTransactionDto.bankAccountId
      ? await this.bankAccountRepository.findOne({
          where: {
            id: createRecurringTransactionDto.bankAccountId,
            user: { id: user.id },
          },
        })
      : null;
    const creditCard = createRecurringTransactionDto.creditCardId
      ? await this.creditCardRepository.findOne({
          where: {
            id: createRecurringTransactionDto.creditCardId,
            user: { id: user.id },
          },
        })
      : null;

    if (!bankAccount && !creditCard) {
      throw new BadRequestException(
        'Either bankAccountId or creditCardId must be provided',
      );
    }

    const recurringTransaction = this.recurringTransactionRepository.create({
      ...createRecurringTransactionDto,
      user,
      category,
      tags,
      bankAccount,
      creditCard,
    });

    // Validate endDate if provided
    if (recurringTransaction.endDate) {
      const endDate = new Date(recurringTransaction.endDate);
      if (isNaN(endDate.getTime())) {
        this.logger.warn(
          `Invalid endDate detected in create: ${recurringTransaction.endDate}, setting to null`,
        );
        recurringTransaction.endDate = null;
      }
    }

    // Calculate next occurrence date for analytics
    const nextOccurrence =
      this.recurringTransactionGeneratorService.calculateNextExecutionDate(
        new Date(recurringTransaction.startDate),
        recurringTransaction,
      );

    recurringTransaction.nextOccurrence = nextOccurrence;

    // Save the recurring transaction
    return this.recurringTransactionRepository.save(recurringTransaction);
  }

  async findAll(userId: number): Promise<RecurringTransaction[]> {
    return this.recurringTransactionRepository.find({
      where: { user: { id: userId } },
      relations: ['category', 'tags', 'bankAccount', 'creditCard'],
    });
  }

  async findOne(id: number, userId: number): Promise<RecurringTransaction> {
    const recurringTransaction =
      await this.recurringTransactionRepository.findOne({
        where: { id, user: { id: userId } },
        relations: ['category', 'tags', 'bankAccount', 'creditCard'],
      });

    if (!recurringTransaction) {
      throw new NotFoundException(
        `Recurring Transaction with ID ${id} not found`,
      );
    }
    return recurringTransaction;
  }

  async update(
    id: number,
    updateDto: UpdateRecurringTransactionDto,
    userId: number,
  ): Promise<RecurringTransaction> {
    const existingTransaction =
      await this.recurringTransactionRepository.findOne({
        where: { id, user: { id: userId } },
        relations: ['category', 'tags', 'bankAccount', 'creditCard'],
      });

    if (!existingTransaction) {
      throw new NotFoundException('Recurring transaction not found');
    }

    // Handle category update if provided
    if (
      updateDto.categoryId &&
      updateDto.categoryId !== existingTransaction.category?.id
    ) {
      const category = await this.categoryRepository.findOne({
        where: { id: updateDto.categoryId, user: { id: userId } },
      });
      if (!category) {
        throw new NotFoundException(
          `Category with ID ${updateDto.categoryId} not found`,
        );
      }
      existingTransaction.category = category;
    }

    // Handle tags update if provided
    if (updateDto.tagIds) {
      const tags = await this.tagRepository.find({
        where: { id: In(updateDto.tagIds), user: { id: userId } },
      });
      if (tags.length !== updateDto.tagIds.length) {
        throw new NotFoundException('One or more tags not found');
      }
      existingTransaction.tags = tags;
    }

    // Handle bank account update if provided
    if (updateDto.bankAccountId) {
      const bankAccount = await this.bankAccountRepository.findOne({
        where: { id: updateDto.bankAccountId, user: { id: userId } },
      });
      if (!bankAccount) {
        throw new NotFoundException(
          `Bank account with ID ${updateDto.bankAccountId} not found`,
        );
      }
      existingTransaction.bankAccount = bankAccount;
    }

    // Handle credit card update if provided
    if (updateDto.creditCardId) {
      const creditCard = await this.creditCardRepository.findOne({
        where: { id: updateDto.creditCardId, user: { id: userId } },
      });
      if (!creditCard) {
        throw new NotFoundException(
          `Credit card with ID ${updateDto.creditCardId} not found`,
        );
      }
      existingTransaction.creditCard = creditCard;
    }

    // Update other fields
    if (updateDto.name) existingTransaction.name = updateDto.name;
    if (updateDto.description)
      existingTransaction.description = updateDto.description;
    if (updateDto.amount) existingTransaction.amount = updateDto.amount;
    if (updateDto.status) existingTransaction.status = updateDto.status;
    if (updateDto.type) existingTransaction.type = updateDto.type;
    if (updateDto.frequencyEveryN)
      existingTransaction.frequencyEveryN = updateDto.frequencyEveryN;
    if (updateDto.frequencyType)
      existingTransaction.frequencyType = updateDto.frequencyType;
    if (updateDto.occurrences)
      existingTransaction.occurrences = updateDto.occurrences;
    if (updateDto.startDate)
      existingTransaction.startDate = updateDto.startDate;

    // Handle endDate in update method
    if (updateDto.endDate !== undefined) {
      // Handle empty string or null case
      if (
        updateDto.endDate === null ||
        String(updateDto.endDate).trim() === ''
      ) {
        existingTransaction.endDate = null;
      } else {
        // Try to parse the date, and fallback to null if invalid
        try {
          const endDate = new Date(updateDto.endDate);
          if (!isNaN(endDate.getTime())) {
            existingTransaction.endDate = endDate;
          } else {
            this.logger.warn(
              `Invalid endDate detected in update: ${updateDto.endDate}, setting to null`,
            );
            existingTransaction.endDate = null;
          }
        } catch (error) {
          this.logger.warn(
            `Error parsing endDate: ${error.message}, setting to null`,
          );
          existingTransaction.endDate = null;
        }
      }
    }

    // Recalculate next occurrence date
    if (
      updateDto.startDate ||
      updateDto.frequencyType ||
      updateDto.frequencyEveryN
    ) {
      const nextOccurrence =
        this.recurringTransactionGeneratorService.calculateNextExecutionDate(
          new Date(),
          existingTransaction,
        );
      existingTransaction.nextOccurrence = nextOccurrence;
    }

    return this.recurringTransactionRepository.save(existingTransaction);
  }

  async remove(id: number, userId: number): Promise<void> {
    const recurringTransaction =
      await this.recurringTransactionRepository.findOne({
        where: { id, user: { id: userId } },
      });

    if (!recurringTransaction) {
      throw new NotFoundException(
        `Recurring Transaction with ID ${id} not found`,
      );
    }

    await this.recurringTransactionRepository.remove(recurringTransaction);
  }

  async detectAllPatterns(userId: number) {
    return this.recurringPatternDetectorService.detectAllRecurringPatterns(
      userId,
    );
  }

  async getUnconfirmedPatterns(_userId: number) {
    // For now, return an empty array since the system doesn't maintain
    // a separate concept of "unconfirmed" patterns. The frontend
    // RecurringTransactionAlert will hide when the array is empty.
    return [];
  }
}
