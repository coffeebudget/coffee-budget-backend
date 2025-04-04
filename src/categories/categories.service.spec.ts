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

describe('CategoriesService', () => {
  let service: CategoriesService;
  let categoryRepository: Repository<Category>;
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
          useClass: Repository,
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
    categoryRepository = module.get<Repository<Category>>(getRepositoryToken(Category));
    transactionRepository = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));
    recurringTransactionRepository = module.get<Repository<RecurringTransaction>>(getRepositoryToken(RecurringTransaction));
    transactionOperationsService = module.get<TransactionOperationsService>(TransactionOperationsService);
    keywordExtractionService = module.get<KeywordExtractionService>(KeywordExtractionService);

    // Mock repository methods
    jest.spyOn(categoryRepository, 'findOne').mockImplementation();
    jest.spyOn(categoryRepository, 'find').mockImplementation();
    jest.spyOn(categoryRepository, 'save').mockImplementation();
    jest.spyOn(categoryRepository, 'create').mockImplementation();
    jest.spyOn(categoryRepository, 'delete').mockImplementation();
    jest.spyOn(transactionRepository, 'find').mockImplementation();
    jest.spyOn(recurringTransactionRepository, 'find').mockImplementation();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Add more tests here...
});
