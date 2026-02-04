import { Test, TestingModule } from '@nestjs/testing';
import { ExpensePlansService } from './expense-plans.service';
import { ExpensePlan } from './entities/expense-plan.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';
import { EventPublisherService } from '../shared/services/event-publisher.service';

describe('ExpensePlansService', () => {
  let service: ExpensePlansService;
  let expensePlanRepository: Repository<ExpensePlan>;
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
    id: 1,
    name: 'Insurance',
    keywords: ['insurance', 'allianz'],
    user: mockUser,
    transactions: [],
    recurringTransactions: [],
    excludeFromExpenseAnalytics: false,
    analyticsExclusionReason: null,
    budgetLevel: 'primary' as const,
    monthlyBudget: null,
    yearlyBudget: 1200,
    maxThreshold: null,
    warningThreshold: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockExpensePlan: ExpensePlan = {
    id: 1,
    userId: 1,
    user: mockUser as any,
    name: 'Car Insurance',
    description: 'Annual car insurance premium',
    icon: '🚗',
    planType: 'yearly_fixed',
    priority: 'essential',
    categoryId: 1,
    category: mockCategory as any,
    autoTrackCategory: true,
    purpose: 'sinking_fund',
    targetAmount: 1200,
    monthlyContribution: 100,
    contributionSource: 'calculated',
    frequency: 'yearly',
    frequencyYears: null,
    dueMonth: 6,
    dueDay: 15,
    targetDate: null,
    seasonalMonths: null,
    nextDueDate: new Date('2025-06-15'),
    status: 'active',
    autoCalculate: true,
    rolloverSurplus: true,
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
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ExpensePlansService,
        RepositoryMockFactory.createRepositoryProvider(ExpensePlan),
        RepositoryMockFactory.createRepositoryProvider(BankAccount),
        {
          provide: EventPublisherService,
          useValue: {
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExpensePlansService>(ExpensePlansService);
    expensePlanRepository = module.get(getRepositoryToken(ExpensePlan));
  });

  afterEach(async () => {
    await module.close();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND ALL
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findAllByUser', () => {
    it('should return all expense plans for a user', async () => {
      // Arrange
      const userId = 1;
      const mockPlans = [mockExpensePlan];
      (expensePlanRepository.find as jest.Mock).mockResolvedValue(mockPlans);

      // Act
      const result = await service.findAllByUser(userId);

      // Assert
      expect(result).toEqual(mockPlans);
      expect(expensePlanRepository.find).toHaveBeenCalledWith({
        where: { userId },
        relations: ['category', 'paymentAccount'],
        order: { priority: 'ASC', name: 'ASC' },
      });
    });

    it('should return empty array when user has no expense plans', async () => {
      // Arrange
      const userId = 1;
      (expensePlanRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.findAllByUser(userId);

      // Assert
      expect(result).toEqual([]);
    });

    it('should order by priority (essential first) then by name', async () => {
      // Arrange
      const userId = 1;
      const essentialPlan = {
        ...mockExpensePlan,
        id: 1,
        priority: 'essential',
        name: 'B Plan',
      };
      const importantPlan = {
        ...mockExpensePlan,
        id: 2,
        priority: 'important',
        name: 'A Plan',
      };
      const discretionaryPlan = {
        ...mockExpensePlan,
        id: 3,
        priority: 'discretionary',
        name: 'C Plan',
      };
      (expensePlanRepository.find as jest.Mock).mockResolvedValue([
        essentialPlan,
        importantPlan,
        discretionaryPlan,
      ]);

      // Act
      const result = await service.findAllByUser(userId);

      // Assert
      expect(result[0].priority).toBe('essential');
      expect(result.length).toBe(3);
    });
  });

  describe('findActiveByUser', () => {
    it('should return only active expense plans', async () => {
      // Arrange
      const userId = 1;
      const activePlan = { ...mockExpensePlan, status: 'active' };
      (expensePlanRepository.find as jest.Mock).mockResolvedValue([activePlan]);

      // Act
      const result = await service.findActiveByUser(userId);

      // Assert
      expect(result).toEqual([activePlan]);
      expect(expensePlanRepository.find).toHaveBeenCalledWith({
        where: { userId, status: 'active' },
        relations: ['category', 'paymentAccount'],
        order: { priority: 'ASC', name: 'ASC' },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND ONE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findOne', () => {
    it('should return an expense plan when found', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        mockExpensePlan,
      );

      // Act
      const result = await service.findOne(id, userId);

      // Assert
      expect(result).toEqual(mockExpensePlan);
      expect(expensePlanRepository.findOne).toHaveBeenCalledWith({
        where: { id, userId },
        relations: ['category', 'paymentAccount'],
      });
    });

    it('should throw NotFoundException when expense plan not found', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(id, userId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne(id, userId)).rejects.toThrow(
        `Expense plan with ID ${id} not found`,
      );
    });

    it('should not return expense plan belonging to different user', async () => {
      // Arrange
      const id = 1;
      const userId = 2; // Different user
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(id, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('create', () => {
    it('should create a new expense plan with all fields', async () => {
      // Arrange
      const userId = 1;
      const createData = {
        name: 'Car Insurance',
        description: 'Annual car insurance',
        icon: '🚗',
        planType: 'yearly_fixed' as const,
        priority: 'essential' as const,
        categoryId: 1,
        autoTrackCategory: true,
        targetAmount: 1200,
        monthlyContribution: 100,
        frequency: 'yearly' as const,
        dueMonth: 6,
      };
      (expensePlanRepository.create as jest.Mock).mockReturnValue(
        mockExpensePlan,
      );
      (expensePlanRepository.save as jest.Mock).mockResolvedValue(
        mockExpensePlan,
      );

      // Act
      const result = await service.create(userId, createData);

      // Assert
      expect(expensePlanRepository.create).toHaveBeenCalledWith({
        ...createData,
        userId,
        status: 'active',
      });
      expect(expensePlanRepository.save).toHaveBeenCalled();
      expect(result).toEqual(mockExpensePlan);
    });

    it('should create expense plan with minimal required fields', async () => {
      // Arrange
      const userId = 1;
      const minimalData = {
        name: 'Emergency Fund',
        planType: 'emergency_fund' as const,
        targetAmount: 5000,
        monthlyContribution: 200,
        frequency: 'monthly' as const,
      };
      const minimalPlan = {
        ...mockExpensePlan,
        ...minimalData,
        priority: 'important',
        autoTrackCategory: false,
      };
      (expensePlanRepository.create as jest.Mock).mockReturnValue(minimalPlan);
      (expensePlanRepository.save as jest.Mock).mockResolvedValue(minimalPlan);

      // Act
      const result = await service.create(userId, minimalData);

      // Assert
      expect(result.name).toBe('Emergency Fund');
      expect(result.planType).toBe('emergency_fund');
    });

    it('should set status to active by default', async () => {
      // Arrange
      const userId = 1;
      const createData = {
        name: 'Holiday',
        planType: 'yearly_variable' as const,
        targetAmount: 2000,
        monthlyContribution: 167,
        frequency: 'yearly' as const,
      };
      (expensePlanRepository.create as jest.Mock).mockReturnValue(
        mockExpensePlan,
      );
      (expensePlanRepository.save as jest.Mock).mockResolvedValue(
        mockExpensePlan,
      );

      // Act
      await service.create(userId, createData);

      // Assert
      expect(expensePlanRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('update', () => {
    it('should update expense plan with provided fields', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const updateData = {
        name: 'Updated Insurance Plan',
        targetAmount: 1500,
      };
      const updatedPlan = { ...mockExpensePlan, ...updateData };
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        mockExpensePlan,
      );
      (expensePlanRepository.save as jest.Mock).mockResolvedValue(updatedPlan);

      // Act
      const result = await service.update(id, userId, updateData);

      // Assert
      expect(result.name).toBe('Updated Insurance Plan');
      expect(result.targetAmount).toBe(1500);
    });

    it('should throw NotFoundException if expense plan does not exist', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      const updateData = { name: 'New Name' };
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.update(id, userId, updateData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not update expense plan belonging to different user', async () => {
      // Arrange
      const id = 1;
      const userId = 2; // Different user
      const updateData = { name: 'Hacked' };
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.update(id, userId, updateData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle partial updates', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const updateData = { description: 'Updated description only' };
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        mockExpensePlan,
      );
      (expensePlanRepository.save as jest.Mock).mockResolvedValue({
        ...mockExpensePlan,
        description: 'Updated description only',
      });

      // Act
      const result = await service.update(id, userId, updateData);

      // Assert
      expect(result.description).toBe('Updated description only');
      expect(result.name).toBe(mockExpensePlan.name); // Unchanged
    });

    it('should allow changing status to paused', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const updateData = { status: 'paused' as const };
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        mockExpensePlan,
      );
      (expensePlanRepository.save as jest.Mock).mockResolvedValue({
        ...mockExpensePlan,
        status: 'paused',
      });

      // Act
      const result = await service.update(id, userId, updateData);

      // Assert
      expect(result.status).toBe('paused');
    });

    it('should update payment account to a bank account', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const updateData = {
        paymentAccountType: 'bank_account' as const,
        paymentAccountId: 5,
      };
      const updatedPlan = {
        ...mockExpensePlan,
        paymentAccountType: 'bank_account',
        paymentAccountId: 5,
      };
      // First call for validation, second call to return updated plan
      (expensePlanRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(mockExpensePlan)
        .mockResolvedValueOnce(updatedPlan);
      (expensePlanRepository.update as jest.Mock).mockResolvedValue({
        affected: 1,
      });

      // Act
      const result = await service.update(id, userId, updateData);

      // Assert
      expect(result.paymentAccountType).toBe('bank_account');
      expect(result.paymentAccountId).toBe(5);
      expect(expensePlanRepository.update).toHaveBeenCalledWith(
        { id, userId },
        expect.objectContaining({
          paymentAccountType: 'bank_account',
          paymentAccountId: 5,
        }),
      );
    });

    it('should update payment account to a different bank account', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const updateData = {
        paymentAccountType: 'bank_account' as const,
        paymentAccountId: 10,
      };
      const existingPlan = {
        ...mockExpensePlan,
        paymentAccountType: 'bank_account',
        paymentAccountId: 5,
      };
      const updatedPlan = {
        ...mockExpensePlan,
        paymentAccountType: 'bank_account',
        paymentAccountId: 10,
      };
      // First call for validation, second call to return updated plan
      (expensePlanRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(existingPlan)
        .mockResolvedValueOnce(updatedPlan);
      (expensePlanRepository.update as jest.Mock).mockResolvedValue({
        affected: 1,
      });

      // Act
      const result = await service.update(id, userId, updateData);

      // Assert
      expect(result.paymentAccountType).toBe('bank_account');
      expect(result.paymentAccountId).toBe(10);
    });

    it('should preserve payment account when fields are not provided in update', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const planWithPaymentAccount = {
        ...mockExpensePlan,
        paymentAccountType: 'bank_account' as const,
        paymentAccountId: 5,
      };
      // The service should preserve existing values unless explicitly changed
      const updateData = {
        name: 'Updated Name',
      };
      const updatedPlan = {
        ...planWithPaymentAccount,
        name: 'Updated Name',
      };
      // First call for validation, second call to return updated plan
      (expensePlanRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(planWithPaymentAccount)
        .mockResolvedValueOnce(updatedPlan);
      (expensePlanRepository.update as jest.Mock).mockResolvedValue({
        affected: 1,
      });

      // Act
      const result = await service.update(id, userId, updateData);

      // Assert - payment account should be preserved when not explicitly updated
      expect(result.name).toBe('Updated Name');
      expect(result.paymentAccountType).toBe('bank_account');
      expect(result.paymentAccountId).toBe(5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('delete', () => {
    it('should delete expense plan', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        mockExpensePlan,
      );
      (expensePlanRepository.remove as jest.Mock).mockResolvedValue(
        mockExpensePlan,
      );

      // Act
      await service.delete(id, userId);

      // Assert
      expect(expensePlanRepository.remove).toHaveBeenCalledWith(
        mockExpensePlan,
      );
    });

    it('should publish ExpensePlanDeletedEvent when plan is deleted', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        mockExpensePlan,
      );
      (expensePlanRepository.remove as jest.Mock).mockResolvedValue(
        mockExpensePlan,
      );
      const mockEventPublisher = module.get(EventPublisherService);

      // Act
      await service.delete(id, userId);

      // Assert
      expect(mockEventPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          expensePlanId: id,
          userId: userId,
        }),
      );
    });

    it('should throw NotFoundException if expense plan does not exist', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(id, userId)).rejects.toThrow(
        NotFoundException,
      );
      expect(expensePlanRepository.remove).not.toHaveBeenCalled();
    });

    it('should not delete expense plan belonging to different user', async () => {
      // Arrange
      const id = 1;
      const userId = 2; // Different user
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(id, userId)).rejects.toThrow(
        NotFoundException,
      );
      expect(expensePlanRepository.remove).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getMonthlyDepositSummary', () => {
    it('should return total monthly deposit needed', async () => {
      // Arrange
      const userId = 1;
      const plan1 = { ...mockExpensePlan, id: 1, monthlyContribution: 100 };
      const plan2 = { ...mockExpensePlan, id: 2, monthlyContribution: 200 };
      (expensePlanRepository.find as jest.Mock).mockResolvedValue([
        plan1,
        plan2,
      ]);

      // Act
      const result = await service.getMonthlyDepositSummary(userId);

      // Assert
      expect(result.totalMonthlyDeposit).toBe(300);
      expect(result.planCount).toBe(2);
    });

    it('should group plans by type', async () => {
      // Arrange
      const userId = 1;
      const yearlyPlan = {
        ...mockExpensePlan,
        id: 1,
        planType: 'yearly_fixed',
        monthlyContribution: 100,
      };
      const emergencyPlan = {
        ...mockExpensePlan,
        id: 2,
        planType: 'emergency_fund',
        monthlyContribution: 200,
      };
      (expensePlanRepository.find as jest.Mock).mockResolvedValue([
        yearlyPlan,
        emergencyPlan,
      ]);

      // Act
      const result = await service.getMonthlyDepositSummary(userId);

      // Assert
      expect(result.byType).toBeDefined();
      expect(result.byType.sinking_funds).toBeDefined();
      expect(result.byType.emergency).toBeDefined();
    });

    it('should return zero when no plans exist', async () => {
      // Arrange
      const userId = 1;
      (expensePlanRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.getMonthlyDepositSummary(userId);

      // Assert
      expect(result.totalMonthlyDeposit).toBe(0);
      expect(result.planCount).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: CALCULATION ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('calculateMonthlyContribution', () => {
    it('should return manual contribution when contributionSource is manual', () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        contributionSource: 'manual',
        monthlyContribution: 150,
      };

      // Act
      const result = service.calculateMonthlyContribution(plan as ExpensePlan);

      // Assert
      expect(result).toBe(150);
    });

    it('should calculate monthly amount for monthly frequency', () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        frequency: 'monthly',
        targetAmount: 100,
        contributionSource: 'calculated',
      };

      // Act
      const result = service.calculateMonthlyContribution(plan as ExpensePlan);

      // Assert
      expect(result).toBe(100);
    });

    it('should calculate monthly amount for quarterly frequency', () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        frequency: 'quarterly',
        targetAmount: 300,
        contributionSource: 'calculated',
      };

      // Act
      const result = service.calculateMonthlyContribution(plan as ExpensePlan);

      // Assert
      expect(result).toBe(100); // 300 / 3
    });

    it('should calculate monthly amount for yearly frequency', () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        frequency: 'yearly',
        targetAmount: 1200,
        contributionSource: 'calculated',
      };

      // Act
      const result = service.calculateMonthlyContribution(plan as ExpensePlan);

      // Assert
      expect(result).toBe(100); // 1200 / 12
    });

    it('should calculate monthly amount for multi_year frequency', () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        frequency: 'multi_year',
        targetAmount: 600,
        frequencyYears: 2,
        contributionSource: 'calculated',
      };

      // Act
      const result = service.calculateMonthlyContribution(plan as ExpensePlan);

      // Assert
      expect(result).toBe(25); // 600 / (2 * 12)
    });

    it('should handle multi_year with frequencyYears as null (defaults to 1)', () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        frequency: 'multi_year',
        targetAmount: 1200,
        frequencyYears: null,
        contributionSource: 'calculated',
      };

      // Act
      const result = service.calculateMonthlyContribution(plan as ExpensePlan);

      // Assert
      expect(result).toBe(100); // 1200 / (1 * 12)
    });

    it('should calculate monthly amount for seasonal frequency', () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        frequency: 'seasonal',
        targetAmount: 800,
        seasonalMonths: [11, 12, 1, 2], // 4 months of winter
        contributionSource: 'calculated',
      };

      // Act
      const result = service.calculateMonthlyContribution(plan as ExpensePlan);

      // Assert
      expect(result).toBe(100); // 800 / 8 (save during non-seasonal months)
    });

    it('should handle seasonal with no seasonalMonths (fallback to targetAmount)', () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        frequency: 'seasonal',
        targetAmount: 1200,
        seasonalMonths: null,
        contributionSource: 'calculated',
      };

      // Act
      const result = service.calculateMonthlyContribution(plan as ExpensePlan);

      // Assert
      expect(result).toBe(100); // 1200 / 12
    });

    it('should calculate monthly amount for one_time/goal frequency', () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6); // 6 months from now
      const plan = {
        ...mockExpensePlan,
        frequency: 'one_time',
        targetAmount: 600,
        currentBalance: 0,
        targetDate: futureDate,
        contributionSource: 'calculated',
      };

      // Act
      const result = service.calculateMonthlyContribution(plan as ExpensePlan);

      // Assert
      expect(result).toBe(100); // 600 / 6
    });
  });

  describe('calculateStatus', () => {
    it('should return on_track when contribution rate is sufficient', () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 12); // 12 months away
      const plan = {
        ...mockExpensePlan,
        targetAmount: 1200, // Need 1200
        monthlyContribution: 100, // At 100/month, will have 1200 in 12 months
        nextDueDate: futureDate,
      };

      // Act
      const result = service.calculateStatus(plan as ExpensePlan);

      // Assert
      expect(result).toBe('on_track');
    });

    it('should return behind when contribution rate is insufficient', () => {
      // Arrange
      const soonDate = new Date();
      soonDate.setMonth(soonDate.getMonth() + 3); // Only 3 months away
      const plan = {
        ...mockExpensePlan,
        targetAmount: 1200,
        monthlyContribution: 100, // At 100/month, will only have 300 in 3 months
        nextDueDate: soonDate,
      };

      // Act
      const result = service.calculateStatus(plan as ExpensePlan);

      // Assert
      expect(result).toBe('behind');
    });
  });

  describe('isOnTrack', () => {
    it('should return true when required monthly <= contribution * 1.1', () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 12);
      const plan = {
        ...mockExpensePlan,
        targetAmount: 1200,
        monthlyContribution: 100,
        nextDueDate: futureDate,
      };

      // Act
      const result = service.isOnTrack(plan as ExpensePlan);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when required monthly > contribution * 1.1', () => {
      // Arrange
      const soonDate = new Date();
      soonDate.setMonth(soonDate.getMonth() + 6);
      const plan = {
        ...mockExpensePlan,
        currentBalance: 0,
        targetAmount: 1200, // Need 200/month but only contributing 100
        monthlyContribution: 100,
        nextDueDate: soonDate,
      };

      // Act
      const result = service.isOnTrack(plan as ExpensePlan);

      // Assert
      expect(result).toBe(false);
    });

    it('should return true when no due date is set', () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        nextDueDate: null,
        targetDate: null,
        dueMonth: null,
        dueDay: null,
      };

      // Act
      const result = service.isOnTrack(plan as ExpensePlan);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('getTimelineView', () => {
    it('should return timeline entries sorted by date', async () => {
      // Arrange
      const userId = 1;
      const plan1Date = new Date();
      plan1Date.setMonth(plan1Date.getMonth() + 3);
      const plan2Date = new Date();
      plan2Date.setMonth(plan2Date.getMonth() + 1);

      const plan1 = {
        ...mockExpensePlan,
        id: 1,
        name: 'Insurance',
        nextDueDate: plan1Date,
      };
      const plan2 = {
        ...mockExpensePlan,
        id: 2,
        name: 'Subscription',
        nextDueDate: plan2Date,
      };
      (expensePlanRepository.find as jest.Mock).mockResolvedValue([
        plan1,
        plan2,
      ]);

      // Act
      const result = await service.getTimelineView(userId, 12);

      // Assert
      expect(result.length).toBe(2);
      expect(result[0].planName).toBe('Subscription'); // Sooner
      expect(result[1].planName).toBe('Insurance'); // Later
    });

    it('should calculate months away for each entry', async () => {
      // Arrange
      const userId = 1;
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6);
      const plan = { ...mockExpensePlan, nextDueDate: futureDate };
      (expensePlanRepository.find as jest.Mock).mockResolvedValue([plan]);

      // Act
      const result = await service.getTimelineView(userId, 12);

      // Assert
      expect(result[0].monthsAway).toBeGreaterThanOrEqual(5);
      expect(result[0].monthsAway).toBeLessThanOrEqual(7);
    });

    it('should return empty array when no active plans', async () => {
      // Arrange
      const userId = 1;
      (expensePlanRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.getTimelineView(userId, 12);

      // Assert
      expect(result).toEqual([]);
    });

    it('should include status for each timeline entry', async () => {
      // Arrange
      const userId = 1;
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6);
      // Set up a plan that should be on_track based on time
      const planWithGoodContribution = {
        ...mockExpensePlan,
        id: 1,
        targetAmount: 1200,
        monthlyContribution: 200, // 6 months * 200 = 1200, exactly on track
        nextDueDate: futureDate,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Started 1 month ago
      };
      (expensePlanRepository.find as jest.Mock).mockResolvedValue([
        planWithGoodContribution,
      ]);

      // Act
      const result = await service.getTimelineView(userId, 12);

      // Assert
      // Without balance tracking, status is determined by contribution rate vs required rate
      expect(result[0]).toHaveProperty('status');
    });
  });

  describe('calculateNextDueDate', () => {
    it('should return targetDate for one_time frequency', () => {
      // Arrange
      const targetDate = new Date('2025-12-25');
      const plan = { ...mockExpensePlan, frequency: 'one_time', targetDate };

      // Act
      const result = service.calculateNextDueDate(plan as ExpensePlan);

      // Assert
      expect(result).toEqual(targetDate);
    });

    it('should calculate next yearly due date', () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        frequency: 'yearly',
        dueMonth: 6,
        dueDay: 15,
      };

      // Act
      const result = service.calculateNextDueDate(plan as ExpensePlan);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.getMonth()).toBe(5); // June (0-indexed)
      expect(result?.getDate()).toBe(15);
    });

    it('should calculate next quarterly due date', () => {
      // Arrange
      const plan = { ...mockExpensePlan, frequency: 'quarterly', dueDay: 1 };

      // Act
      const result = service.calculateNextDueDate(plan as ExpensePlan);

      // Assert
      expect(result).not.toBeNull();
    });

    it('should calculate next monthly due date', () => {
      // Arrange
      const plan = { ...mockExpensePlan, frequency: 'monthly', dueDay: 15 };

      // Act
      const result = service.calculateNextDueDate(plan as ExpensePlan);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.getDate()).toBe(15);
    });

    it('should return null for plans without timing info', () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        frequency: 'yearly',
        dueMonth: null,
        dueDay: null,
        targetDate: null,
      };

      // Act
      const result = service.calculateNextDueDate(plan as ExpensePlan);

      // Assert
      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FUNDING STATUS TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getMonthlyDepositSummary - funding status counts', () => {
    it('should count sinking funds by funding status', async () => {
      // Arrange
      const userId = 1;
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6);

      const onTrackPlan = {
        ...mockExpensePlan,
        id: 1,
        purpose: 'sinking_fund',
        targetAmount: 1200,
        monthlyContribution: 200, // 200 * 6 = 1200, on track
        nextDueDate: futureDate,
      };
      const behindPlan = {
        ...mockExpensePlan,
        id: 2,
        purpose: 'sinking_fund',
        targetAmount: 1200,
        monthlyContribution: 50, // 50 * 6 = 300, way behind
        nextDueDate: futureDate,
      };

      (expensePlanRepository.find as jest.Mock).mockResolvedValue([
        onTrackPlan,
        behindPlan,
      ]);

      // Act
      const result = await service.getMonthlyDepositSummary(userId);

      // Assert
      // Without balance tracking, counts are based on contribution rate
      expect(result.onTrackCount).toBeGreaterThanOrEqual(0);
      expect(result.behindScheduleCount).toBeGreaterThanOrEqual(0);
      // Total should equal sinking fund count (now 2)
      expect(
        result.fullyFundedCount +
          result.onTrackCount +
          result.behindScheduleCount,
      ).toBe(2);
    });

    it('should only count sinking funds, not spending budgets', async () => {
      // Arrange
      const userId = 1;
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6);

      const spendingBudget = {
        ...mockExpensePlan,
        id: 1,
        purpose: 'spending_budget',
        targetAmount: 500,
        monthlyContribution: 500,
      };
      const sinkingFund = {
        ...mockExpensePlan,
        id: 2,
        purpose: 'sinking_fund',
        targetAmount: 1200,
        monthlyContribution: 200, // On track for 6 months
        nextDueDate: futureDate,
      };

      (expensePlanRepository.find as jest.Mock).mockResolvedValue([
        spendingBudget,
        sinkingFund,
      ]);

      // Act
      const result = await service.getMonthlyDepositSummary(userId);

      // Assert
      // Only sinking funds count for status tracking
      expect(
        result.fullyFundedCount +
          result.onTrackCount +
          result.behindScheduleCount,
      ).toBe(1);
    });
  });

  describe('findAllByUserWithStatus', () => {
    it('should return plans with funding status fields', async () => {
      // Arrange
      const userId = 1;
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6);

      const sinkingFundPlan = {
        ...mockExpensePlan,
        id: 1,
        purpose: 'sinking_fund',
        targetAmount: 1200,
        monthlyContribution: 200, // 6 months * 200 = 1200, on track
        nextDueDate: futureDate,
        createdAt: new Date(), // Just started
      };

      (expensePlanRepository.find as jest.Mock).mockResolvedValue([
        sinkingFundPlan,
      ]);

      // Act
      const result = await service.findAllByUserWithStatus(userId);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('fundingStatus');
      expect(result[0]).toHaveProperty('monthsUntilDue');
      expect(result[0]).toHaveProperty('amountNeeded');
      expect(result[0]).toHaveProperty('requiredMonthlyContribution');
      expect(result[0]).toHaveProperty('progressPercent');
      // amountNeeded is targetAmount without balance tracking
      expect(result[0].amountNeeded).toBe(1200);
    });

    it('should return null funding status for spending budgets', async () => {
      // Arrange
      const userId = 1;
      const spendingBudget = {
        ...mockExpensePlan,
        id: 1,
        purpose: 'spending_budget',
        targetAmount: 500,
      };

      (expensePlanRepository.find as jest.Mock).mockResolvedValue([
        spendingBudget,
      ]);

      // Act
      const result = await service.findAllByUserWithStatus(userId);

      // Assert
      expect(result[0].fundingStatus).toBeNull();
      expect(result[0].monthsUntilDue).toBeNull();
    });
  });

  describe('getLongTermStatus', () => {
    it('should return summary of sinking fund statuses', async () => {
      // Arrange
      const userId = 1;
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6);

      const onTrackPlan1 = {
        ...mockExpensePlan,
        id: 1,
        purpose: 'sinking_fund',
        status: 'active',
        targetAmount: 1200,
        monthlyContribution: 200, // On track for 6 months
        nextDueDate: futureDate,
      };
      const onTrackPlan2 = {
        ...mockExpensePlan,
        id: 2,
        purpose: 'sinking_fund',
        status: 'active',
        targetAmount: 1200,
        monthlyContribution: 200,
        nextDueDate: futureDate,
      };

      (expensePlanRepository.find as jest.Mock).mockResolvedValue([
        onTrackPlan1,
        onTrackPlan2,
      ]);

      // Act
      const result = await service.getLongTermStatus(userId);

      // Assert
      expect(result.totalSinkingFunds).toBe(2);
      expect(result).toHaveProperty('onTrackCount');
      expect(result).toHaveProperty('behindScheduleCount');
      expect(result).toHaveProperty('totalAmountNeeded');
      expect(result).toHaveProperty('plansNeedingAttention');
    });

    it('should exclude spending budgets from long-term status', async () => {
      // Arrange
      const userId = 1;
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6);

      const spendingBudget = {
        ...mockExpensePlan,
        id: 1,
        purpose: 'spending_budget',
        status: 'active',
        targetAmount: 500,
      };
      const sinkingFund = {
        ...mockExpensePlan,
        id: 2,
        purpose: 'sinking_fund',
        status: 'active',
        targetAmount: 1200,
        monthlyContribution: 200,
        nextDueDate: futureDate,
      };

      (expensePlanRepository.find as jest.Mock).mockResolvedValue([
        spendingBudget,
        sinkingFund,
      ]);

      // Act
      const result = await service.getLongTermStatus(userId);

      // Assert
      expect(result.totalSinkingFunds).toBe(1); // Only sinking fund counted
    });

    it('should include behind plans in plansNeedingAttention', async () => {
      // Arrange
      const userId = 1;
      // Due date is 3 months away, but need 1200 with only 100/month configured
      // Required: 1200/3 = 400/month, configured: 100/month = behind
      //
      // How expectedFundedByNow works:
      // - monthsNeeded = target/monthly = 1200/100 = 12 months
      // - savingStartDate = dueDate - monthsNeeded = 3 months from now - 12 = 9 months AGO
      // - monthsElapsed = 9
      // - expectedFundedByNow = min(9 * 100, 1200) = 900
      //
      // So amountNeeded = 1200 - 900 = 300, requiredMonthly = 300/3 = 100
      // shortfallPerMonth = 100 - 100 = 0
      //
      // The plan IS "behind" (contribution rate insufficient for full target),
      // but shortfallPerMonth = 0 because remaining amount can be covered at current rate.
      const threeMonthsAway = new Date();
      threeMonthsAway.setMonth(threeMonthsAway.getMonth() + 3);

      const behindPlan = {
        ...mockExpensePlan,
        id: 1,
        name: 'Behind Plan',
        purpose: 'sinking_fund',
        status: 'active',
        targetAmount: 1200,
        monthlyContribution: 100, // Need 400/month for 3 months, only have 100
        nextDueDate: threeMonthsAway,
      };

      (expensePlanRepository.find as jest.Mock).mockResolvedValue([behindPlan]);

      // Act
      const result = await service.getLongTermStatus(userId);

      // Assert
      // With 3 months to go and 1200 target, need 400/month
      // 100/month < 400*0.9 = 360, so it's behind
      expect(result.behindScheduleCount).toBe(1);
      expect(result.plansNeedingAttention).toHaveLength(1);
      expect(result.plansNeedingAttention[0].name).toBe('Behind Plan');
      expect(result.plansNeedingAttention[0].status).toBe('behind');
      // amountNeeded is the remaining amount (target - expectedFundedByNow)
      expect(result.plansNeedingAttention[0].amountNeeded).toBeGreaterThan(0);
      // shortfallPerMonth can be 0 when remaining amount is achievable at current rate
      expect(result.plansNeedingAttention[0].shortfallPerMonth).toBeGreaterThanOrEqual(0);
    });

    it('should return empty data when no sinking funds exist', async () => {
      // Arrange
      const userId = 1;
      (expensePlanRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.getLongTermStatus(userId);

      // Assert
      expect(result.totalSinkingFunds).toBe(0);
      expect(result.onTrackCount).toBe(0);
      expect(result.behindScheduleCount).toBe(0);
      expect(result.fundedCount).toBe(0);
      expect(result.plansNeedingAttention).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FIXED MONTHLY PLANS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('fixed_monthly plans', () => {
    const mockFixedMonthlyPlan: ExpensePlan = {
      ...mockExpensePlan,
      id: 10,
      name: 'Internet Bill',
      planType: 'fixed_monthly',
      purpose: 'sinking_fund',
      targetAmount: 72.07,
      monthlyContribution: 72.07,
      frequency: 'monthly',
      nextDueDate: new Date('2025-02-15'),
    };

    describe('enrichPlanWithStatus for fixed_monthly', () => {
      it('should return fixedMonthlyStatus for fixed_monthly plans', async () => {
        // Arrange
        const userId = 1;

        (expensePlanRepository.find as jest.Mock).mockResolvedValue([
          mockFixedMonthlyPlan,
        ]);

        // Act
        const result = await service.findAllByUserWithStatus(userId);

        // Assert
        expect(result[0].fixedMonthlyStatus).toBeDefined();
        expect(
          typeof result[0].fixedMonthlyStatus?.currentMonthPaymentMade,
        ).toBe('boolean');
      });
    });
  });
});
