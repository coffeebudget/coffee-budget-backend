import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Transaction } from './transaction.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { DuplicateTransactionChoice } from './dto/duplicate-transaction-choice.dto';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import { PendingDuplicatesService } from '../pending-duplicates/pending-duplicates.service';

@Injectable()
export class TransactionCreationService {
  private readonly logger = new Logger(TransactionCreationService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(BankAccount)
    private bankAccountsRepository: Repository<BankAccount>,
    @InjectRepository(CreditCard)
    private creditCardsRepository: Repository<CreditCard>,
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(Tag)
    private tagRepository: Repository<Tag>,
    private categoriesService: CategoriesService,
    private tagsService: TagsService,
    private pendingDuplicatesService: PendingDuplicatesService,
  ) {}

  async createAndSaveTransaction(
    createTransactionDto: CreateTransactionDto,
    userId: number,
    duplicateChoice?: DuplicateTransactionChoice,
    skipDuplicateCheck: boolean = false,
  ): Promise<Transaction> {
    const { bankAccountId, creditCardId, source, executionDate, tagIds } =
      createTransactionDto;

    // Validation logic
    let category: Category | null = null;
    let suggestedCategory: Category | null = null;

    if (createTransactionDto.categoryId && createTransactionDto.categoryId > 0) {
      category = await this.categoriesRepository.findOne({
        where: { id: createTransactionDto.categoryId, user: { id: userId } },
      });

      if (!category) {
        throw new NotFoundException(
          `Category with ID ${createTransactionDto.categoryId} not found`,
        );
      }
    } else if (createTransactionDto.description) {
      // Try keyword-based categorization only
      suggestedCategory = await this.categoriesService.suggestCategoryForDescription(
        createTransactionDto.description,
        userId,
      );
    }

    // Validate payment method
    if ((bankAccountId && creditCardId) || (!bankAccountId && !creditCardId)) {
      throw new BadRequestException(
        'You must provide either a bank account ID or a credit card ID, but not both.',
      );
    }

    // Set default executionDate to current date if not provided
    const transactionExecutionDate = executionDate
      ? new Date(executionDate)
      : new Date();

    // Calculate billing date
    let billingDate: Date;
    if (creditCardId) {
      const creditCard = await this.creditCardsRepository.findOne({
        where: { id: creditCardId, user: { id: userId } },
      });
      if (!creditCard) {
        throw new NotFoundException(
          `Credit Card with ID ${creditCardId} not found`,
        );
      }
      billingDate = this.calculateBillingDate(
        transactionExecutionDate,
        creditCard.billingDay,
      );
    } else {
      // For bank accounts, validate the bank account exists
      if (bankAccountId) {
        const bankAccount = await this.bankAccountsRepository.findOne({
          where: { id: bankAccountId, user: { id: userId } },
        });
        if (!bankAccount) {
          throw new NotFoundException(
            `Bank Account with ID ${bankAccountId} not found`,
          );
        }
      }
      billingDate = transactionExecutionDate; // For bank accounts
    }

    // Determine the status based on the execution date
    const status =
      transactionExecutionDate > new Date() ? 'pending' : 'executed';

    // Check for duplicates only if not skipped
    if (!skipDuplicateCheck) {
      const duplicateTransaction = await this.findPotentialDuplicate(
        createTransactionDto.amount,
        createTransactionDto.type,
        transactionExecutionDate,
        userId,
      );

      if (duplicateTransaction) {
        return this.handleDuplicateConfirmation(
          duplicateTransaction,
          createTransactionDto,
          userId,
          duplicateChoice,
        );
      }
    }

    // Handle tags
    let tags: Tag[] = [];
    if (tagIds) {
      tags = await this.tagRepository.find({ where: { id: In(tagIds) } });
      if (tags.length !== tagIds.length) {
        throw new NotFoundException('One or more tags not found');
      }
    }

    // Create the transaction
    const transaction = this.transactionsRepository.create({
      ...createTransactionDto,
      user: { id: userId },
      category: category || suggestedCategory || undefined,
      suggestedCategory: suggestedCategory || undefined,
      suggestedCategoryName: suggestedCategory?.name || undefined,
      bankAccount: bankAccountId ? { id: bankAccountId } : undefined,
      creditCard: creditCardId ? { id: creditCardId } : undefined,
      tags,
      executionDate: transactionExecutionDate,
      billingDate,
      status,
      source: source || 'manual',
    });

    return this.transactionsRepository.save(transaction);
  }

  async findPotentialDuplicate(
    amount: number,
    type: 'income' | 'expense',
    executionDate: Date,
    userId: number,
  ): Promise<Transaction | null> {
    return this.transactionsRepository.findOne({
      where: {
        amount,
        type,
        user: { id: userId },
        executionDate: Between(
          new Date(executionDate.getTime() - 24 * 60 * 60 * 1000),
          new Date(executionDate.getTime() + 24 * 60 * 60 * 1000),
        ),
      },
    });
  }

  async handleDuplicateConfirmation(
    existingTransaction: Transaction,
    newTransactionData: CreateTransactionDto,
    userId: number,
    userChoice?: DuplicateTransactionChoice,
  ): Promise<Transaction> {
    if (!userChoice) {
      // Create pending duplicate for user decision
      await this.pendingDuplicatesService.createPendingDuplicate(
        existingTransaction,
        newTransactionData,
        userId,
      );
      throw new BadRequestException(
        'Duplicate transaction detected. Please choose how to handle it.',
      );
    }

    return this.handleDuplicateResolution(
      existingTransaction,
      newTransactionData,
      userId,
      userChoice,
    );
  }

  async handleDuplicateResolution(
    existingTransaction: Transaction,
    newTransactionData: CreateTransactionDto,
    userId: number,
    choice: DuplicateTransactionChoice,
  ): Promise<Transaction> {
    switch (choice) {
      case DuplicateTransactionChoice.USE_NEW:
        // Replace existing transaction with new one
        await this.transactionsRepository.delete(existingTransaction.id);
        return this.createAndSaveTransaction(newTransactionData, userId, undefined, true);
      
      case DuplicateTransactionChoice.KEEP_EXISTING:
        // Keep existing transaction, discard new one
        return existingTransaction;
      
      case DuplicateTransactionChoice.MAINTAIN_BOTH:
        // Create new transaction alongside existing one
        return this.createAndSaveTransaction(newTransactionData, userId, undefined, true);
      
      default:
        throw new BadRequestException('Invalid duplicate choice');
    }
  }

  calculateBillingDate(executionDate: Date, billingDay: number): Date {
    const billingDate = new Date(executionDate);
    billingDate.setDate(billingDay);
    
    // If the billing day has already passed this month, use next month
    if (billingDate <= executionDate) {
      billingDate.setMonth(billingDate.getMonth() + 1);
    }
    
    return billingDate;
  }

  async transactionExists(
    amount: number,
    type: 'income' | 'expense',
    executionDate: Date,
    userId: number,
  ): Promise<boolean> {
    if (!executionDate) {
      throw new BadRequestException('Execution date is required');
    }

    const transaction = await this.transactionsRepository.findOne({
      where: {
        amount,
        type,
        user: { id: userId },
        executionDate: Between(
          new Date(executionDate.getTime() - 24 * 60 * 60 * 1000),
          new Date(executionDate.getTime() + 24 * 60 * 60 * 1000),
        ),
      },
    });

    return !!transaction;
  }
}
