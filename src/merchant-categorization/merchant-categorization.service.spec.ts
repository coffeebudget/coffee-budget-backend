import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchantCategorizationService } from './merchant-categorization.service';
import { MerchantCategorization } from './entities';
import { Category } from '../categories/entities/category.entity';
import { OpenAIService } from '../ai/openai.service';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';

describe('MerchantCategorizationService', () => {
  let service: MerchantCategorizationService;
  let merchantRepo: any;
  let categoryRepo: any;
  let openAIService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantCategorizationService,
        {
          provide: getRepositoryToken(MerchantCategorization),
          useValue: RepositoryMockFactory.createMockRepository(),
        },
        {
          provide: getRepositoryToken(Category),
          useValue: RepositoryMockFactory.createMockRepository(),
        },
        {
          provide: OpenAIService,
          useValue: {
            categorizeTransaction: jest.fn(),
            testConnection: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MerchantCategorizationService>(MerchantCategorizationService);
    merchantRepo = module.get(getRepositoryToken(MerchantCategorization));
    categoryRepo = module.get(getRepositoryToken(Category));
    openAIService = module.get(OpenAIService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('categorizeByMerchant', () => {
    it('should return null when no merchant name provided', async () => {
      const transaction = {
        transactionId: 'test-123',
        amount: 10.50,
        description: 'Test transaction',
        merchantName: undefined,
        merchantType: 'unknown' as const,
        enhancedDescription: 'Test transaction',
      };

      const result = await service.categorizeByMerchant(transaction, 1);
      expect(result).toBeNull();
    });

    it('should normalize merchant names consistently', () => {
      const normalized = (service as any).normalizeMerchantName('ESSELUNGA S.P.A.');
      expect(normalized).toBe('esselunga s p a');
    });

    it('should build cache keys correctly', () => {
      const transaction = {
        transactionId: 'test-123',
        amount: 10.50,
        description: 'Test transaction',
        merchantName: 'ESSELUNGA SPA',
        merchantCategoryCode: '5411',
        merchantType: 'debtor' as const,
        enhancedDescription: 'Test transaction',
      };
      
      const cacheKey = (service as any).buildCacheKey(transaction, 1);
      expect(cacheKey).toBe('merchant:1:esselunga spa:5411');
    });
  });

  describe('learnFromUserCorrection', () => {
    it('should update merchant with user correction', async () => {
      const mockMerchant = {
        id: 1,
        merchantName: 'esselunga spa',
        suggestedCategoryId: 1,
        averageConfidence: 85,
        usageCount: 5,
        categoryHistory: [],
        user: { id: 1 },
      };

      merchantRepo.findOne.mockResolvedValue(mockMerchant);
      merchantRepo.save.mockResolvedValue(mockMerchant);

      await service.learnFromUserCorrection('ESSELUNGA SPA', 2, 1);

      expect(merchantRepo.findOne).toHaveBeenCalledWith({
        where: { 
          merchantName: 'esselunga spa', 
          user: { id: 1 } 
        }
      });
      expect(merchantRepo.save).toHaveBeenCalled();
    });
  });

  describe('getMerchantStats', () => {
    it('should return merchant statistics', async () => {
      const mockMerchants = [
        {
          merchantName: 'esselunga spa',
          usageCount: 10,
          averageConfidence: 90,
        },
        {
          merchantName: 'nike italia',
          usageCount: 5,
          averageConfidence: 85,
        },
      ];

      merchantRepo.find.mockResolvedValue(mockMerchants);

      const stats = await service.getMerchantStats(1);

      expect(stats.totalMerchants).toBe(2);
      expect(stats.totalCategorizations).toBe(15);
      expect(stats.averageConfidence).toBe(87.5);
      expect(stats.topMerchants).toHaveLength(2);
    });
  });
});
