import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Transaction } from './transaction.entity';
import { Repository } from 'typeorm';
import { CategoriesService } from '../categories/categories.service';
import { BadRequestException } from '@nestjs/common';
import { User } from '../users/user.entity';

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let service: TransactionsService;

  const mockTransactionsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    createAndSaveTransaction: jest.fn(),
    update: jest.fn(),
    enrichTransactionsWithPayPal: jest.fn(),
  };

  const mockCategoriesService = {
    suggestKeywordsFromTransaction: jest
      .fn()
      .mockResolvedValue(['keyword1', 'keyword2']),
  };

  // Mock user data
  const mockUser = {
    id: 1,
    email: 'test@example.com',
    auth0Id: 'auth0|123456789',
    isDemoUser: false,
    demoExpiryDate: new Date('2024-12-31'),
    demoActivatedAt: new Date('2024-01-01'),
    bankAccounts: [],
    creditCards: [],
    categories: [],
    tags: [],
    transactions: [],
    recurringTransactions: [],
    paymentAccounts: [],
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        {
          provide: TransactionsService,
          useValue: mockTransactionsService,
        },
        {
          provide: CategoriesService,
          useValue: mockCategoriesService,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<TransactionsController>(TransactionsController);
    service = module.get<TransactionsService>(TransactionsService);

    // Reset mock calls
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('enrichWithPayPal', () => {
    it('should process PayPal CSV data and enrich transactions', async () => {
      // Mock CSV data
      const paypalCsvData =
        'Data,Nome,Tipo,Stato,Valuta,Importo\n' +
        '10/01/2023,Netflix,Pagamento,Completata,EUR,-15.99\n' +
        '20/01/2023,Amazon,Pagamento,Completata,EUR,-25.50';

      // Mock service return
      mockTransactionsService.enrichTransactionsWithPayPal.mockResolvedValue(2);

      // Create mock PayPalEnrichmentDto
      const dto = {
        csvData: paypalCsvData,
        dateRangeForMatching: 5,
      };

      // Call controller method
      const result = await controller.enrichWithPayPal(dto, mockUser);

      // Verify service was called with parsed transactions
      expect(
        mockTransactionsService.enrichTransactionsWithPayPal,
      ).toHaveBeenCalled();

      // Verify the first argument contains PayPal transactions with proper structure
      const paypalTransactions =
        mockTransactionsService.enrichTransactionsWithPayPal.mock.calls[0][0];
      expect(paypalTransactions).toHaveLength(2);
      expect(paypalTransactions[0]).toHaveProperty('name', 'Netflix');
      expect(paypalTransactions[1]).toHaveProperty('name', 'Amazon');

      // Verify user ID was passed correctly
      expect(
        mockTransactionsService.enrichTransactionsWithPayPal.mock.calls[0][1],
      ).toBe(1);

      // Verify response format
      expect(result).toEqual({
        count: 2,
        message: '2 transactions enriched with PayPal data',
      });
    });

    it('should handle CSV parsing errors', async () => {
      // Invalid CSV data
      const invalidCsvData = 'This is not a valid CSV';

      // Create mock dto with invalid data
      const dto = {
        csvData: invalidCsvData,
        dateRangeForMatching: 5,
      };

      // Expect the controller to throw an exception
      await expect(controller.enrichWithPayPal(dto, mockUser)).rejects.toThrow(
        BadRequestException,
      );

      // Verify service was not called
      expect(
        mockTransactionsService.enrichTransactionsWithPayPal,
      ).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a transaction successfully', async () => {
      const transactionId = 1;
      const updateDto = {
        description: 'Updated transaction',
        amount: 100,
        categoryId: 2,
      };
      const mockUpdatedTransaction = {
        id: transactionId,
        ...updateDto,
        user: mockUser,
      };

      mockTransactionsService.update.mockResolvedValue(mockUpdatedTransaction);

      const result = await controller.update(transactionId, updateDto, mockUser);

      expect(mockTransactionsService.update).toHaveBeenCalledWith(
        transactionId,
        updateDto,
        mockUser.id,
      );
      expect(result).toEqual(mockUpdatedTransaction);
    });

    it('should handle update requests without id field in body', async () => {
      const transactionId = 1;
      const updateDto = {
        description: 'Updated transaction',
        amount: 100,
        categoryId: 2,
      };
      const mockUpdatedTransaction = {
        id: transactionId,
        ...updateDto,
        user: mockUser,
      };

      mockTransactionsService.update.mockResolvedValue(mockUpdatedTransaction);

      const result = await controller.update(transactionId, updateDto, mockUser);

      expect(mockTransactionsService.update).toHaveBeenCalledWith(
        transactionId,
        updateDto,
        mockUser.id,
      );
      expect(result).toEqual(mockUpdatedTransaction);
    });
  });
});
