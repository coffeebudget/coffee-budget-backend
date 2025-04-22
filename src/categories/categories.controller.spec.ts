import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { KeywordExtractionService } from './keyword-extraction.service';
import { DefaultCategoriesService } from './default-categories.service';
import { KeywordStatsService } from './keyword-stats.service';
import { User } from '../users/user.entity';
import { Category } from './entities/category.entity';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let categoriesService: CategoriesService;
  let keywordExtractionService: KeywordExtractionService;
  let defaultCategoriesService: DefaultCategoriesService;
  let keywordStatsService: KeywordStatsService;

  const mockUser: User = {
    id: 1,
    email: 'test@example.com',
    // Add other required properties
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        {
          provide: CategoriesService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
            remove: jest.fn().mockResolvedValue({}),
            suggestKeywordsForCategory: jest.fn().mockResolvedValue([]),
            bulkCategorizeByKeyword: jest.fn().mockResolvedValue(5),
            learnKeywordsFromTransaction: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: KeywordExtractionService,
          useValue: {
            findCommonKeywordsInUncategorized: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: DefaultCategoriesService,
          useValue: {
            resetCategoriesToDefaults: jest.fn(),
            createDefaultCategoriesForUser: jest.fn(),
            getDefaultCategories: jest.fn(),
          },
        },
        {
          provide: KeywordStatsService,
          useValue: {
            getPopularKeywords: jest.fn().mockResolvedValue([]),
            getTopKeywordsByCategorySuccess: jest.fn().mockResolvedValue([]),
            trackKeywordUsage: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
    categoriesService = module.get<CategoriesService>(CategoriesService);
    keywordExtractionService = module.get<KeywordExtractionService>(KeywordExtractionService);
    defaultCategoriesService = module.get<DefaultCategoriesService>(DefaultCategoriesService);
    keywordStatsService = module.get<KeywordStatsService>(KeywordStatsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of categories', async () => {
      const result = [{ id: 1, name: 'Test Category' }] as Category[];
      jest.spyOn(categoriesService, 'findAll').mockResolvedValue(result);

      expect(await controller.findAll(mockUser)).toBe(result);
    });
  });

  describe('getCommonKeywords', () => {
    it('should return common keywords from uncategorized transactions', async () => {
      const result = { grocery: 5, restaurant: 3 };
      jest.spyOn(keywordExtractionService, 'findCommonKeywordsInUncategorized').mockResolvedValue(result);

      expect(await controller.getCommonKeywords(mockUser)).toBe(result);
    });
  });

  describe('bulkCategorize', () => {
    it('should categorize transactions by keyword', async () => {
      const result = 5;
      jest.spyOn(categoriesService, 'bulkCategorizeByKeyword').mockResolvedValue(result);

      expect(await controller.bulkCategorize('grocery', 1, mockUser)).toEqual({ count: result });
    });
  });

  describe('getSuggestedKeywords', () => {
    it('should return suggested keywords for a category', async () => {
      const result = ['grocery', 'supermarket'];
      jest.spyOn(categoriesService, 'suggestKeywordsForCategory').mockResolvedValue(result);

      expect(await controller.getSuggestedKeywords(1, mockUser)).toBe(result);
    });
  });

  describe('learnFromTransaction', () => {
    it('should learn keywords from a transaction', async () => {
      const result = { id: 1, name: 'Groceries', keywords: ['grocery', 'supermarket'] } as Category;
      jest.spyOn(categoriesService, 'learnKeywordsFromTransaction').mockResolvedValue(result);

      expect(await controller.learnFromTransaction(1, 1, mockUser)).toBe(result);
    });
  });
});
