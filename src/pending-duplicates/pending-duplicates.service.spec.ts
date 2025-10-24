import { Test, TestingModule } from '@nestjs/testing';
import { PendingDuplicatesService } from './pending-duplicates.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PendingDuplicate } from './entities/pending-duplicate.entity';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionOperationsService } from '../transactions/transaction-operations.service';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { NotFoundException } from '@nestjs/common';
import { DuplicateTransactionChoice } from '../transactions/dto/duplicate-transaction-choice.dto';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';

describe('PendingDuplicatesService', () => {
  let service: PendingDuplicatesService;
  let pendingDuplicatesRepository: Repository<PendingDuplicate>;
  let transactionRepository: Repository<Transaction>;
  let transactionOperationsService: TransactionOperationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PendingDuplicatesService,
        RepositoryMockFactory.createRepositoryProvider(PendingDuplicate),
        RepositoryMockFactory.createRepositoryProvider(Transaction),
        RepositoryMockFactory.createRepositoryProvider(RecurringTransaction),
        {
          provide: TransactionOperationsService,
          useValue: {
            findMatchingTransactions: jest.fn(),
            handleDuplicateResolution: jest.fn(),
            createPendingDuplicate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PendingDuplicatesService>(PendingDuplicatesService);
    pendingDuplicatesRepository = module.get<Repository<PendingDuplicate>>(
      getRepositoryToken(PendingDuplicate),
    );
    transactionRepository = module.get<Repository<Transaction>>(
      getRepositoryToken(Transaction),
    );
    transactionOperationsService = module.get<TransactionOperationsService>(
      TransactionOperationsService,
    );

    // Repository methods are already mocked by RepositoryMockFactory
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findPendingDuplicates', () => {
    it('should return pending duplicates for a user', async () => {
      const mockDuplicates = [
        {
          id: 1,
          resolved: false,
          existingTransaction: {
            id: 1,
            description: 'Existing Transaction',
            amount: 100,
          },
        },
      ];
      (pendingDuplicatesRepository.find as jest.Mock).mockResolvedValue(
        mockDuplicates,
      );

      const result = await service.findPendingDuplicates(1);

      expect(result).toEqual(mockDuplicates);
      expect(pendingDuplicatesRepository.find).toHaveBeenCalledWith({
        where: { user: { id: 1 }, resolved: false },
        relations: [
          'existingTransaction',
          'existingTransaction.category',
          'existingTransaction.tags',
          'existingTransaction.bankAccount',
          'existingTransaction.creditCard',
        ],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findAllByExistingTransactionId', () => {
    it('should find all pending duplicates by transaction id', async () => {
      const mockDuplicates = [
        { id: 1, existingTransaction: { id: 123 } },
        { id: 2, existingTransaction: { id: 123 } },
      ];
      (pendingDuplicatesRepository.find as jest.Mock).mockResolvedValue(
        mockDuplicates,
      );

      const result = await service.findAllByExistingTransactionId(123);

      expect(result).toEqual(mockDuplicates);
      expect(pendingDuplicatesRepository.find).toHaveBeenCalledWith({
        where: { existingTransaction: { id: 123 } },
        relations: ['existingTransaction'],
      });
    });
  });

  describe('update', () => {
    it('should update a pending duplicate', async () => {
      const mockDuplicate = { id: 1, user: { id: 1 }, resolved: false };
      const updateData = { resolved: true };

      (pendingDuplicatesRepository.findOne as jest.Mock).mockResolvedValue(
        mockDuplicate,
      );
      (pendingDuplicatesRepository.save as jest.Mock).mockImplementation(
        (entity) => Promise.resolve(entity),
      );

      const result = await service.update(1, updateData, 1);

      expect(result).toEqual({ ...mockDuplicate, ...updateData });
      expect(pendingDuplicatesRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1, user: { id: 1 } },
      });
      expect(pendingDuplicatesRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when duplicate not found', async () => {
      (pendingDuplicatesRepository.findOne as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(service.update(999, { resolved: true }, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createPendingDuplicate', () => {
    it('should create a pending duplicate with source information', async () => {
      const existingTransaction = {
        id: 1,
        description: 'Existing Transaction',
        amount: 100,
      };
      const newTransactionData = {
        description: 'New Transaction',
        amount: 100,
        categoryId: 1,
      };
      const userId = 1;
      const source = 'recurring';
      const sourceReference = 'recurring_id:123';

      const pendingDuplicate = new PendingDuplicate();
      pendingDuplicate.existingTransaction = existingTransaction as Transaction;
      pendingDuplicate.existingTransactionData =
        JSON.stringify(existingTransaction);
      pendingDuplicate.newTransactionData = newTransactionData;
      pendingDuplicate.user = { id: userId } as any;
      pendingDuplicate.source = source as any;
      pendingDuplicate.sourceReference = sourceReference;
      pendingDuplicate.resolved = false;

      (pendingDuplicatesRepository.save as jest.Mock).mockResolvedValue(
        pendingDuplicate,
      );

      const result = await service.createPendingDuplicate(
        existingTransaction as Transaction,
        newTransactionData,
        userId,
        source,
        sourceReference,
      );

      expect(result).toEqual(pendingDuplicate);
      expect(pendingDuplicatesRepository.save).toHaveBeenCalled();
    });
  });

  describe('resolvePendingDuplicate', () => {
    it('should resolve a pending duplicate with MAINTAIN_BOTH choice', async () => {
      const pendingDuplicate = {
        id: 1,
        existingTransaction: { id: 1, description: 'Test', amount: 100 },
        newTransactionData: { description: 'Test', amount: 100 },
        user: { id: 1 },
        resolved: false,
      };

      const newTransaction = { id: 2, description: 'Test', amount: 100 };

      (pendingDuplicatesRepository.findOne as jest.Mock).mockResolvedValue(
        pendingDuplicate,
      );
      (
        transactionOperationsService.handleDuplicateResolution as jest.Mock
      ).mockResolvedValue({
        existingTransaction: pendingDuplicate.existingTransaction,
        newTransaction,
      });
      (pendingDuplicatesRepository.save as jest.Mock).mockResolvedValue({
        ...pendingDuplicate,
        resolved: true,
      });

      const result = await service.resolvePendingDuplicate(
        1,
        1,
        DuplicateTransactionChoice.MAINTAIN_BOTH,
      );

      expect(result).toEqual({
        existingTransaction: pendingDuplicate.existingTransaction,
        newTransaction: {
          existingTransaction: pendingDuplicate.existingTransaction,
          newTransaction,
        },
        resolved: true,
      });

      expect(pendingDuplicatesRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1, user: { id: 1 }, resolved: false },
        relations: ['existingTransaction'],
      });

      expect(
        transactionOperationsService.handleDuplicateResolution,
      ).toHaveBeenCalledWith(
        pendingDuplicate.existingTransaction,
        pendingDuplicate.newTransactionData,
        1,
        DuplicateTransactionChoice.MAINTAIN_BOTH,
      );

      expect(pendingDuplicatesRepository.save).toHaveBeenCalledWith({
        ...pendingDuplicate,
        resolved: true,
      });
    });

    it('should throw NotFoundException if pending duplicate is not found', async () => {
      (pendingDuplicatesRepository.findOne as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.resolvePendingDuplicate(
          1,
          1,
          DuplicateTransactionChoice.MAINTAIN_BOTH,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle KEEP_EXISTING choice even if resolution throws an error', async () => {
      const mockPendingDuplicate = {
        id: 1,
        existingTransaction: {
          id: 1,
          description: 'Existing Transaction',
          amount: 100,
        },
        newTransactionData: {
          description: 'New Transaction',
          amount: 100,
          categoryId: 1,
        },
        resolved: false,
        user: { id: 1 },
      };

      (pendingDuplicatesRepository.findOne as jest.Mock).mockResolvedValue(
        mockPendingDuplicate,
      );
      (
        transactionOperationsService.handleDuplicateResolution as jest.Mock
      ).mockRejectedValue(new Error('Some error'));
      (pendingDuplicatesRepository.save as jest.Mock).mockImplementation(
        (entity) => Promise.resolve(entity),
      );

      const result = await service.resolvePendingDuplicate(
        1,
        1,
        DuplicateTransactionChoice.KEEP_EXISTING,
      );

      expect(result).toEqual({
        existingTransaction: mockPendingDuplicate.existingTransaction,
        newTransaction: null,
        resolved: true,
      });

      expect(pendingDuplicatesRepository.save).toHaveBeenCalledWith({
        ...mockPendingDuplicate,
        resolved: true,
      });
    });
  });
});
