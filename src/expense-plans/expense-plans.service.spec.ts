import { Test, TestingModule } from '@nestjs/testing';
import { ExpensePlansService } from './expense-plans.service';
import { ExpensePlan } from './entities/expense-plan.entity';
import { ExpensePlanTransaction } from './entities/expense-plan-transaction.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';
import { EventPublisherService } from '../shared/services/event-publisher.service';

describe('ExpensePlansService', () => {
  let service: ExpensePlansService;
  let expensePlanRepository: Repository<ExpensePlan>;
  let expensePlanTransactionRepository: Repository<ExpensePlanTransaction>;
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
    targetAmount: 1200,
    currentBalance: 300,
    monthlyContribution: 100,
    contributionSource: 'calculated',
    frequency: 'yearly',
    frequencyYears: null,
    dueMonth: 6,
    dueDay: 15,
    targetDate: null,
    seasonalMonths: null,
    lastFundedDate: new Date('2024-11-01'),
    nextDueDate: new Date('2025-06-15'),
    status: 'active',
    autoCalculate: true,
    rolloverSurplus: true,
    initialBalanceSource: 'zero',
    initialBalanceCustom: null,
    paymentAccountType: null,
    paymentAccountId: null,
    paymentAccount: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    transactions: [],
  };

  const mockExpensePlanTransaction: ExpensePlanTransaction = {
    id: 1,
    expensePlanId: 1,
    expensePlan: mockExpensePlan,
    type: 'contribution',
    amount: 100,
    date: new Date('2024-12-01'),
    balanceAfter: 400,
    transactionId: null,
    transaction: null,
    note: 'Monthly contribution',
    isAutomatic: false,
    createdAt: new Date('2024-12-01'),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ExpensePlansService,
        RepositoryMockFactory.createRepositoryProvider(ExpensePlan),
        RepositoryMockFactory.createRepositoryProvider(ExpensePlanTransaction),
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
    expensePlanTransactionRepository = module.get(
      getRepositoryToken(ExpensePlanTransaction),
    );
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
        currentBalance: 0,
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

    it('should set currentBalance to 0 by default', async () => {
      // Arrange
      const userId = 1;
      const createData = {
        name: 'Vacation',
        planType: 'goal' as const,
        targetAmount: 3000,
        monthlyContribution: 250,
        frequency: 'one_time' as const,
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
        expect.objectContaining({ currentBalance: 0 }),
      );
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
  // CONTRIBUTE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('contribute', () => {
    it('should add contribution to expense plan', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const amount = 100;
      const note = 'Monthly contribution';
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        mockExpensePlan,
      );
      (expensePlanTransactionRepository.save as jest.Mock).mockResolvedValue(
        mockExpensePlanTransaction,
      );
      (expensePlanRepository.save as jest.Mock).mockResolvedValue({
        ...mockExpensePlan,
        currentBalance: 400,
      });

      // Act
      const result = await service.contribute(id, userId, amount, note);

      // Assert
      expect(result.type).toBe('contribution');
      expect(result.amount).toBe(100);
      expect(expensePlanRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ currentBalance: 400 }),
      );
    });

    it('should throw NotFoundException if expense plan does not exist', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.contribute(id, userId, 100)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update lastFundedDate on contribution', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const amount = 100;
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        mockExpensePlan,
      );
      (expensePlanTransactionRepository.save as jest.Mock).mockResolvedValue(
        mockExpensePlanTransaction,
      );
      (expensePlanRepository.save as jest.Mock).mockResolvedValue(
        mockExpensePlan,
      );

      // Act
      await service.contribute(id, userId, amount);

      // Assert
      expect(expensePlanRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          lastFundedDate: expect.any(Date),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WITHDRAW
  // ═══════════════════════════════════════════════════════════════════════════

  describe('withdraw', () => {
    it('should withdraw from expense plan', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const amount = 50;
      const note = 'Partial payment';
      const planWithBalance = { ...mockExpensePlan, currentBalance: 300 };
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        planWithBalance,
      );
      (expensePlanTransactionRepository.save as jest.Mock).mockResolvedValue({
        ...mockExpensePlanTransaction,
        type: 'withdrawal',
        amount: -50,
        balanceAfter: 250,
      });
      (expensePlanRepository.save as jest.Mock).mockResolvedValue({
        ...planWithBalance,
        currentBalance: 250,
      });

      // Act
      const result = await service.withdraw(id, userId, amount, note);

      // Assert
      expect(result.type).toBe('withdrawal');
      expect(result.amount).toBe(-50);
    });

    it('should throw error if withdrawal exceeds balance', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const amount = 500; // More than currentBalance of 300
      const planWithLowBalance = { ...mockExpensePlan, currentBalance: 300 };
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        planWithLowBalance,
      );

      // Act & Assert
      await expect(service.withdraw(id, userId, amount)).rejects.toThrow(
        'Insufficient balance',
      );
    });

    it('should allow full withdrawal of available balance', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const planWithBalance = { ...mockExpensePlan, currentBalance: 300 };
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        planWithBalance,
      );
      (expensePlanTransactionRepository.save as jest.Mock).mockResolvedValue({
        ...mockExpensePlanTransaction,
        type: 'withdrawal',
        amount: -300,
        balanceAfter: 0,
      });
      (expensePlanRepository.save as jest.Mock).mockResolvedValue({
        ...planWithBalance,
        currentBalance: 0,
      });

      // Act
      const result = await service.withdraw(id, userId, 300);

      // Assert
      expect(result.balanceAfter).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET TRANSACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getTransactions', () => {
    it('should return all transactions for an expense plan', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        mockExpensePlan,
      );
      (expensePlanTransactionRepository.find as jest.Mock).mockResolvedValue([
        mockExpensePlanTransaction,
      ]);

      // Act
      const result = await service.getTransactions(id, userId);

      // Assert
      expect(result).toEqual([mockExpensePlanTransaction]);
      expect(expensePlanTransactionRepository.find).toHaveBeenCalledWith({
        where: { expensePlanId: id },
        relations: ['transaction'],
        order: { date: 'DESC', createdAt: 'DESC' },
      });
    });

    it('should throw NotFoundException if expense plan does not exist', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.getTransactions(id, userId)).rejects.toThrow(
        NotFoundException,
      );
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

    it('should account for currentBalance in one_time calculation', () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6);
      const plan = {
        ...mockExpensePlan,
        frequency: 'one_time',
        targetAmount: 600,
        currentBalance: 300, // Already saved 300
        targetDate: futureDate,
        contributionSource: 'calculated',
      };

      // Act
      const result = service.calculateMonthlyContribution(plan as ExpensePlan);

      // Assert
      expect(result).toBe(50); // (600 - 300) / 6
    });

    it('should return 0 if already fully funded for one_time', () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6);
      const plan = {
        ...mockExpensePlan,
        frequency: 'one_time',
        targetAmount: 600,
        currentBalance: 600, // Fully funded
        targetDate: futureDate,
        contributionSource: 'calculated',
      };

      // Act
      const result = service.calculateMonthlyContribution(plan as ExpensePlan);

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('calculateStatus', () => {
    it('should return funded when currentBalance >= targetAmount', () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        currentBalance: 1200,
        targetAmount: 1200,
      };

      // Act
      const result = service.calculateStatus(plan as ExpensePlan);

      // Assert
      expect(result).toBe('funded');
    });

    it('should return almost_ready when progress >= 80%', () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        currentBalance: 1000,
        targetAmount: 1200,
      };

      // Act
      const result = service.calculateStatus(plan as ExpensePlan);

      // Assert
      expect(result).toBe('almost_ready');
    });

    it('should return on_track when plan is progressing on schedule', () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 12); // 12 months away
      const plan = {
        ...mockExpensePlan,
        currentBalance: 100, // 100 saved
        targetAmount: 1200, // Need 1200
        monthlyContribution: 100, // At 100/month, will have 1200 in 12 months
        nextDueDate: futureDate,
      };

      // Act
      const result = service.calculateStatus(plan as ExpensePlan);

      // Assert
      expect(result).toBe('on_track');
    });

    it('should return behind when plan is not progressing on schedule', () => {
      // Arrange
      const soonDate = new Date();
      soonDate.setMonth(soonDate.getMonth() + 3); // Only 3 months away
      const plan = {
        ...mockExpensePlan,
        currentBalance: 100,
        targetAmount: 1200,
        monthlyContribution: 100, // At 100/month, will only have 400 in 3 months
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
        currentBalance: 0,
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
      const fundedPlan = {
        ...mockExpensePlan,
        id: 1,
        currentBalance: 1200,
        targetAmount: 1200,
        nextDueDate: futureDate,
      };
      (expensePlanRepository.find as jest.Mock).mockResolvedValue([fundedPlan]);

      // Act
      const result = await service.getTimelineView(userId, 12);

      // Assert
      expect(result[0].status).toBe('funded');
    });
  });

  describe('adjustBalance', () => {
    it('should adjust balance to new amount', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const newBalance = 500;
      const note = 'Correction for missed tracking';
      const planWithOldBalance = { ...mockExpensePlan, currentBalance: 300 };
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        planWithOldBalance,
      );
      (expensePlanTransactionRepository.save as jest.Mock).mockResolvedValue({
        ...mockExpensePlanTransaction,
        type: 'adjustment',
        amount: 200, // Difference
        balanceAfter: 500,
      });
      (expensePlanRepository.save as jest.Mock).mockResolvedValue({
        ...planWithOldBalance,
        currentBalance: 500,
      });

      // Act
      const result = await service.adjustBalance(id, userId, newBalance, note);

      // Assert
      expect(result.type).toBe('adjustment');
      expect(result.balanceAfter).toBe(500);
    });

    it('should handle downward adjustment', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const newBalance = 100;
      const planWithHighBalance = { ...mockExpensePlan, currentBalance: 300 };
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        planWithHighBalance,
      );
      (expensePlanTransactionRepository.save as jest.Mock).mockResolvedValue({
        ...mockExpensePlanTransaction,
        type: 'adjustment',
        amount: -200,
        balanceAfter: 100,
      });
      (expensePlanRepository.save as jest.Mock).mockResolvedValue({
        ...planWithHighBalance,
        currentBalance: 100,
      });

      // Act
      const result = await service.adjustBalance(id, userId, newBalance);

      // Assert
      expect(result.amount).toBe(-200);
      expect(result.balanceAfter).toBe(100);
    });

    it('should throw NotFoundException if plan does not exist', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.adjustBalance(id, userId, 500)).rejects.toThrow(
        NotFoundException,
      );
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
  // PHASE 4: MANUAL FUNDING FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  describe('quickFund', () => {
    it('should fund plan to monthly contribution amount', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const plan = { ...mockExpensePlan, monthlyContribution: 100 };
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(plan);
      (expensePlanTransactionRepository.save as jest.Mock).mockResolvedValue({
        ...mockExpensePlanTransaction,
        amount: 100,
        balanceAfter: 400,
      });
      (expensePlanRepository.save as jest.Mock).mockResolvedValue({
        ...plan,
        currentBalance: 400,
      });

      // Act
      const result = await service.quickFund(id, userId);

      // Assert
      expect(result.amount).toBe(100);
      expect(expensePlanTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100,
          note: 'Quick fund - monthly contribution',
        }),
      );
    });

    it('should throw NotFoundException if plan does not exist', async () => {
      // Arrange
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.quickFund(999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('fundToTarget', () => {
    it('should fund plan to reach target amount', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const plan = {
        ...mockExpensePlan,
        currentBalance: 300,
        targetAmount: 1200,
      };
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(plan);
      (expensePlanTransactionRepository.save as jest.Mock).mockResolvedValue({
        ...mockExpensePlanTransaction,
        amount: 900,
        balanceAfter: 1200,
      });
      (expensePlanRepository.save as jest.Mock).mockResolvedValue({
        ...plan,
        currentBalance: 1200,
      });

      // Act
      const result = await service.fundToTarget(id, userId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(900); // 1200 - 300
      expect(result!.balanceAfter).toBe(1200);
    });

    it('should return null if already fully funded', async () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        currentBalance: 1200,
        targetAmount: 1200,
      };
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(plan);

      // Act
      const result = await service.fundToTarget(1, 1);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null if over-funded', async () => {
      // Arrange
      const plan = {
        ...mockExpensePlan,
        currentBalance: 1500,
        targetAmount: 1200,
      };
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(plan);

      // Act
      const result = await service.fundToTarget(1, 1);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('bulkFund', () => {
    it('should fund multiple plans at once', async () => {
      // Arrange
      const userId = 1;
      const fundingItems = [
        { planId: 1, amount: 100 },
        { planId: 2, amount: 200 },
      ];
      const plan1 = { ...mockExpensePlan, id: 1, currentBalance: 100 };
      const plan2 = { ...mockExpensePlan, id: 2, currentBalance: 200 };

      // bulkFund calls findOne for existence check, then contribute calls findOne again
      (expensePlanRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(plan1) // bulkFund existence check for plan1
        .mockResolvedValueOnce(plan1) // contribute's findOne for plan1
        .mockResolvedValueOnce(plan2) // bulkFund existence check for plan2
        .mockResolvedValueOnce(plan2); // contribute's findOne for plan2
      (expensePlanTransactionRepository.save as jest.Mock)
        .mockResolvedValueOnce({
          ...mockExpensePlanTransaction,
          id: 1,
          amount: 100,
        })
        .mockResolvedValueOnce({
          ...mockExpensePlanTransaction,
          id: 2,
          amount: 200,
        });
      (expensePlanRepository.save as jest.Mock)
        .mockResolvedValueOnce({ ...plan1, currentBalance: 200 })
        .mockResolvedValueOnce({ ...plan2, currentBalance: 400 });

      // Act
      const result = await service.bulkFund(userId, fundingItems);

      // Assert
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.totalFunded).toBe(300);
    });

    it('should handle partial failures in bulk funding', async () => {
      // Arrange
      const userId = 1;
      const fundingItems = [
        { planId: 1, amount: 100 },
        { planId: 999, amount: 200 }, // Non-existent plan
      ];
      const plan1 = { ...mockExpensePlan, id: 1, currentBalance: 100 };

      // First plan: existence check + contribute's findOne
      // Second plan: existence check returns null
      (expensePlanRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(plan1) // bulkFund existence check for plan1
        .mockResolvedValueOnce(plan1) // contribute's findOne for plan1
        .mockResolvedValueOnce(null); // bulkFund existence check for plan2 (not found)
      (
        expensePlanTransactionRepository.save as jest.Mock
      ).mockResolvedValueOnce({
        ...mockExpensePlanTransaction,
        amount: 100,
      });
      (expensePlanRepository.save as jest.Mock).mockResolvedValueOnce({
        ...plan1,
        currentBalance: 200,
      });

      // Act
      const result = await service.bulkFund(userId, fundingItems);

      // Assert
      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].planId).toBe(999);
      expect(result.failed[0].reason).toContain('not found');
    });

    it('should return empty results for empty input', async () => {
      // Act
      const result = await service.bulkFund(1, []);

      // Assert
      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
      expect(result.totalFunded).toBe(0);
    });
  });

  describe('bulkQuickFund', () => {
    it('should quick fund all active plans', async () => {
      // Arrange
      const userId = 1;
      const plan1 = { ...mockExpensePlan, id: 1, monthlyContribution: 100 };
      const plan2 = { ...mockExpensePlan, id: 2, monthlyContribution: 200 };

      (expensePlanRepository.find as jest.Mock).mockResolvedValue([
        plan1,
        plan2,
      ]);
      // quickFund calls findOne, then contribute calls findOne again
      (expensePlanRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(plan1) // quickFund's findOne for plan1
        .mockResolvedValueOnce(plan1) // contribute's findOne for plan1
        .mockResolvedValueOnce(plan2) // quickFund's findOne for plan2
        .mockResolvedValueOnce(plan2); // contribute's findOne for plan2
      (expensePlanTransactionRepository.save as jest.Mock)
        .mockResolvedValueOnce({ ...mockExpensePlanTransaction, amount: 100 })
        .mockResolvedValueOnce({ ...mockExpensePlanTransaction, amount: 200 });
      (expensePlanRepository.save as jest.Mock)
        .mockResolvedValueOnce({ ...plan1, currentBalance: 400 })
        .mockResolvedValueOnce({ ...plan2, currentBalance: 500 });

      // Act
      const result = await service.bulkQuickFund(userId);

      // Assert
      expect(result.successful).toHaveLength(2);
      expect(result.totalFunded).toBe(300);
    });

    it('should skip fully funded plans in bulk quick fund', async () => {
      // Arrange
      const userId = 1;
      const fundedPlan = {
        ...mockExpensePlan,
        id: 1,
        currentBalance: 1200,
        targetAmount: 1200,
      };
      const unfundedPlan = {
        ...mockExpensePlan,
        id: 2,
        monthlyContribution: 100,
      };

      (expensePlanRepository.find as jest.Mock).mockResolvedValue([
        fundedPlan,
        unfundedPlan,
      ]);
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(
        unfundedPlan,
      );
      (expensePlanTransactionRepository.save as jest.Mock).mockResolvedValue({
        ...mockExpensePlanTransaction,
        amount: 100,
      });
      (expensePlanRepository.save as jest.Mock).mockResolvedValue({
        ...unfundedPlan,
        currentBalance: 400,
      });

      // Act
      const result = await service.bulkQuickFund(userId);

      // Assert
      expect(result.successful).toHaveLength(1);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].planId).toBe(1);
    });
  });

  describe('linkTransaction', () => {
    it('should link an existing transaction to a plan contribution', async () => {
      // Arrange
      const planTransactionId = 1;
      const transactionId = 100;
      const userId = 1;
      const planTx = { ...mockExpensePlanTransaction, transactionId: null };
      const plan = { ...mockExpensePlan };

      (expensePlanTransactionRepository.findOne as jest.Mock).mockResolvedValue(
        planTx,
      );
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(plan);
      (expensePlanTransactionRepository.save as jest.Mock).mockResolvedValue({
        ...planTx,
        transactionId: 100,
      });

      // Act
      const result = await service.linkTransaction(
        planTransactionId,
        transactionId,
        userId,
      );

      // Assert
      expect(result.transactionId).toBe(100);
    });

    it('should throw NotFoundException if plan transaction not found', async () => {
      // Arrange
      (expensePlanTransactionRepository.findOne as jest.Mock).mockResolvedValue(
        null,
      );

      // Act & Assert
      await expect(service.linkTransaction(999, 100, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw error if plan transaction belongs to different user', async () => {
      // Arrange
      const planTx = { ...mockExpensePlanTransaction, expensePlanId: 1 };
      (expensePlanTransactionRepository.findOne as jest.Mock).mockResolvedValue(
        planTx,
      );
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(null); // Not found for this user

      // Act & Assert
      await expect(service.linkTransaction(1, 100, 2)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('unlinkTransaction', () => {
    it('should unlink a transaction from a plan contribution', async () => {
      // Arrange
      const planTransactionId = 1;
      const userId = 1;
      const planTx = { ...mockExpensePlanTransaction, transactionId: 100 };
      const plan = { ...mockExpensePlan };

      (expensePlanTransactionRepository.findOne as jest.Mock).mockResolvedValue(
        planTx,
      );
      (expensePlanRepository.findOne as jest.Mock).mockResolvedValue(plan);
      (expensePlanTransactionRepository.save as jest.Mock).mockResolvedValue({
        ...planTx,
        transactionId: null,
      });

      // Act
      const result = await service.unlinkTransaction(planTransactionId, userId);

      // Assert
      expect(result.transactionId).toBeNull();
    });
  });
});
