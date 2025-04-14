import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { TransactionOperationsService } from '../shared/transaction-operations.service';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';
import { KeywordExtractionService } from './keyword-extraction.service';
import { User } from '../users/user.entity';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let categoryRepository: {
    create: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock; 
    delete: jest.Mock;
  };
  let transactionRepository: Repository<Transaction>;
  let recurringTransactionRepository: Repository<RecurringTransaction>;
  let transactionOperationsService: TransactionOperationsService;
  let keywordExtractionService: KeywordExtractionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: getRepositoryToken(Category),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            delete: jest.fn()
          }
        },
        {
          provide: getRepositoryToken(Transaction),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(RecurringTransaction),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(PendingDuplicate),
          useClass: Repository,
        },
        {
          provide: TransactionOperationsService,
          useValue: {
            findMatchingTransactions: jest.fn(),
            handleDuplicateResolution: jest.fn(),
            createPendingDuplicate: jest.fn(),
            linkTransactionsToRecurring: jest.fn(),
          },
        },
        {
          provide: KeywordExtractionService,
          useValue: {
            extractKeywords: jest.fn(),
            suggestKeywordsForCategory: jest.fn(),
            findCommonKeywordsInUncategorized: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    categoryRepository = module.get<{
      create: jest.Mock;
      findOne: jest.Mock;
      find: jest.Mock;
      save: jest.Mock; 
      delete: jest.Mock;
    }>(getRepositoryToken(Category));
    transactionRepository = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));
    recurringTransactionRepository = module.get<Repository<RecurringTransaction>>(getRepositoryToken(RecurringTransaction));
    transactionOperationsService = module.get<TransactionOperationsService>(TransactionOperationsService);
    keywordExtractionService = module.get<KeywordExtractionService>(KeywordExtractionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should store excludeFromExpenseAnalytics flag', async () => {
      // Prepare
      const createCategoryDto = {
        name: 'Credit Card Payment',
        excludeFromExpenseAnalytics: true,
        analyticsExclusionReason: 'Avoid double counting'
      };
      const user = { id: 1 } as User;
      
      const savedCategory = {
        ...createCategoryDto,
        id: 1,
        user
      };
      
      categoryRepository.create.mockReturnValue(createCategoryDto);
      categoryRepository.save.mockResolvedValue(savedCategory);
      
      // Act
      const result = await service.create(createCategoryDto, user);
      
      // Assert
      expect(categoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeFromExpenseAnalytics: true,
          analyticsExclusionReason: 'Avoid double counting'
        })
      );
      expect(result.excludeFromExpenseAnalytics).toBe(true);
    });
  });

  describe('update', () => {
    it('should update excludeFromExpenseAnalytics flag', async () => {
      // Prepare
      const id = 1;
      const updateCategoryDto = {
        excludeFromExpenseAnalytics: true,
        analyticsExclusionReason: 'Transfer category'
      };
      
      const existingCategory = {
        id,
        name: 'Savings',
        excludeFromExpenseAnalytics: false,
        user: { id: 1 }
      };
      
      const updatedCategory = {
        ...existingCategory,
        ...updateCategoryDto
      };
      
      categoryRepository.findOne.mockResolvedValue(existingCategory);
      categoryRepository.save.mockResolvedValue(updatedCategory);
      
      // Act
      const result = await service.update(id, updateCategoryDto, 1);
      
      // Assert
      expect(categoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          name: 'Savings',
          excludeFromExpenseAnalytics: true,
          analyticsExclusionReason: 'Transfer category'
        })
      );
      expect(result.excludeFromExpenseAnalytics).toBe(true);
      expect(result.analyticsExclusionReason).toBe('Transfer category');
    });
  });

  // Add more tests here...
});
