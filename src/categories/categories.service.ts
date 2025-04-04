import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { TransactionOperationsService } from '../shared/transaction-operations.service';
import { KeywordExtractionService } from './keyword-extraction.service';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(RecurringTransaction)
    private recurringTransactionsRepository: Repository<RecurringTransaction>,
    private transactionOperationsService: TransactionOperationsService,
    private keywordExtractionService: KeywordExtractionService,
  ) {}

  async create(createCategoryDto: CreateCategoryDto, user: User): Promise<Category> {    
    const existingCategory = await this.categoriesRepository.findOne({
      where: { 
        name: createCategoryDto.name,
        user: { id: user.id }
      },
    });
    if (existingCategory) {
      throw new ConflictException(`Category with name ${createCategoryDto.name} already exists for this user`);
    }

    // Process keywords if they exist
    if (createCategoryDto.keywords) {
      createCategoryDto.keywords = createCategoryDto.keywords.map(k => k.trim().toLowerCase());
    }

    const category = this.categoriesRepository.create({
      ...createCategoryDto,
      user,
    });
    return this.categoriesRepository.save(category);
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto, userId: number): Promise<Category> {
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
        throw new ConflictException(`Category with name ${updateCategoryDto.name} already exists for this user`);
      }
    }
  
    // Merge only fields that are defined
    if (updateCategoryDto.name !== undefined) category.name = updateCategoryDto.name;
    if (updateCategoryDto.keywords !== undefined) {
      category.keywords = updateCategoryDto.keywords.map(k => k.trim().toLowerCase());
    }
  
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
    const queryRunner = this.categoriesRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check if category exists and belongs to user
      const category = await this.findOne(id, userId);

      // Check if category is used in any transactions
      const transactionsWithCategory = await queryRunner.manager.find('Transaction', {
        where: { category: { id }, user: { id: userId } }
      });

      if (transactionsWithCategory.length > 0) {
        throw new ConflictException(
          `Cannot delete category: it is used in ${transactionsWithCategory.length} transaction(s)`
        );
      }

      // Perform the deletion
      const result = await queryRunner.manager.delete('Category', { id, user: { id: userId } });
      
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
    return this.categoriesRepository.findOne({ where: { name, user: { id: userId } } });
  }

  public async createDefaultCategoriesForUser(user: User): Promise<void> {
    const defaultNames = [
      // 🏠 Casa & Utenze
      'Affitto', 'Mutuo', 'Energia elettrica', 'Gas', 'Acqua', 'Internet e telefono',
      'Spese condominiali', 'Manutenzione casa', 'Elettrodomestici',
  
      // 🚗 Trasporti
      'Carburante', 'Assicurazione auto', 'Bollo auto', 'Manutenzione auto',
      'Mezzi pubblici', 'Parcheggi / pedaggi', 'Noleggi auto / scooter',
  
      // 🛒 Spese quotidiane
      'Spesa alimentare', 'Farmacia', 'Cura personale', 'Tabacchi',
  
      // 🍽️ Ristoranti & bar
      'Ristorante', 'Bar / colazione', 'Take away / delivery',
  
      // 🛍️ Shopping
      'Abbigliamento', 'Elettronica', 'Regali', 'Libri / media',
  
      // 🎓 Istruzione & formazione
      'Scuola / università', 'Libri scolastici', 'Corsi / abbonamenti educativi',
  
      // ⚕️ Salute
      'Visite mediche', 'Analisi / esami', 'Assicurazioni sanitarie',
  
      // 👶 Famiglia & figli
      'Asilo / scuola', 'Abbigliamento bambini', 'Baby sitter', 'Attività ricreative',
  
      // 🎉 Tempo libero
      'Viaggi', 'Abbonamenti streaming', 'Cinema / teatro', 'Eventi / concerti', 'Sport / palestra',
  
      // 💼 Lavoro & professione
      'Spese professionali', 'Utenze business', 'Materiale da ufficio',
  
      // 💸 Finanza personale
      'Risparmi', 'Investimenti', 'Donazioni', 'Commissioni bancarie'
    ];
  
    const categoryRepo = this.categoriesRepository.manager.getRepository(Category);
  
    const categories = defaultNames.map(name => categoryRepo.create({ name, user }));
    await categoryRepo.save(categories);
  }
  
  /**
   * Suggest a category for a transaction description
   */
  async suggestCategoryForDescription(description: string, userId: number): Promise<Category | null> {
    if (!description) {
      return null;
    }

    // Get all categories with keywords for this user
    const categories = await this.categoriesRepository.find({
      where: { user: { id: userId } }
    });

    // Extract keywords from the description
    const descriptionKeywords = this.keywordExtractionService.extractKeywords(description);
    
    // Score each category based on keyword matches
    const categoryScores = categories.map(category => {
      if (!category.keywords || category.keywords.length === 0) {
        return { category, score: 0 };
      }

      let score = 0;
      
      // Check for exact matches
      for (const keyword of category.keywords) {
        // Multi-word keywords get higher scores
        const wordCount = keyword.split(' ').length;
        const baseScore = wordCount * 2; // Multi-word phrases get higher base scores
        
        if (description.toLowerCase().includes(keyword.toLowerCase())) {
          // Exact match in description
          score += baseScore * 2;
        } else if (descriptionKeywords.some(k => k === keyword.toLowerCase())) {
          // Exact match in extracted keywords
          score += baseScore;
        }
      }
      
      return { category, score };
    });
    
    // Sort by score (highest first) and get the best match
    categoryScores.sort((a, b) => b.score - a.score);
    
    // Only suggest if the score is above a threshold
    if (categoryScores.length > 0 && categoryScores[0].score > 0) {
      return categoryScores[0].category;
    }
    
    return null;
  }

  /**
   * Suggest keywords from a transaction description
   */
  async suggestKeywordsFromTransaction(transaction: Transaction): Promise<string[]> {
    if (!transaction.description) {
      return [];
    }
    
    return this.keywordExtractionService.extractKeywords(transaction.description);
  }

  async suggestKeywordsForCategory(categoryId: number, userId: number): Promise<string[]> {
    return this.keywordExtractionService.suggestKeywordsForCategory(categoryId, userId);
  }

  async addKeywordToCategory(categoryId: number, keyword: string, userId: number): Promise<Category> {
    const category = await this.findOne(categoryId, userId);
    
    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }
    
    // Normalize the keyword
    const normalizedKeyword = keyword.trim().toLowerCase();
    
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

  async removeKeywordFromCategory(categoryId: number, keyword: string, userId: number): Promise<Category> {
    const category = await this.findOne(categoryId, userId);
    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }

    // Normalize keyword
    const normalizedKeyword = keyword.toLowerCase().trim();
    
    // Remove keyword if it exists
    if (category.keywords && category.keywords.includes(normalizedKeyword)) {
      category.keywords = category.keywords.filter(k => k !== normalizedKeyword);
      await this.categoriesRepository.save(category);
    }
    
    return category;
  }

  async findUncategorizedTransactions(userId: number): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      where: {
        user: { id: userId },
        category: { id: IsNull() }
      },
      order: { executionDate: 'DESC' }
    });
  }

  async bulkCategorizeByKeyword(keyword: string, categoryId: number, userId: number): Promise<number> {
    const category = await this.findOne(categoryId, userId);
    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }

    // Normalize the keyword
    const normalizedKeyword = keyword.trim().toLowerCase();
    
    // Find transactions containing the keyword
    const queryBuilder = this.transactionsRepository
      .createQueryBuilder('transaction')
      .update()
      .set({ category: { id: categoryId } })
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.categoryId IS NULL');
    
    // Handle multi-word phrases differently than single words
    if (normalizedKeyword.includes(' ')) {
      // For multi-word phrases, we need an exact match
      queryBuilder.andWhere('LOWER(transaction.description) LIKE :exactKeyword', 
        { exactKeyword: `%${normalizedKeyword}%` });
    } else {
      // For single words, we can match word boundaries
      queryBuilder.andWhere('LOWER(transaction.description) ~ :wordBoundary', 
        { wordBoundary: `\\y${normalizedKeyword}\\y` });
    }
    
    const result = await queryBuilder.execute();
    return result.affected || 0;
  }

  /**
   * Learn keywords from a transaction and add them to a category
   */
  async learnKeywordsFromTransaction(
    categoryId: number, 
    transactionId: number, 
    userId: number
  ): Promise<Category> {
    // Find the transaction
    const transaction = await this.transactionsRepository.findOne({
      where: { id: transactionId, user: { id: userId } }
    });
    
    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${transactionId} not found`);
    }
    
    // Get suggested keywords from the transaction
    const suggestedKeywords = await this.suggestKeywordsFromTransaction(transaction);
    
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
}