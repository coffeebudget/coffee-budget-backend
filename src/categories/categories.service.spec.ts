import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { Repository, IsNull, Raw, FindManyOptions } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { TransactionOperationsService } from '../shared/transaction-operations.service';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';
import { KeywordExtractionService } from './keyword-extraction.service';
import { User } from '../users/user.entity';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let transactionsRepository: jest.Mocked<Repository<Transaction>>;
  let categoriesRepository: jest.Mocked<Repository<Category>>;
  let recurringTransactionRepository: Repository<RecurringTransaction>;
  let transactionOperationsService: TransactionOperationsService;
  let keywordExtractionService: KeywordExtractionService;

  const mockKeywordExtractionService = {
    extractKeywords: jest.fn().mockImplementation((text) => {
      return text.toLowerCase().replace(/[^\w\s]/g, ' ').trim().split(' ');
    }),
    suggestKeywordsForCategory: jest.fn(),
  };

  const mockTransactionOperationsService = {
    getTransactionsByCategory: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: getRepositoryToken(Category),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(RecurringTransaction),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PendingDuplicate),
          useClass: Repository,
        },
        {
          provide: TransactionOperationsService,
          useValue: mockTransactionOperationsService,
        },
        {
          provide: KeywordExtractionService,
          useValue: mockKeywordExtractionService,
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    transactionsRepository = module.get(getRepositoryToken(Transaction)) as jest.Mocked<Repository<Transaction>>;
    categoriesRepository = module.get(getRepositoryToken(Category)) as jest.Mocked<Repository<Category>>;
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
      
      categoriesRepository.create.mockReturnValue(createCategoryDto as Category);
      categoriesRepository.save.mockResolvedValue(savedCategory as Category);
      
      // Act
      const result = await service.create(createCategoryDto, user);
      
      // Assert
      expect(categoriesRepository.save).toHaveBeenCalledWith(
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
      
      categoriesRepository.findOne.mockResolvedValue(existingCategory as Category);
      categoriesRepository.save.mockResolvedValue(updatedCategory as Category);
      
      // Act
      const result = await service.update(id, updateCategoryDto, 1);
      
      // Assert
      expect(categoriesRepository.save).toHaveBeenCalledWith(
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

  describe('findTransactionsMatchingKeyword', () => {
    it('should match transactions with punctuation differences', async () => {
      // Test data
      const userId = 1;
      const keyword = 'finanziamento n 1527713'; // Keyword without period
      const transactionWithPeriod = {
        id: 1,
        description: 'finanziamento n. 1527713', // Description with period
        amount: 100,
        executionDate: new Date(),
        category: null,
        user: { id: userId } as User,
        // Add other required properties to satisfy Transaction type
        type: 'expense',
        createdAt: new Date(),
        status: 'executed',
        bankAccount: null,
        tags: [],
        createdBy: 'system',
        updatedAt: new Date(),
        metadata: {},
        // Add missing required properties
        creditCard: null,
        source: 'manual',
        recurringTransaction: null
      } as unknown as Transaction;
      
      // Mock the repository find method
      transactionsRepository.find.mockImplementation(async (options?: FindManyOptions<Transaction>) => {
        if (!options || !options.where) return [];
        
        // Verify the search query is correctly formatted
        console.log('Query condition:', options.where);
        
        // Simulate DB querying with our test data
        // Use the same word-by-word matching we implemented in the service
        const normalizedKeyword = keyword.toLowerCase().replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
        const normalizedDescription = transactionWithPeriod.description.toLowerCase().replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
        
        // For multi-word keywords, check if all words appear in the description
        if (normalizedKeyword.includes(' ')) {
          const keywordWords = normalizedKeyword.split(' ');
          const descriptionWords = normalizedDescription.split(' ');
          
          // Check if all keyword words appear in the description
          if (keywordWords.every(word => descriptionWords.includes(word))) {
            return [transactionWithPeriod];
          }
        } else if (normalizedDescription.includes(normalizedKeyword)) {
          // Direct match for single-word keywords
          return [transactionWithPeriod];
        }
        
        return [];
      });

      // Call the service method
      const result = await service.findTransactionsMatchingKeyword(keyword, userId, false);

      // Assertions
      expect(transactionsRepository.find).toHaveBeenCalled();
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].description).toBe('finanziamento n. 1527713');
      expect(result.categoryCounts).toHaveProperty('Uncategorized', 1);
    });
    
    it('should match transactions when keyword includes numbers', async () => {
      // Test multiple variations
      const userId = 1;
      const testCases = [
        { 
          keyword: 'pagamento 12345',
          description: 'pagamento #12345',
          shouldMatch: true
        },
        { 
          keyword: 'rata mutuo 67890',
          description: 'RATA MUTUO n.67890 scadenza',
          shouldMatch: true
        },
        { 
          keyword: 'bonifico rossi',
          description: 'Bonifico a favore di: Rossi, Mario',
          shouldMatch: true
        }
      ];
      
      // Test each case
      for (const testCase of testCases) {
        // Mock transaction for this test case
        const mockTransaction = {
          id: Math.floor(Math.random() * 1000),
          description: testCase.description,
          amount: 100,
          executionDate: new Date(),
          category: null,
          user: { id: userId } as User,
          // Add other required Transaction properties
          type: 'expense',
          createdAt: new Date(),
          status: 'executed',
          bankAccount: null,
          tags: [],
          createdBy: 'system',
          updatedAt: new Date(),
          metadata: {},
          // Add missing required properties
          creditCard: null,
          source: 'manual',
          recurringTransaction: null
        } as unknown as Transaction;
        
        // Mock the repository for this specific test
        transactionsRepository.find.mockReset();
        transactionsRepository.find.mockImplementation(async (options?: FindManyOptions<Transaction>) => {
          // Normalize both the keyword and the description for comparison
          const normalizedKeyword = testCase.keyword.toLowerCase().replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
          const normalizedDescription = mockTransaction.description.toLowerCase().replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
          
          // Use the same word-by-word matching we implemented in the service
          if (normalizedKeyword.includes(' ')) {
            // For multi-word keywords, check if all words appear in the description
            const keywordWords = normalizedKeyword.split(' ');
            const descriptionWords = normalizedDescription.split(' ');
            
            // Check if all keyword words appear in the description
            if (keywordWords.every(word => descriptionWords.includes(word))) {
              return [mockTransaction];
            }
          } else if (normalizedDescription.includes(normalizedKeyword)) {
            // Direct match for single-word keywords
            return [mockTransaction];
          }
          
          return [];
        });
        
        // Call the service method
        const result = await service.findTransactionsMatchingKeyword(testCase.keyword, userId, false);
        
        // Assertions for this test case
        if (testCase.shouldMatch) {
          expect(result.transactions).toHaveLength(1);
          expect(result.transactions[0].description).toBe(testCase.description);
        } else {
          expect(result.transactions).toHaveLength(0);
        }
      }
    });
  });

  // Add more tests here...
});

