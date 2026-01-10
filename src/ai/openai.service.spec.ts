import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OpenAIService, OpenAICategorizationRequest } from './openai.service';

// Mock fetch globally
global.fetch = jest.fn();

describe('OpenAIService', () => {
  let service: OpenAIService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAIService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OpenAIService>(OpenAIService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('categorizeTransaction', () => {
    const mockRequest: OpenAICategorizationRequest = {
      merchantName: 'ESSELUNGA SPA',
      merchantCategoryCode: '5411',
      description: 'Grocery store purchase',
      amount: -50.0,
      transactionType: 'expense',
      availableCategories: [
        {
          id: 1,
          name: 'Groceries',
          keywords: ['grocery', 'supermarket', 'food'],
        },
        {
          id: 2,
          name: 'Restaurant',
          keywords: ['restaurant', 'dining', 'food'],
        },
        {
          id: 3,
          name: 'Transportation',
          keywords: ['gas', 'fuel', 'transport'],
        },
      ],
    };

    beforeEach(() => {
      // Reset all mocks before each test
      jest.clearAllMocks();
    });

    it('should return null when API key is not configured', async () => {
      configService.get.mockReturnValue(undefined);

      const result = await service.categorizeTransaction(mockRequest);
      expect(result).toBeNull();
    });

    it('should categorize transaction successfully', async () => {
      // Create a new service instance with proper config
      const mockConfigService = {
        get: jest
          .fn()
          .mockReturnValueOnce('test-api-key') // OPENAI_API_KEY
          .mockReturnValueOnce('gpt-3.5-turbo') // OPENAI_MODEL
          .mockReturnValueOnce(150) // OPENAI_MAX_TOKENS
          .mockReturnValueOnce('https://api.openai.com/v1'), // OPENAI_BASE_URL
      };

      const testService = new OpenAIService(mockConfigService as any);

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                categoryId: 1,
                categoryName: 'Groceries',
                confidence: 95,
                reasoning: 'ESSELUNGA is a grocery store chain',
              }),
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await testService.categorizeTransaction(mockRequest);

      expect(result).toEqual({
        categoryId: 1,
        categoryName: 'Groceries',
        confidence: 95,
        reasoning: 'ESSELUNGA is a grocery store chain',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    it('should handle API errors gracefully', async () => {
      const mockConfigService = {
        get: jest
          .fn()
          .mockReturnValueOnce('test-api-key')
          .mockReturnValueOnce('gpt-3.5-turbo')
          .mockReturnValueOnce(150)
          .mockReturnValueOnce('https://api.openai.com/v1'),
      };

      const testService = new OpenAIService(mockConfigService as any);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const result = await testService.categorizeTransaction(mockRequest);
      expect(result).toBeNull();
    });

    it('should handle invalid JSON response', async () => {
      const mockConfigService = {
        get: jest
          .fn()
          .mockReturnValueOnce('test-api-key')
          .mockReturnValueOnce('gpt-3.5-turbo')
          .mockReturnValueOnce(150)
          .mockReturnValueOnce('https://api.openai.com/v1'),
      };

      const testService = new OpenAIService(mockConfigService as any);

      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Invalid JSON response',
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await testService.categorizeTransaction(mockRequest);
      expect(result).toBeNull();
    });

    it('should handle invalid category ID', async () => {
      const mockConfigService = {
        get: jest
          .fn()
          .mockReturnValueOnce('test-api-key')
          .mockReturnValueOnce('gpt-3.5-turbo')
          .mockReturnValueOnce(150)
          .mockReturnValueOnce('https://api.openai.com/v1'),
      };

      const testService = new OpenAIService(mockConfigService as any);

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                categoryId: 999, // Invalid category ID
                categoryName: 'Invalid Category',
                confidence: 95,
                reasoning: 'Test reasoning',
              }),
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await testService.categorizeTransaction(mockRequest);
      expect(result).toBeNull();
    });

    it('should clamp confidence to 0-100 range', async () => {
      const mockConfigService = {
        get: jest
          .fn()
          .mockReturnValueOnce('test-api-key')
          .mockReturnValueOnce('gpt-3.5-turbo')
          .mockReturnValueOnce(150)
          .mockReturnValueOnce('https://api.openai.com/v1'),
      };

      const testService = new OpenAIService(mockConfigService as any);

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                categoryId: 1,
                categoryName: 'Groceries',
                confidence: 150, // Out of range
                reasoning: 'Test reasoning',
              }),
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await testService.categorizeTransaction(mockRequest);
      expect(result?.confidence).toBe(100);
    });
  });

  describe('testConnection', () => {
    it('should return false when API key is not configured', async () => {
      const mockConfigService = {
        get: jest.fn().mockReturnValue(undefined),
      };

      const testService = new OpenAIService(mockConfigService as any);

      const result = await testService.testConnection();
      expect(result).toBe(false);
    });

    it('should return true when connection is successful', async () => {
      const mockConfigService = {
        get: jest.fn().mockReturnValue('test-api-key'),
      };

      const testService = new OpenAIService(mockConfigService as any);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const result = await testService.testConnection();
      expect(result).toBe(true);
    });

    it('should return false when connection fails', async () => {
      const mockConfigService = {
        get: jest.fn().mockReturnValue('test-api-key'),
      };

      const testService = new OpenAIService(mockConfigService as any);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await testService.testConnection();
      expect(result).toBe(false);
    });
  });
});
