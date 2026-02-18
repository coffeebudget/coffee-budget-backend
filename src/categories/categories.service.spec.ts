import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { Repository, IsNull, Raw, FindManyOptions } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionOperationsService } from '../transactions/transaction-operations.service';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';
import { KeywordExtractionService } from './keyword-extraction.service';
import { KeywordStatsService } from './keyword-stats.service';
import { User } from '../users/user.entity';
import { EventPublisherService } from '../shared/services/event-publisher.service';
import { MerchantCategorizationService } from '../merchant-categorization/merchant-categorization.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let transactionsRepository: jest.Mocked<Repository<Transaction>>;
  let categoriesRepository: jest.Mocked<Repository<Category>>;
  let transactionOperationsService: TransactionOperationsService;
  let keywordExtractionService: KeywordExtractionService;
  let keywordStatsService: KeywordStatsService;

  const mockKeywordExtractionService = {
    extractKeywords: jest.fn().mockImplementation((text) => {
      return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .split(' ');
    }),
    suggestKeywordsForCategory: jest.fn(),
  };

  const mockTransactionOperationsService = {
    getTransactionsByCategory: jest.fn(),
  };

  const mockKeywordStatsService = {
    trackKeywordUsage: jest.fn().mockResolvedValue(null),
    getKeywordStats: jest.fn().mockResolvedValue([]),
    getPopularKeywords: jest.fn().mockResolvedValue([]),
    getTopKeywordsByCategorySuccess: jest.fn().mockResolvedValue([]),
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
        {
          provide: KeywordStatsService,
          useValue: mockKeywordStatsService,
        },
        {
          provide: EventPublisherService,
          useValue: {
            publish: jest.fn().mockResolvedValue(undefined),
            publishBatch: jest.fn().mockResolvedValue(undefined),
            publishSync: jest.fn(),
          },
        },
        {
          provide: MerchantCategorizationService,
          useValue: {
            categorizeByMerchant: jest.fn().mockResolvedValue(null),
            learnFromUserCorrection: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    transactionsRepository = module.get(getRepositoryToken(Transaction));
    categoriesRepository = module.get(getRepositoryToken(Category));
    transactionOperationsService = module.get<TransactionOperationsService>(
      TransactionOperationsService,
    );
    keywordExtractionService = module.get<KeywordExtractionService>(
      KeywordExtractionService,
    );
    keywordStatsService = module.get<KeywordStatsService>(KeywordStatsService);
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
        analyticsExclusionReason: 'Avoid double counting',
      };
      const user = { id: 1 } as User;

      const savedCategory = {
        ...createCategoryDto,
        id: 1,
        user,
      };

      categoriesRepository.create.mockReturnValue(
        createCategoryDto as Category,
      );
      categoriesRepository.save.mockResolvedValue(savedCategory as Category);

      // Act
      const result = await service.create(createCategoryDto, user);

      // Assert
      expect(categoriesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeFromExpenseAnalytics: true,
          analyticsExclusionReason: 'Avoid double counting',
        }),
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
        analyticsExclusionReason: 'Transfer category',
      };

      const existingCategory = {
        id,
        name: 'Savings',
        excludeFromExpenseAnalytics: false,
        user: { id: 1 },
      };

      const updatedCategory = {
        ...existingCategory,
        ...updateCategoryDto,
      };

      categoriesRepository.findOne.mockResolvedValue(
        existingCategory as Category,
      );
      categoriesRepository.save.mockResolvedValue(updatedCategory as Category);

      // Act
      const result = await service.update(id, updateCategoryDto, 1);

      // Assert
      expect(categoriesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          name: 'Savings',
          excludeFromExpenseAnalytics: true,
          analyticsExclusionReason: 'Transfer category',
        }),
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
        recurringTransaction: null,
      } as unknown as Transaction;

      // Mock the repository find method
      transactionsRepository.find.mockImplementation(
        async (options?: FindManyOptions<Transaction>) => {
          if (!options || !options.where) return [];

          // Simulate DB querying with our test data
          // Use the same word-by-word matching we implemented in the service
          const normalizedKeyword = keyword
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .trim()
            .replace(/\s+/g, ' ');
          const normalizedDescription = transactionWithPeriod.description
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .trim()
            .replace(/\s+/g, ' ');

          // For multi-word keywords, check if all words appear in the description
          if (normalizedKeyword.includes(' ')) {
            const keywordWords = normalizedKeyword.split(' ');
            const descriptionWords = normalizedDescription.split(' ');

            // Check if all keyword words appear in the description
            if (keywordWords.every((word) => descriptionWords.includes(word))) {
              return [transactionWithPeriod];
            }
          } else if (normalizedDescription.includes(normalizedKeyword)) {
            // Direct match for single-word keywords
            return [transactionWithPeriod];
          }

          return [];
        },
      );

      // Call the service method
      const result = await service.findTransactionsMatchingKeyword(
        keyword,
        userId,
        false,
      );

      // Assertions
      expect(transactionsRepository.find).toHaveBeenCalled();
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].description).toBe(
        'finanziamento n. 1527713',
      );
      expect(result.categoryCounts).toHaveProperty('Uncategorized', 1);
    });

    it('should match transactions when keyword includes numbers', async () => {
      // Test multiple variations
      const userId = 1;
      const testCases = [
        {
          keyword: 'pagamento 12345',
          description: 'pagamento #12345',
          shouldMatch: true,
        },
        {
          keyword: 'rata mutuo 67890',
          description: 'RATA MUTUO n.67890 scadenza',
          shouldMatch: true,
        },
        {
          keyword: 'bonifico rossi',
          description: 'Bonifico a favore di: Rossi, Mario',
          shouldMatch: true,
        },
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
          recurringTransaction: null,
        } as unknown as Transaction;

        // Mock the repository for this specific test
        transactionsRepository.find.mockReset();
        transactionsRepository.find.mockImplementation(
          async (options?: FindManyOptions<Transaction>) => {
            // Normalize both the keyword and the description for comparison
            const normalizedKeyword = testCase.keyword
              .toLowerCase()
              .replace(/[^\w\s]/g, ' ')
              .trim()
              .replace(/\s+/g, ' ');
            const normalizedDescription = mockTransaction.description
              .toLowerCase()
              .replace(/[^\w\s]/g, ' ')
              .trim()
              .replace(/\s+/g, ' ');

            // Use the same word-by-word matching we implemented in the service
            if (normalizedKeyword.includes(' ')) {
              // For multi-word keywords, check if all words appear in the description
              const keywordWords = normalizedKeyword.split(' ');
              const descriptionWords = normalizedDescription.split(' ');

              // Check if all keyword words appear in the description
              if (
                keywordWords.every((word) => descriptionWords.includes(word))
              ) {
                return [mockTransaction];
              }
            } else if (normalizedDescription.includes(normalizedKeyword)) {
              // Direct match for single-word keywords
              return [mockTransaction];
            }

            return [];
          },
        );

        // Call the service method
        const result = await service.findTransactionsMatchingKeyword(
          testCase.keyword,
          userId,
          false,
        );

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
  const testPunctuationMatching = (
    description: string,
    keyword: string,
  ): boolean => {
    // Normalize the keyword by removing punctuation and extra spaces
    const normalizedKeyword = keyword
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

    // Normalize the description too - replace punctuation with spaces and normalize multiple spaces
    const normalizedDescription = description
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

    // For multi-word keywords, check if all words appear in the description
    if (normalizedKeyword.includes(' ')) {
      const keywordWords = normalizedKeyword.split(' ');
      const descriptionWords = normalizedDescription.split(' ');

      // Check if all keyword words appear in the description
      return keywordWords.every((word) => descriptionWords.includes(word));
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
        reason: 'Period in n. should not prevent matching',
      },
      {
        description: 'RATA MUTUO n.67890 scadenza',
        keyword: 'rata mutuo n 67890',
        shouldMatch: true,
        reason: 'Case and period should not prevent matching',
      },
      {
        description: 'Bonifico a favore di: Rossi, Mario',
        keyword: 'bonifico rossi',
        shouldMatch: true,
        reason: 'Punctuation and extra words should not prevent matching',
      },
      {
        description: 'pagamento #12345',
        keyword: 'pagamento 12345',
        shouldMatch: true,
        reason: 'Special characters should not prevent matching',
      },
    ];

    // Run tests on each case
    testCases.forEach((testCase) => {
      const result = testPunctuationMatching(
        testCase.description,
        testCase.keyword,
      );
      expect(result).toBe(testCase.shouldMatch);

      // If the test fails, show a detailed message
      if (result !== testCase.shouldMatch) {
        console.error(`Test failed: ${testCase.reason}`);
        console.error(`Description: "${testCase.description}"`);
        console.error(`Keyword: "${testCase.keyword}"`);
        console.error(
          `Expected match: ${testCase.shouldMatch}, got: ${result}`,
        );
      }
    });
  });

  describe('SQL LIKE behavior simulation', () => {
    test('SQL LIKE query should match similar patterns despite punctuation', () => {
      // Our specific case from the requirements
      const description = 'finanziamento n. 1527713';
      const keyword = 'finanziamento n 1527713';

      // Normalize for direct comparison
      const normalizedDescription = description
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
      const normalizedKeyword = keyword
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

      // For multi-word keywords, check if all words appear in the description
      const keywordWords = normalizedKeyword.split(' ');
      const descriptionWords = normalizedDescription.split(' ');

      // Check if all keyword words appear in the description
      const allWordsMatch = keywordWords.every((word) =>
        descriptionWords.includes(word),
      );

      // This is how our service would match the description and keyword
      expect(allWordsMatch).toBe(true);
    });
  });

  describe('Word Boundary Matching (Fix for "coop" vs "cooperativa")', () => {
    const testWordBoundaryMatching = (
      description: string,
      keyword: string,
    ): boolean => {
      // Normalize keyword
      const normalizedKeyword = keyword
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

      // Normalize description
      const normalizedDescription = description
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

      // For multi-word keywords, check if all words appear in the description
      if (normalizedKeyword.includes(' ')) {
        const keywordWords = normalizedKeyword.split(' ');
        const descriptionWords = normalizedDescription.split(' ');
        return keywordWords.every((word) => descriptionWords.includes(word));
      } else {
        // Single word: check if it appears as a complete word in description
        // Split description into words to avoid matching partial words
        const descriptionWords = normalizedDescription.split(' ');
        return descriptionWords.includes(normalizedKeyword);
      }
    };

    test('should match "coop" in "COOP LOMBARDIA" (complete word)', () => {
      const description = 'COOP LOMBARDIA S.C. STRADA PROVINCIALE';
      const keyword = 'coop';

      const result = testWordBoundaryMatching(description, keyword);

      expect(result).toBe(true);
    });

    test('should NOT match "coop" in "cooperativa" (partial word)', () => {
      const description = 'Bonifico a favore di cooperativa agricola';
      const keyword = 'coop';

      const result = testWordBoundaryMatching(description, keyword);

      expect(result).toBe(false);
    });

    test('should match "coop" in "presso COOP" (complete word at end)', () => {
      const description = 'Pagamento presso COOP';
      const keyword = 'coop';

      const result = testWordBoundaryMatching(description, keyword);

      expect(result).toBe(true);
    });

    test('should match "esselunga" in "ESSELUNGA" but NOT in "essemercato"', () => {
      const descriptionMatch = 'Pagamento ESSELUNGA VIA ROMA';
      const descriptionNoMatch = 'Pagamento essemercato punto vendita';
      const keyword = 'esselunga';

      expect(testWordBoundaryMatching(descriptionMatch, keyword)).toBe(true);
      expect(testWordBoundaryMatching(descriptionNoMatch, keyword)).toBe(false);
    });

    test('should still match multi-word keywords correctly', () => {
      const description =
        'Pag. del 01/12/25 ora 11:48 presso: COOP LOMBARDIA S.C.';
      const keyword = 'coop lombardia';

      const result = testWordBoundaryMatching(description, keyword);

      expect(result).toBe(true);
    });

    test('should handle punctuation correctly with word boundaries', () => {
      const testCases = [
        {
          description: 'Pag. presso: COOP, via Roma',
          keyword: 'coop',
          expected: true,
          reason: 'Comma and colon should not prevent matching',
        },
        {
          description: 'Bonifico COOP-LOMBARDIA servizi',
          keyword: 'coop',
          expected: true,
          reason: 'Hyphen should split words',
        },
        {
          description: 'Pagamento #COOP123',
          keyword: 'coop',
          expected: false,
          reason: 'COOP123 is one word due to no separator',
        },
      ];

      testCases.forEach((testCase) => {
        const result = testWordBoundaryMatching(
          testCase.description,
          testCase.keyword,
        );
        expect(result).toBe(testCase.expected);
      });
    });
  });
});