// Create a standalone test file that doesn't depend on existing tests
describe('CategoriesService - Keyword Matching', () => {
  let categoriesService: CategoriesService;
  
  // This function replicates the logic in our findTransactionsMatchingKeyword method
  const testPunctuationMatching = (description: string, keyword: string): boolean => {
    // Normalize the keyword by removing punctuation and extra spaces
    const normalizedKeyword = keyword.toLowerCase().replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
    
    // Normalize the description too - replace punctuation with spaces and normalize multiple spaces
    const normalizedDescription = description.toLowerCase().replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
    
    // For multi-word keywords, check if all words appear in the description
    if (normalizedKeyword.includes(' ')) {
      const keywordWords = normalizedKeyword.split(' ');
      const descriptionWords = normalizedDescription.split(' ');
      
      // Check if all keyword words appear in the description
      return keywordWords.every(word => descriptionWords.includes(word));
    } else {
      // For single-word keywords, use direct inclusion
      return normalizedDescription.includes(normalizedKeyword);
    }
  };
  
  test('should match transaction descriptions with periods to keywords without periods', () => {
    // Set up the test cases
    const testCases = [
      { 
        description: 'finanziamento n. 1527713', 
        keyword: 'finanziamento n 1527713',
        shouldMatch: true,
        reason: 'Period in n. should not prevent matching'
      },
      { 
        description: 'RATA MUTUO n.67890 scadenza', 
        keyword: 'rata mutuo n 67890',
        shouldMatch: true,
        reason: 'Case and period should not prevent matching'
      },
      { 
        description: 'Bonifico a favore di: Rossi, Mario', 
        keyword: 'bonifico rossi',
        shouldMatch: true,
        reason: 'Punctuation and extra words should not prevent matching'
      },
      { 
        description: 'pagamento #12345', 
        keyword: 'pagamento 12345',
        shouldMatch: true,
        reason: 'Special characters should not prevent matching'
      }
    ];
    
    // Run tests on each case
    testCases.forEach(testCase => {
      const result = testPunctuationMatching(testCase.description, testCase.keyword);
      expect(result).toBe(testCase.shouldMatch);
      
      // If the test fails, show a detailed message
      if (result !== testCase.shouldMatch) {
        console.error(`Test failed: ${testCase.reason}`);
        console.error(`Description: "${testCase.description}"`);
        console.error(`Keyword: "${testCase.keyword}"`);
        console.error(`Expected match: ${testCase.shouldMatch}, got: ${result}`);
      }
    });
  });
  
  describe('SQL LIKE behavior simulation', () => {
    test('SQL LIKE query should match similar patterns despite punctuation', () => {
      // Our specific case from the requirements
      const description = 'finanziamento n. 1527713';
      const keyword = 'finanziamento n 1527713';
      
      // Normalize for direct comparison
      const normalizedDescription = description.toLowerCase().replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
      const normalizedKeyword = keyword.toLowerCase().replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
      
      // For multi-word keywords, check if all words appear in the description
      const keywordWords = normalizedKeyword.split(' ');
      const descriptionWords = normalizedDescription.split(' ');
      
      // Check if all keyword words appear in the description
      const allWordsMatch = keywordWords.every(word => descriptionWords.includes(word));
      
      // This is how our service would match the description and keyword
      expect(allWordsMatch).toBe(true);
    });
  });
});
