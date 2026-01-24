import { Test, TestingModule } from '@nestjs/testing';
import { TransactionLinkSuggestionService } from './transaction-link-suggestion.service';
import { TransactionLinkSuggestion } from './entities/transaction-link-suggestion.entity';
import { ExpensePlan } from './entities/expense-plan.entity';
import { Transaction } from '../transactions/transaction.entity';
import { ExpensePlansService } from './expense-plans.service';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';

describe('TransactionLinkSuggestionService', () => {
  let service: TransactionLinkSuggestionService;
  let suggestionRepository: Repository<TransactionLinkSuggestion>;
  let expensePlanRepository: Repository<ExpensePlan>;
  let transactionRepository: Repository<Transaction>;
  let expensePlansService: jest.Mocked<ExpensePlansService>;
  let module: TestingModule;

  const mockUser = {
    id: 1,
    auth0Id: 'auth0|123456',
    email: 'test@example.com',
  };

  const mockCategory = {
    id: 1,
    name: 'Asilo',
  };

  const mockExpensePlan: Partial<ExpensePlan> = {
    id: 1,
    userId: 1,
    name: 'Asilo Figlio',
    icon: '👶',
    categoryId: 1,
    purpose: 'sinking_fund',
    status: 'active',
    autoTrackCategory: false,
    currentBalance: 500,
    targetAmount: 1000,
  };

  const mockTransaction: Partial<Transaction> = {
    id: 123,
    description: 'Asilo Nido Milano',
    amount: -300,
    type: 'expense',
    createdAt: new Date('2026-01-24'),
    executionDate: new Date('2026-01-24'),
    category: mockCategory as any,
    user: mockUser as any,
  };

  const mockSuggestion: Partial<TransactionLinkSuggestion> = {
    id: 1,
    userId: 1,
    transactionId: 123,
    expensePlanId: 1,
    transactionAmount: -300,
    transactionDescription: 'Asilo Nido Milano',
    transactionDate: new Date('2026-01-24'),
    suggestedType: 'withdrawal',
    status: 'pending',
    expensePlanTransactionId: null,
    rejectionReason: null,
    reviewedAt: null,
    createdAt: new Date('2026-01-24'),
    updatedAt: new Date('2026-01-24'),
    expensePlan: mockExpensePlan as ExpensePlan,
  };

  const mockPlanTransaction = {
    id: 42,
    expensePlanId: 1,
    type: 'withdrawal',
    amount: -300,
    balanceAfter: 200,
    date: new Date(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        TransactionLinkSuggestionService,
        RepositoryMockFactory.createRepositoryProvider(TransactionLinkSuggestion),
        RepositoryMockFactory.createRepositoryProvider(ExpensePlan),
        RepositoryMockFactory.createRepositoryProvider(Transaction),
        {
          provide: ExpensePlansService,
          useValue: {
            withdraw: jest.fn().mockResolvedValue(mockPlanTransaction),
            contribute: jest.fn().mockResolvedValue(mockPlanTransaction),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionLinkSuggestionService>(
      TransactionLinkSuggestionService,
    );
    suggestionRepository = module.get(
      getRepositoryToken(TransactionLinkSuggestion),
    );
    expensePlanRepository = module.get(getRepositoryToken(ExpensePlan));
    transactionRepository = module.get(getRepositoryToken(Transaction));
    expensePlansService = module.get(ExpensePlansService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('findPending', () => {
    it('should return pending suggestions for user', async () => {
      jest.spyOn(suggestionRepository, 'find').mockResolvedValue([
        mockSuggestion as TransactionLinkSuggestion,
      ]);

      const result = await service.findPending(1);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(result[0].transactionDescription).toBe('Asilo Nido Milano');
      expect(result[0].expensePlanName).toBe('Asilo Figlio');
      expect(suggestionRepository.find).toHaveBeenCalledWith({
        where: { userId: 1, status: 'pending' },
        relations: ['expensePlan'],
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array when no pending suggestions', async () => {
      jest.spyOn(suggestionRepository, 'find').mockResolvedValue([]);

      const result = await service.findPending(1);

      expect(result).toHaveLength(0);
    });
  });

  describe('getCounts', () => {
    it('should return pending and total counts', async () => {
      jest
        .spyOn(suggestionRepository, 'count')
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(10);

      const result = await service.getCounts(1);

      expect(result.pending).toBe(3);
      expect(result.total).toBe(10);
    });
  });

  describe('findById', () => {
    it('should return suggestion when found', async () => {
      jest.spyOn(suggestionRepository, 'findOne').mockResolvedValue(
        mockSuggestion as TransactionLinkSuggestion,
      );

      const result = await service.findById(1, 1);

      expect(result.id).toBe(1);
      expect(suggestionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1, userId: 1 },
        relations: ['expensePlan', 'transaction'],
      });
    });

    it('should throw NotFoundException when not found', async () => {
      jest.spyOn(suggestionRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findById(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createSuggestion', () => {
    it('should create a withdrawal suggestion for expense transaction', async () => {
      jest.spyOn(suggestionRepository, 'create').mockReturnValue(
        mockSuggestion as TransactionLinkSuggestion,
      );
      jest.spyOn(suggestionRepository, 'save').mockResolvedValue(
        mockSuggestion as TransactionLinkSuggestion,
      );

      const result = await service.createSuggestion(
        mockTransaction as Transaction,
        mockExpensePlan as ExpensePlan,
        1,
      );

      expect(result.suggestedType).toBe('withdrawal');
      expect(suggestionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          transactionId: 123,
          expensePlanId: 1,
          suggestedType: 'withdrawal',
          status: 'pending',
        }),
      );
    });

    it('should create a contribution suggestion for income transaction', async () => {
      const incomeTransaction = {
        ...mockTransaction,
        type: 'income',
        amount: 100,
      } as Transaction;

      jest.spyOn(suggestionRepository, 'create').mockReturnValue({
        ...mockSuggestion,
        suggestedType: 'contribution',
      } as TransactionLinkSuggestion);
      jest.spyOn(suggestionRepository, 'save').mockResolvedValue({
        ...mockSuggestion,
        suggestedType: 'contribution',
      } as TransactionLinkSuggestion);

      await service.createSuggestion(
        incomeTransaction,
        mockExpensePlan as ExpensePlan,
        1,
      );

      expect(suggestionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedType: 'contribution',
        }),
      );
    });
  });

  describe('approve', () => {
    it('should approve suggestion and create withdrawal', async () => {
      jest.spyOn(suggestionRepository, 'findOne').mockResolvedValue(
        mockSuggestion as TransactionLinkSuggestion,
      );
      jest.spyOn(suggestionRepository, 'save').mockResolvedValue({
        ...mockSuggestion,
        status: 'approved',
        expensePlanTransactionId: 42,
      } as TransactionLinkSuggestion);

      const result = await service.approve(1, 1);

      expect(result.success).toBe(true);
      expect(result.planTransactionId).toBe(42);
      expect(result.newBalance).toBe(200);
      expect(expensePlansService.withdraw).toHaveBeenCalledWith(
        1,
        1,
        300, // absolute value
        'Collegato: Asilo Nido Milano',
        123,
        false,
      );
    });

    it('should approve with custom amount', async () => {
      const pendingSuggestion = { ...mockSuggestion, status: 'pending' as const };
      jest.spyOn(suggestionRepository, 'findOne').mockResolvedValue(
        pendingSuggestion as TransactionLinkSuggestion,
      );
      jest.spyOn(suggestionRepository, 'save').mockResolvedValue({
        ...pendingSuggestion,
        status: 'approved',
      } as TransactionLinkSuggestion);

      await service.approve(1, 1, 250);

      expect(expensePlansService.withdraw).toHaveBeenCalledWith(
        1,
        1,
        250,
        expect.any(String),
        123,
        false,
      );
    });

    it('should throw BadRequestException if already processed', async () => {
      jest.spyOn(suggestionRepository, 'findOne').mockResolvedValue({
        ...mockSuggestion,
        status: 'approved',
      } as TransactionLinkSuggestion);

      await expect(service.approve(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should call contribute for contribution type', async () => {
      const contributionSuggestion = {
        ...mockSuggestion,
        status: 'pending' as const,
        suggestedType: 'contribution' as const,
        transactionAmount: 100,
      };

      jest.spyOn(suggestionRepository, 'findOne').mockResolvedValue(
        contributionSuggestion as TransactionLinkSuggestion,
      );
      jest.spyOn(suggestionRepository, 'save').mockResolvedValue({
        ...contributionSuggestion,
        status: 'approved',
      } as TransactionLinkSuggestion);

      await service.approve(1, 1);

      expect(expensePlansService.contribute).toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('should reject suggestion with reason', async () => {
      const pendingSuggestion = { ...mockSuggestion, status: 'pending' as const };
      jest.spyOn(suggestionRepository, 'findOne').mockResolvedValue(
        pendingSuggestion as TransactionLinkSuggestion,
      );
      jest.spyOn(suggestionRepository, 'save').mockResolvedValue({
        ...pendingSuggestion,
        status: 'rejected',
        rejectionReason: 'Already tracked elsewhere',
      } as TransactionLinkSuggestion);

      await service.reject(1, 1, 'Already tracked elsewhere');

      expect(suggestionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'rejected',
          rejectionReason: 'Already tracked elsewhere',
        }),
      );
    });

    it('should throw BadRequestException if already processed', async () => {
      jest.spyOn(suggestionRepository, 'findOne').mockResolvedValue({
        ...mockSuggestion,
        status: 'rejected',
      } as TransactionLinkSuggestion);

      await expect(service.reject(1, 1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('bulkApprove', () => {
    it('should approve multiple suggestions', async () => {
      const suggestion1 = { ...mockSuggestion, id: 1, status: 'pending' as const };
      const suggestion2 = { ...mockSuggestion, id: 2, transactionId: 124, status: 'pending' as const };

      jest
        .spyOn(suggestionRepository, 'findOne')
        .mockResolvedValueOnce(suggestion1 as TransactionLinkSuggestion)
        .mockResolvedValueOnce(suggestion2 as TransactionLinkSuggestion);
      jest.spyOn(suggestionRepository, 'save').mockResolvedValue({
        ...mockSuggestion,
        status: 'approved',
      } as TransactionLinkSuggestion);

      const result = await service.bulkApprove([1, 2], 1);

      expect(result.approvedCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });

    it('should handle partial failures', async () => {
      const pendingSuggestion = { ...mockSuggestion, status: 'pending' as const };
      jest
        .spyOn(suggestionRepository, 'findOne')
        .mockResolvedValueOnce(pendingSuggestion as TransactionLinkSuggestion)
        .mockResolvedValueOnce(null);
      jest.spyOn(suggestionRepository, 'save').mockResolvedValue({
        ...pendingSuggestion,
        status: 'approved',
      } as TransactionLinkSuggestion);

      const result = await service.bulkApprove([1, 999], 1);

      expect(result.approvedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.failedIds).toContain(999);
    });
  });

  describe('invalidateForTransaction', () => {
    it('should invalidate pending suggestions', async () => {
      jest.spyOn(suggestionRepository, 'update').mockResolvedValue({
        affected: 2,
      } as any);

      await service.invalidateForTransaction(123);

      expect(suggestionRepository.update).toHaveBeenCalledWith(
        { transactionId: 123, status: 'pending' },
        { status: 'invalidated', reviewedAt: expect.any(Date) },
      );
    });
  });

  describe('checkSuggestionExists', () => {
    it('should return true when suggestion exists', async () => {
      jest.spyOn(suggestionRepository, 'findOne').mockResolvedValue(
        mockSuggestion as TransactionLinkSuggestion,
      );

      const result = await service.checkSuggestionExists(123, 1);

      expect(result).toBe(true);
    });

    it('should return false when suggestion does not exist', async () => {
      jest.spyOn(suggestionRepository, 'findOne').mockResolvedValue(null);

      const result = await service.checkSuggestionExists(999, 1);

      expect(result).toBe(false);
    });
  });

  describe('findMatchingPlans', () => {
    it('should find sinking fund plans with matching category', async () => {
      jest.spyOn(expensePlanRepository, 'find').mockResolvedValue([
        mockExpensePlan as ExpensePlan,
      ]);

      const result = await service.findMatchingPlans(1, 1);

      expect(result).toHaveLength(1);
      expect(expensePlanRepository.find).toHaveBeenCalledWith({
        where: {
          userId: 1,
          categoryId: 1,
          purpose: 'sinking_fund',
          status: 'active',
          autoTrackCategory: false,
        },
      });
    });
  });
});
