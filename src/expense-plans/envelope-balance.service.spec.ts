import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnvelopeBalanceService } from './envelope-balance.service';
import { ExpensePlan } from './entities/expense-plan.entity';
import { ExpensePlanPayment } from './entities/expense-plan-payment.entity';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';
import { NotFoundException } from '@nestjs/common';

describe('EnvelopeBalanceService', () => {
  let service: EnvelopeBalanceService;
  let planRepository: Repository<ExpensePlan>;
  let paymentRepository: Repository<ExpensePlanPayment>;
  let module: TestingModule;

  const mockUserId = 1;

  // Mock spending budget plan with rollover enabled
  // Created in January 2026 so only one month of history for January 2026 tests
  const mockSpendingBudgetWithRollover: Partial<ExpensePlan> = {
    id: 1,
    userId: mockUserId,
    name: 'Personal Care',
    icon: '💅',
    planType: 'fixed_monthly',
    purpose: 'spending_budget',
    monthlyContribution: 149,
    rolloverSurplus: true,
    status: 'active',
    createdAt: new Date('2026-01-01'), // Created in Jan 2026
  };

  // Mock spending budget without rollover
  const mockSpendingBudgetNoRollover: Partial<ExpensePlan> = {
    id: 2,
    userId: mockUserId,
    name: 'Entertainment',
    icon: '🎬',
    planType: 'fixed_monthly',
    purpose: 'spending_budget',
    monthlyContribution: 100,
    rolloverSurplus: false,
    status: 'active',
    createdAt: new Date('2026-01-01'), // Created in Jan 2026
  };

  // Mock sinking fund (always rolls over)
  // Created in January 2026 for simplicity
  const mockSinkingFund: Partial<ExpensePlan> = {
    id: 3,
    userId: mockUserId,
    name: 'Car Insurance',
    icon: '🚗',
    planType: 'yearly_fixed',
    purpose: 'sinking_fund',
    monthlyContribution: 100,
    rolloverSurplus: false, // Should be ignored for sinking funds
    status: 'active',
    createdAt: new Date('2026-01-01'), // Created in Jan 2026
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        EnvelopeBalanceService,
        RepositoryMockFactory.createRepositoryProvider(ExpensePlan),
        RepositoryMockFactory.createRepositoryProvider(ExpensePlanPayment),
      ],
    }).compile();

    service = module.get<EnvelopeBalanceService>(EnvelopeBalanceService);
    planRepository = module.get(getRepositoryToken(ExpensePlan));
    paymentRepository = module.get(getRepositoryToken(ExpensePlanPayment));
  });

  afterEach(async () => {
    await module.close();
  });

  describe('calculateEnvelopeBalance', () => {
    it('should calculate envelope balance correctly for a new month', async () => {
      // Arrange: Plan with 149/month allocation, spent 55 in January 2026
      (planRepository.findOne as jest.Mock).mockResolvedValue(
        mockSpendingBudgetWithRollover,
      );

      // Mock query builder for payments
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '55' }),
      };
      (paymentRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      // Act: Calculate for January 2026 (plan created in Jan 2025, so prev balance = 0)
      const result = await service.calculateEnvelopeBalance(
        1,
        2026,
        1,
        mockUserId,
      );

      // Assert
      expect(result.planId).toBe(1);
      expect(result.planName).toBe('Personal Care');
      expect(result.monthlyAllocation).toBe(149);
      expect(result.actualSpending).toBe(55);
      // previousBalance = 0 (start of tracking or recursive calc)
      // currentBalance = prev(0) + alloc(149) - spent(55) = 94
      expect(result.currentBalance).toBe(94);
      expect(result.status).toBe('under_budget');
      // utilization = 55/149 * 100 = 36.9%
      expect(result.utilizationPercent).toBeCloseTo(36.9, 1);
    });

    it('should throw NotFoundException for non-existent plan', async () => {
      // Arrange
      (planRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.calculateEnvelopeBalance(999, 2026, 1, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return over_budget status when spending exceeds allocation', async () => {
      // Arrange: Spent 200 on a 149 budget
      (planRepository.findOne as jest.Mock).mockResolvedValue(
        mockSpendingBudgetWithRollover,
      );

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '200' }),
      };
      (paymentRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.calculateEnvelopeBalance(
        1,
        2026,
        1,
        mockUserId,
      );

      // Assert
      expect(result.status).toBe('over_budget');
      expect(result.utilizationPercent).toBeCloseTo(134.2, 1); // 200/149 * 100
    });

    it('should return on_budget status when spending is close to allocation', async () => {
      // Arrange: Spent 140 on a 149 budget (94%)
      (planRepository.findOne as jest.Mock).mockResolvedValue(
        mockSpendingBudgetWithRollover,
      );

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '140' }),
      };
      (paymentRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.calculateEnvelopeBalance(
        1,
        2026,
        1,
        mockUserId,
      );

      // Assert
      expect(result.status).toBe('on_budget');
    });
  });

  describe('rollover behavior', () => {
    it('should reset spending_budget balance when rolloverSurplus=false', async () => {
      // Arrange: Spending budget without rollover
      (planRepository.findOne as jest.Mock).mockResolvedValue(
        mockSpendingBudgetNoRollover,
      );

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '50' }),
      };
      (paymentRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      // Act: February should start fresh (no rollover from January)
      const result = await service.calculateEnvelopeBalance(
        2,
        2026,
        2,
        mockUserId,
      );

      // Assert: previousBalance should be 0 (no rollover)
      expect(result.previousBalance).toBe(0);
      // currentBalance = 0 + 100 - 50 = 50
      expect(result.currentBalance).toBe(50);
    });

    it('should always rollover sinking_fund even when rolloverSurplus=false', async () => {
      // Arrange: Sinking fund ignores rolloverSurplus flag
      // Create a version with createdAt before January 2026
      const sinkingFundCreatedEarly: Partial<ExpensePlan> = {
        ...mockSinkingFund,
        createdAt: new Date('2025-12-01'), // Created before Jan 2026
      };
      (planRepository.findOne as jest.Mock).mockResolvedValue(
        sinkingFundCreatedEarly,
      );

      // Mock: January had 100 allocated, 0 spent (accumulating)
      // February should see 100 carried over
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
      };
      (paymentRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      // Act: Calculate for February 2026
      const result = await service.calculateEnvelopeBalance(
        3,
        2026,
        2,
        mockUserId,
      );

      // Assert: Sinking fund should carry over
      // Jan balance = 0 + 100 - 0 = 100
      // Feb previous = 100
      // Feb current = 100 + 100 - 0 = 200
      expect(result.previousBalance).toBe(100);
      expect(result.currentBalance).toBe(200);
    });
  });

  describe('getTotalEnvelopeBuffer', () => {
    it('should calculate total buffer from all active plans', async () => {
      // Arrange: Multiple plans
      (planRepository.find as jest.Mock).mockResolvedValue([
        mockSpendingBudgetWithRollover,
        mockSinkingFund,
      ]);
      (planRepository.findOne as jest.Mock).mockImplementation(
        async ({ where }: any) => {
          if (where.id === 1) return mockSpendingBudgetWithRollover;
          if (where.id === 3) return mockSinkingFund;
          return null;
        },
      );

      // Mock query builder - spending is 50 for each
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '50' }),
      };
      (paymentRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getTotalEnvelopeBuffer(mockUserId, 2026, 1);

      // Assert
      expect(result.year).toBe(2026);
      expect(result.month).toBe(1);
      expect(result.planBuffers).toHaveLength(2);

      // Plan 1: 149 - 50 = 99 balance
      // Plan 3: 100 - 50 = 50 balance
      // Total buffer = 99 + 50 = 149
      expect(result.totalPositiveBalance).toBe(149);
    });

    it('should separate plans by purpose', async () => {
      // Arrange
      (planRepository.find as jest.Mock).mockResolvedValue([
        mockSpendingBudgetWithRollover,
        mockSinkingFund,
      ]);
      (planRepository.findOne as jest.Mock).mockImplementation(
        async ({ where }: any) => {
          if (where.id === 1) return mockSpendingBudgetWithRollover;
          if (where.id === 3) return mockSinkingFund;
          return null;
        },
      );

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
      };
      (paymentRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getTotalEnvelopeBuffer(mockUserId, 2026, 1);

      // Assert
      expect(result.byPurpose.spendingBudgets).toHaveLength(1);
      expect(result.byPurpose.sinkingFunds).toHaveLength(1);
      expect(result.byPurpose.spendingBudgets[0].planName).toBe('Personal Care');
      expect(result.byPurpose.sinkingFunds[0].planName).toBe('Car Insurance');
    });

    it('should exclude negative balances from totalPositiveBalance', async () => {
      // Arrange: Plan with overspending
      const overspentPlan: Partial<ExpensePlan> = {
        ...mockSpendingBudgetNoRollover,
        id: 4,
      };
      (planRepository.find as jest.Mock).mockResolvedValue([overspentPlan]);
      (planRepository.findOne as jest.Mock).mockResolvedValue(overspentPlan);

      // Spent 150 on a 100 budget = -50 balance
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '150' }),
      };
      (paymentRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getTotalEnvelopeBuffer(mockUserId, 2026, 1);

      // Assert: Negative balance should not contribute to buffer
      expect(result.totalPositiveBalance).toBe(0);
      expect(result.planBuffers[0].currentBalance).toBe(-50);
    });
  });

  describe('edge cases', () => {
    it('should handle zero monthlyContribution', async () => {
      // Arrange
      const zeroPlan: Partial<ExpensePlan> = {
        ...mockSpendingBudgetWithRollover,
        monthlyContribution: 0,
      };
      (planRepository.findOne as jest.Mock).mockResolvedValue(zeroPlan);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
      };
      (paymentRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.calculateEnvelopeBalance(
        1,
        2026,
        1,
        mockUserId,
      );

      // Assert
      expect(result.monthlyAllocation).toBe(0);
      expect(result.currentBalance).toBe(0);
      expect(result.utilizationPercent).toBe(0);
    });

    it('should handle no payments in period', async () => {
      // Arrange
      (planRepository.findOne as jest.Mock).mockResolvedValue(
        mockSpendingBudgetWithRollover,
      );

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: null }),
      };
      (paymentRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.calculateEnvelopeBalance(
        1,
        2026,
        1,
        mockUserId,
      );

      // Assert
      expect(result.actualSpending).toBe(0);
      expect(result.currentBalance).toBe(149); // Full allocation available
    });
  });
});
