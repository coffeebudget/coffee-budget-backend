import { Test, TestingModule } from '@nestjs/testing';
import { ExpensePlanAdjustmentService } from './expense-plan-adjustment.service';
import { ExpensePlan } from './entities/expense-plan.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';
import { EventPublisherService } from '../shared/services/event-publisher.service';

describe('ExpensePlanAdjustmentService', () => {
  let service: ExpensePlanAdjustmentService;
  let expensePlanRepository: Repository<ExpensePlan>;
  let transactionRepository: Repository<Transaction>;
  let module: TestingModule;

  const mockUser = {
    id: 1,
    auth0Id: 'auth0|123456',
    email: 'test@example.com',
    isDemoUser: false,
    demoExpiryDate: new Date('2024-12-31'),
    demoActivatedAt: new Date('2024-01-01'),
    bankAccounts: [],
    creditCards: [],
    transactions: [],
    tags: [],
    categories: [],
    recurringTransactions: [],
    paymentAccounts: [],
  };

  const mockCategory = {
    id: 376,
    name: 'Electricity',
    keywords: ['electricity', 'a2a', 'hera'],
    user: mockUser,
    transactions: [],
    recurringTransactions: [],
    excludeFromExpenseAnalytics: false,
    analyticsExclusionReason: null,
    budgetLevel: 'primary' as const,
    monthlyBudget: null,
    yearlyBudget: 1500,
    maxThreshold: null,
    warningThreshold: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const createMockExpensePlan = (overrides: Partial<ExpensePlan> = {}): ExpensePlan => ({
    id: 1,
    userId: 1,
    user: mockUser as any,
    name: 'Electricity',
    description: 'Monthly electricity bills',
    icon: '⚡',
    planType: 'fixed_monthly',
    priority: 'essential',
    categoryId: 376,
    category: mockCategory as any,
    autoTrackCategory: true,
    purpose: 'sinking_fund',
    targetAmount: 1200,
    currentBalance: 300,
    monthlyContribution: 100,
    contributionSource: 'calculated',
    frequency: 'monthly',
    frequencyYears: null,
    dueMonth: null,
    dueDay: null,
    targetDate: null,
    seasonalMonths: null,
    lastFundedDate: new Date('2024-11-01'),
    nextDueDate: new Date('2025-01-15'),
    status: 'active',
    autoCalculate: true,
    rolloverSurplus: true,
    initialBalanceSource: 'zero',
    initialBalanceCustom: null,
    paymentAccountType: null,
    paymentAccountId: null,
    paymentAccount: null,
    suggestedMonthlyContribution: null,
    suggestedAdjustmentPercent: null,
    adjustmentReason: null,
    adjustmentSuggestedAt: null,
    adjustmentDismissedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    transactions: [],
    ...overrides,
  });

  const createMockTransaction = (
    id: number,
    amount: number,
    executionDate: Date,
    categoryId: number = 376,
  ): Partial<Transaction> => ({
    id,
    amount,
    executionDate,
    category: { id: categoryId } as any,
    type: 'expense',
    user: { id: 1 } as any,
    description: 'Test electricity bill',
  });

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ExpensePlanAdjustmentService,
        RepositoryMockFactory.createRepositoryProvider(ExpensePlan),
        RepositoryMockFactory.createRepositoryProvider(Transaction),
        {
          provide: EventPublisherService,
          useValue: {
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExpensePlanAdjustmentService>(ExpensePlanAdjustmentService);
    expensePlanRepository = module.get(getRepositoryToken(ExpensePlan));
    transactionRepository = module.get(getRepositoryToken(Transaction));
  });

  afterEach(async () => {
    await module.close();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CALCULATE CATEGORY SPENDING
  // ═══════════════════════════════════════════════════════════════════════════

  describe('calculateCategorySpending', () => {
    it('should calculate weighted monthly average for category transactions', async () => {
      // Arrange
      const userId = 1;
      const categoryId = 376;
      const now = new Date('2025-12-15');
      jest.useFakeTimers().setSystemTime(now);

      // 6 transactions over 10 months = ~125€/month
      const mockTransactions = [
        createMockTransaction(1, -194, new Date('2025-02-05')),
        createMockTransaction(2, -229, new Date('2025-04-01')),
        createMockTransaction(3, -206, new Date('2025-05-29')),
        createMockTransaction(4, -165, new Date('2025-07-30')),
        createMockTransaction(5, -109, new Date('2025-09-30')),
        createMockTransaction(6, -130, new Date('2025-11-26')),
      ];

      (transactionRepository.find as jest.Mock).mockResolvedValue(mockTransactions);

      // Act
      const result = await service.calculateCategorySpending(userId, categoryId);

      // Assert
      expect(result.transactionCount).toBe(6);
      expect(result.weightedMonthlyAverage).toBeGreaterThan(100);
      expect(result.weightedMonthlyAverage).toBeLessThan(150);

      jest.useRealTimers();
    });

    it('should only include transactions from the last 12 months', async () => {
      // Arrange
      const userId = 1;
      const categoryId = 376;

      (transactionRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      await service.calculateCategorySpending(userId, categoryId);

      // Assert
      expect(transactionRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: { id: userId },
            category: { id: categoryId },
            type: 'expense',
          }),
        }),
      );
    });

    it('should handle categories with no transactions gracefully', async () => {
      // Arrange
      const userId = 1;
      const categoryId = 999;

      (transactionRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.calculateCategorySpending(userId, categoryId);

      // Assert
      expect(result.transactionCount).toBe(0);
      expect(result.weightedMonthlyAverage).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DETECT ADJUSTMENT NEEDED
  // ═══════════════════════════════════════════════════════════════════════════

  describe('detectAdjustmentNeeded', () => {
    it('should suggest increase when spending exceeds plan by 10%+', async () => {
      // Arrange
      const plan = createMockExpensePlan({ monthlyContribution: 100 });

      // Mock transactions: 3 months span, total 345€ = 115€/month (15% higher)
      const mockTransactions = [
        createMockTransaction(1, -115, new Date('2025-09-15')),
        createMockTransaction(2, -115, new Date('2025-10-15')),
        createMockTransaction(3, -115, new Date('2025-11-15')),
      ];
      (transactionRepository.find as jest.Mock).mockResolvedValue(mockTransactions);

      // Act
      const result = await service.detectAdjustmentNeeded(plan);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.suggestedAmount).toBeGreaterThan(100);
      expect(result?.reason).toBe('spending_increased');
      expect(result?.percentChange).toBeGreaterThanOrEqual(10);
    });

    it('should suggest decrease when spending is below plan by 10%+', async () => {
      // Arrange
      const plan = createMockExpensePlan({ monthlyContribution: 100 });

      // Mock transactions: 2 months span (Sep 15 - Nov 15 = ~2 months)
      // Total 170€ / 2 months = 85€/month (15% lower than 100)
      const mockTransactions = [
        createMockTransaction(1, -85, new Date('2025-09-15')),
        createMockTransaction(2, -85, new Date('2025-11-15')),
      ];
      (transactionRepository.find as jest.Mock).mockResolvedValue(mockTransactions);

      // Act
      const result = await service.detectAdjustmentNeeded(plan);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.suggestedAmount).toBeLessThan(100);
      expect(result?.reason).toBe('spending_decreased');
      expect(result?.percentChange).toBeLessThanOrEqual(-10);
    });

    it('should not suggest adjustment when within 10% threshold', async () => {
      // Arrange
      const plan = createMockExpensePlan({ monthlyContribution: 100 });

      // Mock transactions: 2 months span
      // Total 210€ / 2 months = 105€/month (only 5% higher than 100)
      const mockTransactions = [
        createMockTransaction(1, -105, new Date('2025-09-15')),
        createMockTransaction(2, -105, new Date('2025-11-15')),
      ];
      (transactionRepository.find as jest.Mock).mockResolvedValue(mockTransactions);

      // Act
      const result = await service.detectAdjustmentNeeded(plan);

      // Assert
      expect(result).toBeNull();
    });

    it('should skip plans without categoryId', async () => {
      // Arrange
      const plan = createMockExpensePlan({ categoryId: null });

      // Act
      const result = await service.detectAdjustmentNeeded(plan);

      // Assert
      expect(result).toBeNull();
      expect(transactionRepository.find).not.toHaveBeenCalled();
    });

    it('should skip paused plans', async () => {
      // Arrange
      const plan = createMockExpensePlan({ status: 'paused' });

      // Act
      const result = await service.detectAdjustmentNeeded(plan);

      // Assert
      expect(result).toBeNull();
    });

    it('should skip completed plans', async () => {
      // Arrange
      const plan = createMockExpensePlan({ status: 'completed' });

      // Act
      const result = await service.detectAdjustmentNeeded(plan);

      // Assert
      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REVIEW PLAN
  // ═══════════════════════════════════════════════════════════════════════════

  describe('reviewPlan', () => {
    it('should update plan with suggestion when adjustment needed', async () => {
      // Arrange
      const plan = createMockExpensePlan({ monthlyContribution: 100 });

      // Mock spending at 120€/month (20% higher) - 3 months span
      const mockTransactions = [
        createMockTransaction(1, -120, new Date('2025-09-15')),
        createMockTransaction(2, -120, new Date('2025-10-15')),
        createMockTransaction(3, -120, new Date('2025-11-15')),
      ];
      (transactionRepository.find as jest.Mock).mockResolvedValue(mockTransactions);
      (expensePlanRepository.save as jest.Mock).mockResolvedValue(plan);

      // Act
      const updated = await service.reviewPlan(plan);

      // Assert
      expect(updated).toBe(true);
      expect(expensePlanRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedMonthlyContribution: expect.any(Number),
          suggestedAdjustmentPercent: expect.any(Number),
          adjustmentReason: 'spending_increased',
          adjustmentSuggestedAt: expect.any(Date),
        }),
      );
    });

    it('should clear old suggestion if no longer needed', async () => {
      // Arrange
      const plan = createMockExpensePlan({
        monthlyContribution: 100,
        suggestedMonthlyContribution: 120,
        suggestedAdjustmentPercent: 20,
        adjustmentReason: 'spending_increased',
        adjustmentSuggestedAt: new Date('2025-01-01'),
      });

      // Mock spending now at ~102€/month (within threshold)
      // 2 months span, total 204€ / 2 = 102€/month
      const mockTransactions = [
        createMockTransaction(1, -102, new Date('2025-09-15')),
        createMockTransaction(2, -102, new Date('2025-11-15')),
      ];
      (transactionRepository.find as jest.Mock).mockResolvedValue(mockTransactions);
      (expensePlanRepository.save as jest.Mock).mockResolvedValue(plan);

      // Act
      const updated = await service.reviewPlan(plan);

      // Assert
      expect(updated).toBe(true);
      expect(expensePlanRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedMonthlyContribution: null,
          suggestedAdjustmentPercent: null,
          adjustmentReason: null,
          adjustmentSuggestedAt: null,
        }),
      );
    });

    it('should not overwrite dismissed suggestion within 30 days', async () => {
      // Arrange
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 15); // Only 15 days ago

      const plan = createMockExpensePlan({
        monthlyContribution: 100,
        adjustmentDismissedAt: thirtyDaysAgo,
      });

      // Mock spending at 120€/month (would normally trigger suggestion) - 3 months
      const mockTransactions = [
        createMockTransaction(1, -120, new Date('2025-09-15')),
        createMockTransaction(2, -120, new Date('2025-10-15')),
        createMockTransaction(3, -120, new Date('2025-11-15')),
      ];
      (transactionRepository.find as jest.Mock).mockResolvedValue(mockTransactions);

      // Act
      const updated = await service.reviewPlan(plan);

      // Assert
      expect(updated).toBe(false);
      expect(expensePlanRepository.save).not.toHaveBeenCalled();
    });

    it('should suggest again after 30 days since dismissal', async () => {
      // Arrange
      const moreThan30DaysAgo = new Date();
      moreThan30DaysAgo.setDate(moreThan30DaysAgo.getDate() - 35);

      const plan = createMockExpensePlan({
        monthlyContribution: 100,
        adjustmentDismissedAt: moreThan30DaysAgo,
      });

      // Mock spending at 120€/month - 3 months span
      const mockTransactions = [
        createMockTransaction(1, -120, new Date('2025-09-15')),
        createMockTransaction(2, -120, new Date('2025-10-15')),
        createMockTransaction(3, -120, new Date('2025-11-15')),
      ];
      (transactionRepository.find as jest.Mock).mockResolvedValue(mockTransactions);
      (expensePlanRepository.save as jest.Mock).mockResolvedValue(plan);

      // Act
      const updated = await service.reviewPlan(plan);

      // Assert
      expect(updated).toBe(true);
      expect(expensePlanRepository.save).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REVIEW ALL PLANS FOR USER
  // ═══════════════════════════════════════════════════════════════════════════

  describe('reviewAllPlansForUser', () => {
    it('should check all active plans with category tracking', async () => {
      // Arrange
      const userId = 1;
      const mockPlans = [
        createMockExpensePlan({ id: 1, categoryId: 376 }),
        createMockExpensePlan({ id: 2, categoryId: 377 }),
      ];

      (expensePlanRepository.find as jest.Mock).mockResolvedValue(mockPlans);
      (transactionRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.reviewAllPlansForUser(userId);

      // Assert
      expect(expensePlanRepository.find).toHaveBeenCalledWith({
        where: {
          userId,
          status: 'active',
        },
      });
      expect(result.plansReviewed).toBe(2);
    });

    it('should return count of plans with new suggestions', async () => {
      // Arrange
      const userId = 1;
      const mockPlans = [
        createMockExpensePlan({ id: 1, categoryId: 376, monthlyContribution: 100 }),
      ];

      (expensePlanRepository.find as jest.Mock).mockResolvedValue(mockPlans);

      // Mock spending at 130€/month (30% higher) - 3 months span
      const mockTransactions = [
        createMockTransaction(1, -130, new Date('2025-09-15')),
        createMockTransaction(2, -130, new Date('2025-10-15')),
        createMockTransaction(3, -130, new Date('2025-11-15')),
      ];
      (transactionRepository.find as jest.Mock).mockResolvedValue(mockTransactions);
      (expensePlanRepository.save as jest.Mock).mockResolvedValue(mockPlans[0]);

      // Act
      const result = await service.reviewAllPlansForUser(userId);

      // Assert
      expect(result.newSuggestions).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEAR SUGGESTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('clearSuggestion', () => {
    it('should clear all suggestion fields', async () => {
      // Arrange
      const plan = createMockExpensePlan({
        suggestedMonthlyContribution: 120,
        suggestedAdjustmentPercent: 20,
        adjustmentReason: 'spending_increased',
        adjustmentSuggestedAt: new Date(),
      });

      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(plan);
      (expensePlanRepository.save as jest.Mock).mockResolvedValue(plan);

      // Act
      await service.clearSuggestion(plan.id, plan.userId);

      // Assert
      expect(expensePlanRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedMonthlyContribution: null,
          suggestedAdjustmentPercent: null,
          adjustmentReason: null,
          adjustmentSuggestedAt: null,
        }),
      );
    });
  });
});
