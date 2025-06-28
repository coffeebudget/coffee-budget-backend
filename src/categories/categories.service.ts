import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository, Raw } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { KeywordExtractionService } from './keyword-extraction.service';
import { KeywordStatsService } from './keyword-stats.service';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(RecurringTransaction)
    private recurringTransactionsRepository: Repository<RecurringTransaction>,
    private keywordExtractionService: KeywordExtractionService,
    private keywordStatsService: KeywordStatsService,
  ) {}

  async create(
    createCategoryDto: CreateCategoryDto,
    user: User,
  ): Promise<Category> {
    const existingCategory = await this.categoriesRepository.findOne({
      where: {
        name: createCategoryDto.name,
        user: { id: user.id },
      },
    });
    if (existingCategory) {
      throw new ConflictException(
        `Category with name ${createCategoryDto.name} already exists for this user`,
      );
    }

    // Process keywords if they exist
    if (createCategoryDto.keywords) {
      createCategoryDto.keywords = createCategoryDto.keywords.map((k) =>
        k.trim().toLowerCase(),
      );
    }

    const category = this.categoriesRepository.create({
      ...createCategoryDto,
      user,
    });
    return this.categoriesRepository.save(category);
  }

  async update(
    id: number,
    updateCategoryDto: UpdateCategoryDto,
    userId: number,
  ): Promise<Category> {
    const category = await this.findOne(id, userId); // Ensure it exists and belongs to the user

    // Prevent duplicate name
    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      const existingCategory = await this.categoriesRepository.findOne({
        where: {
          name: updateCategoryDto.name,
          user: { id: userId },
        },
      });

      if (existingCategory && existingCategory.id !== id) {
        throw new ConflictException(
          `Category with name ${updateCategoryDto.name} already exists for this user`,
        );
      }
    }

    // Merge only fields that are defined
    if (updateCategoryDto.name !== undefined)
      category.name = updateCategoryDto.name;
    if (updateCategoryDto.keywords !== undefined) {
      category.keywords = updateCategoryDto.keywords.map((k) =>
        k.trim().toLowerCase(),
      );
    }

    if (updateCategoryDto.excludeFromExpenseAnalytics !== undefined)
      category.excludeFromExpenseAnalytics =
        updateCategoryDto.excludeFromExpenseAnalytics;
    if (updateCategoryDto.analyticsExclusionReason !== undefined)
      category.analyticsExclusionReason =
        updateCategoryDto.analyticsExclusionReason;

    // 🎯 Budget Management Fields
    if (updateCategoryDto.budgetLevel !== undefined)
      category.budgetLevel = updateCategoryDto.budgetLevel;
    if (updateCategoryDto.monthlyBudget !== undefined)
      category.monthlyBudget = updateCategoryDto.monthlyBudget;
    if (updateCategoryDto.yearlyBudget !== undefined)
      category.yearlyBudget = updateCategoryDto.yearlyBudget;

    if (updateCategoryDto.maxThreshold !== undefined)
      category.maxThreshold = updateCategoryDto.maxThreshold;
    if (updateCategoryDto.warningThreshold !== undefined)
      category.warningThreshold = updateCategoryDto.warningThreshold;

    return this.categoriesRepository.save(category);
  }

  async findAll(userId: number): Promise<Category[]> {
    return this.categoriesRepository.find({
      where: { user: { id: userId } },
      relations: ['user'],
    });
  }

  async findOne(id: number, userId: number): Promise<Category> {
    const category = await this.categoriesRepository.findOne({
      where: { id, user: { id: userId } },
      relations: ['user'],
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return category;
  }

  async remove(id: number, userId: number): Promise<void> {
    const queryRunner =
      this.categoriesRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check if category exists and belongs to user
      const category = await this.findOne(id, userId);

      // Check if category is used in any transactions
      const transactionsWithCategory = await queryRunner.manager.find(
        'Transaction',
        {
          where: { category: { id }, user: { id: userId } },
        },
      );

      if (transactionsWithCategory.length > 0) {
        throw new ConflictException(
          `Cannot delete category: it is used in ${transactionsWithCategory.length} transaction(s)`,
        );
      }

      // Perform the deletion
      const result = await queryRunner.manager.delete('Category', {
        id,
        user: { id: userId },
      });

      if (result.affected === 0) {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findByName(name: string, userId: number): Promise<Category | null> {
    return this.categoriesRepository.findOne({
      where: { name, user: { id: userId } },
    });
  }

  public async createDefaultCategoriesForUser(user: User): Promise<void> {
    const defaultNames = [
      // 🏠 Casa & Utenze
      'Affitto',
      'Mutuo',
      'Energia elettrica',
      'Gas',
      'Acqua',
      'Internet e telefono',
      'Spese condominiali',
      'Manutenzione casa',
      'Elettrodomestici',

      // 🚗 Trasporti
      'Carburante',
      'Assicurazione auto',
      'Bollo auto',
      'Manutenzione auto',
      'Mezzi pubblici',
      'Parcheggi / pedaggi',
      'Noleggi auto / scooter',

      // 🛒 Spese quotidiane
      'Spesa alimentare',
      'Farmacia',
      'Cura personale',
      'Tabacchi',

      // 🍽️ Ristoranti & bar
      'Ristorante',
      'Bar / colazione',
      'Take away / delivery',

      // 🛍️ Shopping
      'Abbigliamento',
      'Elettronica',
      'Regali',
      'Libri / media',

      // 🎓 Istruzione & formazione
      'Scuola / università',
      'Libri scolastici',
      'Corsi / abbonamenti educativi',

      // ⚕️ Salute
      'Visite mediche',
      'Analisi / esami',
      'Assicurazioni sanitarie',

      // 👶 Famiglia & figli
      'Asilo / scuola',
      'Abbigliamento bambini',
      'Baby sitter',
      'Attività ricreative',

      // 🎉 Tempo libero
      'Viaggi',
      'Abbonamenti streaming',
      'Cinema / teatro',
      'Eventi / concerti',
      'Sport / palestra',

      // 💼 Lavoro & professione
      'Spese professionali',
      'Utenze business',
      'Materiale da ufficio',

      // 💸 Finanza personale
      'Risparmi',
      'Investimenti',
      'Donazioni',
      'Commissioni bancarie',
    ];

    const categoryRepo =
      this.categoriesRepository.manager.getRepository(Category);

    const categories = defaultNames.map((name) =>
      categoryRepo.create({ name, user }),
    );
    await categoryRepo.save(categories);
  }

  /**
   * Suggest a category for a transaction description
   * DISABLED: Auto-categorization disabled to prevent incorrect categorizations
   */
  async suggestCategoryForDescription(
    description: string,
    userId: number,
  ): Promise<Category | null> {
    if (!description || description.trim().length === 0) {
      return null;
    }

    // Only use keyword-based categorization (AI categorization disabled)
    return this.findCategoryByKeywordMatch(description, userId);
  }

  /**
   * Find a category that matches keywords in the transaction description
   */
  private async findCategoryByKeywordMatch(
    description: string,
    userId: number,
  ): Promise<Category | null> {
    // Get all categories for the user
    const categories = await this.findAll(userId);
    
    // Normalize the description for matching
    const normalizedDescription = description
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
    
    // Find categories that have keywords matching the description
    for (const category of categories) {
      if (category.keywords && category.keywords.length > 0) {
        for (const keyword of category.keywords) {
          const normalizedKeyword = keyword
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .trim()
            .replace(/\s+/g, ' ');
          
          // Check if the keyword matches the description
          if (normalizedKeyword.includes(' ')) {
            // Multi-word keyword: check if all words appear in description
            const keywordWords = normalizedKeyword.split(' ');
            const descriptionWords = normalizedDescription.split(' ');
            const allWordsMatch = keywordWords.every(word => 
              descriptionWords.includes(word)
            );
            if (allWordsMatch) {
              return category;
            }
          } else {
            // Single word: check if it appears in description
            if (normalizedDescription.includes(normalizedKeyword)) {
              return category;
            }
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Suggest keywords from a transaction description
   */
  async suggestKeywordsFromTransaction(
    transaction: Transaction,
  ): Promise<string[]> {
    if (!transaction.description) {
      return [];
    }

    return this.keywordExtractionService.extractKeywords(
      transaction.description,
    );
  }

  async suggestKeywordsForCategory(
    categoryId: number,
    userId: number,
  ): Promise<string[]> {
    return this.keywordExtractionService.suggestKeywordsForCategory(
      categoryId,
      userId,
    );
  }

  async addKeywordToCategory(
    categoryId: number,
    keyword: string,
    userId: number,
  ): Promise<Category> {
    const category = await this.findOne(categoryId, userId);

    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }

    // Normalize the keyword - remove punctuation, trim, and normalize spaces
    const normalizedKeyword = keyword
      .trim()
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

    // Check if the keyword already exists
    if (!category.keywords) {
      category.keywords = [];
    }

    if (!category.keywords.includes(normalizedKeyword)) {
      category.keywords.push(normalizedKeyword);
      await this.categoriesRepository.save(category);
    }

    return category;
  }

  async removeKeywordFromCategory(
    categoryId: number,
    keyword: string,
    userId: number,
  ): Promise<Category> {
    const category = await this.findOne(categoryId, userId);
    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }

    // Normalize keyword
    const normalizedKeyword = keyword.toLowerCase().trim();

    // Remove keyword if it exists
    if (category.keywords && category.keywords.includes(normalizedKeyword)) {
      category.keywords = category.keywords.filter(
        (k) => k !== normalizedKeyword,
      );
      await this.categoriesRepository.save(category);
    }

    return category;
  }

  async findUncategorizedTransactions(userId: number): Promise<Transaction[]> {
    const transactions = await this.transactionsRepository.find({
      where: { user: { id: userId }, category: IsNull() },
      relations: ['bankAccount', 'creditCard', 'tags', 'suggestedCategory'],
      order: { executionDate: 'DESC' },
    });

    // Process each transaction to suggest categories based on keywords only
    for (const transaction of transactions) {
      if (transaction.description && !transaction.suggestedCategory) {
        const suggestedCategory = await this.findCategoryByKeywordMatch(
          transaction.description,
          userId,
        );
        
        if (suggestedCategory) {
          transaction.suggestedCategory = suggestedCategory;
          transaction.suggestedCategoryName = suggestedCategory.name;
          // Save the suggestion to the database
          await this.transactionsRepository.save(transaction);
        }
      }
    }

    return transactions;
  }

  async bulkCategorizeByKeyword(
    keyword: string,
    categoryId: number,
    userId: number,
  ): Promise<number> {
    const category = await this.findOne(categoryId, userId);
    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }

    // Normalize the keyword - remove punctuation, normalize spaces and trim
    const normalizedKeyword = keyword
      .trim()
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

    // Add the keyword to the category if it's not already there
    if (!category.keywords.includes(normalizedKeyword)) {
      category.keywords.push(normalizedKeyword);
      await this.categoriesRepository.save(category);
    }

    let transactions: Transaction[] = [];

    try {
      // Try with REGEXP_REPLACE if available
      transactions = await this.transactionsRepository.find({
        where: {
          user: { id: userId },
          category: IsNull(),
          description: normalizedKeyword.includes(' ')
            ? Raw(
                (alias) =>
                  `LOWER(REGEXP_REPLACE(REGEXP_REPLACE(${alias}, '[^a-zA-Z0-9 ]', ' ', 'g'), ' +', ' ', 'g')) LIKE '%${normalizedKeyword}%'`,
              )
            : Raw(
                (alias) =>
                  `LOWER(REGEXP_REPLACE(REGEXP_REPLACE(${alias}, '[^a-zA-Z0-9 ]', ' ', 'g'), ' +', ' ', 'g')) ~ '\\y${normalizedKeyword}\\y'`,
              ),
        },
      });
    } catch (error) {
      // Fallback for databases that don't support REGEXP_REPLACE
      transactions = await this.transactionsRepository.find({
        where: {
          user: { id: userId },
          category: IsNull(),
        },
      });

      // Filter locally
      transactions = transactions.filter((t) => {
        if (!t.description) return false;

        const normalizedDesc = t.description
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .trim()
          .replace(/\s+/g, ' ');

        return normalizedKeyword.includes(' ')
          ? normalizedDesc.includes(normalizedKeyword)
          : normalizedDesc.split(' ').includes(normalizedKeyword);
      });
    }

    // Update each transaction with the category
    if (transactions.length > 0) {
      for (const transaction of transactions) {
        transaction.category = category;
      }

      await this.bulkUpdateTransactions(transactions);

      // Track keyword usage statistics
      await this.keywordStatsService.trackKeywordUsage(
        normalizedKeyword,
        category,
        { id: userId } as User,
        true, // Success
      );
    }

    return transactions.length;
  }

  /**
   * Learn keywords from a transaction and add them to a category
   */
  async learnKeywordsFromTransaction(
    categoryId: number,
    transactionId: number,
    userId: number,
  ): Promise<Category> {
    // Find the transaction
    const transaction = await this.transactionsRepository.findOne({
      where: { id: transactionId, user: { id: userId } },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with ID ${transactionId} not found`,
      );
    }

    // Get suggested keywords from the transaction
    const suggestedKeywords =
      await this.suggestKeywordsFromTransaction(transaction);

    // Find the category
    const category = await this.findOne(categoryId, userId);
    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }

    // Add each suggested keyword to the category
    for (const keyword of suggestedKeywords) {
      await this.addKeywordToCategory(categoryId, keyword, userId);
    }

    // Return the updated category
    return this.findOne(categoryId, userId);
  }

  /**
   * Find potentially affected transactions when adding keywords
   */
  async findTransactionsMatchingKeyword(
    keyword: string,
    userId: number,
    onlyUncategorized: boolean = false,
  ): Promise<{
    transactions: Transaction[];
    categoryCounts: Record<string, number>;
  }> {
    // Normalize the keyword by removing punctuation and extra spaces
    // The replace(/\s+/g, ' ') ensures we normalize multiple spaces to a single space
    const normalizedKeyword = keyword
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace non-word chars with spaces
      .trim() // Remove leading/trailing spaces
      .replace(/\s+/g, ' '); // Normalize multiple spaces to single spaces

    // Build query conditions
    const conditions: any = {
      user: { id: userId },
    };

    // Add category condition if only looking for uncategorized
    if (onlyUncategorized) {
      conditions.category = IsNull();
    }

    try {
      // Try to use REGEXP_REPLACE if available (PostgreSQL)
      // Note: We use double spaces in the regex to ensure we capture sequences of spaces properly
      conditions.description = Raw(
        (alias) =>
          `LOWER(REGEXP_REPLACE(REGEXP_REPLACE(${alias}, '[^a-zA-Z0-9 ]', ' ', 'g'), ' +', ' ', 'g')) LIKE '%${normalizedKeyword}%'`,
      );

      // Find matching transactions
      const transactions = await this.transactionsRepository.find({
        where: conditions,
        relations: ['category'],
        take: 1000, // Limit for performance
      });

      // Count by category
      const categoryCounts: Record<string, number> = {};
      transactions.forEach((t) => {
        const categoryName = t.category ? t.category.name : 'Uncategorized';
        categoryCounts[categoryName] = (categoryCounts[categoryName] || 0) + 1;
      });

      return { transactions, categoryCounts };
    } catch (error) {
      // If REGEXP_REPLACE fails, fall back to a simpler approach
      console.log(
        'REGEXP_REPLACE not supported, falling back to simpler query',
        error,
      );

      // Use standard LIKE query
      conditions.description = Raw(
        (alias) => `LOWER(${alias}) LIKE '%${normalizedKeyword}%'`,
      );

      // Find matching transactions
      const transactions = await this.transactionsRepository.find({
        where: conditions,
        relations: ['category'],
        take: 1000,
      });

      // Filter results in-memory for better matching
      const filteredTransactions = transactions.filter((t) => {
        const normalizedDescription = t.description
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
          .trim() // Remove leading/trailing spaces
          .replace(/\s+/g, ' '); // Normalize multiple spaces to single spaces

        // For multi-word keywords, check if all words are present rather than exact substring
        if (normalizedKeyword.includes(' ')) {
          const keywordWords = normalizedKeyword.split(' ');
          const descriptionWords = normalizedDescription.split(' ');

          // Check if all keywords words appear in the description
          return keywordWords.every((word) => descriptionWords.includes(word));
        }

        // For single-word keywords, use direct inclusion
        return normalizedDescription.includes(normalizedKeyword);
      });

      // Count by category
      const categoryCounts: Record<string, number> = {};
      filteredTransactions.forEach((t) => {
        const categoryName = t.category ? t.category.name : 'Uncategorized';
        categoryCounts[categoryName] = (categoryCounts[categoryName] || 0) + 1;
      });

      return { transactions: filteredTransactions, categoryCounts };
    }
  }

  /**
   * Bulk update transactions
   */
  async bulkUpdateTransactions(transactions: Transaction[]): Promise<void> {
    if (transactions.length === 0) {
      return;
    }

    await this.transactionsRepository.save(transactions);
  }

  /**
   * Apply a keyword to a category and optionally update existing transactions
   * @param categoryId The ID of the category to update
   * @param keyword The keyword to add
   * @param userId The user ID
   * @param applyTo Strategy for updating transactions ('none', 'uncategorized', 'all', or array of category names)
   * @returns Object containing the updated category and count of updated transactions
   */
  async applyKeywordToCategory(
    categoryId: number,
    keyword: string,
    userId: number,
    applyTo: 'none' | 'uncategorized' | 'all' | string[] = 'none',
  ): Promise<{ category: Category; transactionsUpdated: number }> {
    // Add the keyword to the category
    const updatedCategory = await this.addKeywordToCategory(
      categoryId,
      keyword,
      userId,
    );

    let updatedCount = 0;

    // Apply to existing transactions based on the applyTo option
    if (applyTo === 'uncategorized') {
      // Only apply to uncategorized transactions
      updatedCount = await this.bulkCategorizeByKeyword(
        keyword,
        categoryId,
        userId,
      );
    } else if (applyTo === 'all') {
      // Apply to all matching transactions
      const { transactions } = await this.findTransactionsMatchingKeyword(
        keyword,
        userId,
        false, // Not only uncategorized
      );

      // Update all transactions to use this category
      if (transactions.length > 0) {
        const transactionsToUpdate = transactions.filter(
          (t) => !t.category || t.category.id !== categoryId,
        );

        if (transactionsToUpdate.length > 0) {
          // Update the category for each transaction
          for (const transaction of transactionsToUpdate) {
            transaction.category = { id: categoryId } as any;
          }

          // Save all transactions
          await this.bulkUpdateTransactions(transactionsToUpdate);
          updatedCount = transactionsToUpdate.length;
        }
      }
    } else if (Array.isArray(applyTo)) {
      // Apply to specific categories
      const { transactions } = await this.findTransactionsMatchingKeyword(
        keyword,
        userId,
        false,
      );

      // Filter transactions to only those in specified categories (or uncategorized)
      const filteredTransactions = transactions.filter((t) => {
        const currentCategory = t.category ? t.category.name : 'Uncategorized';
        return (
          applyTo.includes(currentCategory) &&
          (!t.category || t.category.id !== categoryId)
        );
      });

      // Update filtered transactions
      if (filteredTransactions.length > 0) {
        for (const transaction of filteredTransactions) {
          transaction.category = { id: categoryId } as any;
        }

        // Save all transactions
        await this.bulkUpdateTransactions(filteredTransactions);
        updatedCount = filteredTransactions.length;
      }
    }

    // Return results
    return {
      category: updatedCategory,
      transactionsUpdated: updatedCount,
    };
  }
}
