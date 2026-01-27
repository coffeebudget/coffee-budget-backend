import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { IncomeDistributionService } from './income-distribution.service';
import { IncomeDistributionRule } from './entities/income-distribution-rule.entity';
import { ExpensePlan } from './entities/expense-plan.entity';
import { Transaction } from '../transactions/transaction.entity';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';

describe('IncomeDistributionService', () => {
  let service: IncomeDistributionService;
  let ruleRepository: Repository<IncomeDistributionRule>;
  let planRepository: Repository<ExpensePlan>;
  let module: TestingModule;

  const mockUser = {
    id: 1,
    auth0Id: 'auth0|123456',
    email: 'test@example.com',
  };

  const mockRule = {
    id: 1,
    userId: 1,
    user: null,
    name: 'Monthly Salary',
    expectedAmount: 3000,
    amountTolerance: 10,
    descriptionPattern: 'SALARY|PAYROLL',
    categoryId: 5,
    category: null,
    bankAccountId: 1,
    bankAccount: null,
    autoDistribute: true,
    distributionStrategy: 'priority' as const,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as IncomeDistributionRule;

  const mockExpensePlan = {
    id: 1,
    userId: 1,
    user: null,
    name: 'Car Insurance',
    description: 'Annual car insurance',
    icon: '🚗',
    planType: 'yearly_fixed',
    priority: 'essential',
    categoryId: null,
    category: null,
    autoTrackCategory: false,
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
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as ExpensePlan;

  const mockTransaction = {
    id: 1,
    user: { id: 1, auth0Id: 'auth0|123456', email: 'test@example.com' },
    description: 'MONTHLY SALARY PAYMENT',
    amount: 3000,
    type: 'income' as const,
    createdAt: new Date(),
    status: 'executed' as const,
    category: { id: 5, name: 'Salary' },
    suggestedCategory: null,
    suggestedCategoryName: null,
    bankAccount: { id: 1, name: 'Main Account' },
    creditCard: null,
    tags: [],
    executionDate: null,
    billingDate: null,
    source: 'manual',
    categorizationConfidence: null,
    transactionIdOpenBankAPI: null,
    merchantName: null,
    merchantCategoryCode: null,
    debtorName: null,
    creditorName: null,
    enrichedFromPaymentActivityId: null,
    originalMerchantName: null,
    enhancedMerchantName: null,
    enhancedCategoryConfidence: null,
  } as unknown as Transaction;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        IncomeDistributionService,
        RepositoryMockFactory.createRepositoryProvider(IncomeDistributionRule),
        RepositoryMockFactory.createRepositoryProvider(ExpensePlan),
      ],
    }).compile();

    service = module.get<IncomeDistributionService>(IncomeDistributionService);
    ruleRepository = module.get(getRepositoryToken(IncomeDistributionRule));
    planRepository = module.get(getRepositoryToken(ExpensePlan));
  });

  afterEach(async () => {
    await module.close();
  });

  describe('CRUD Operations', () => {
    describe('findAllRules', () => {
      it('should return all active rules for a user', async () => {
        // Arrange
        const rules = [
          mockRule,
          { ...mockRule, id: 2, name: 'Freelance Income' },
        ];
        (ruleRepository.find as jest.Mock).mockResolvedValue(rules);

        // Act
        const result = await service.findAllRules(1);

        // Assert
        expect(result).toEqual(rules);
        expect(ruleRepository.find).toHaveBeenCalledWith({
          where: { userId: 1 },
          relations: ['category', 'bankAccount'],
          order: { createdAt: 'DESC' },
        });
      });
    });

    describe('findOneRule', () => {
      it('should return a rule by id', async () => {
        // Arrange
        (ruleRepository.findOne as jest.Mock).mockResolvedValue(mockRule);

        // Act
        const result = await service.findOneRule(1, 1);

        // Assert
        expect(result).toEqual(mockRule);
        expect(ruleRepository.findOne).toHaveBeenCalledWith({
          where: { id: 1, userId: 1 },
          relations: ['category', 'bankAccount'],
        });
      });

      it('should throw NotFoundException when rule not found', async () => {
        // Arrange
        (ruleRepository.findOne as jest.Mock).mockResolvedValue(null);

        // Act & Assert
        await expect(service.findOneRule(999, 1)).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('createRule', () => {
      it('should create a new distribution rule', async () => {
        // Arrange
        const createDto = {
          name: 'Monthly Salary',
          expectedAmount: 3000,
          amountTolerance: 10,
          descriptionPattern: 'SALARY',
          autoDistribute: true,
          distributionStrategy: 'priority' as const,
        };
        (ruleRepository.create as jest.Mock).mockReturnValue({
          ...createDto,
          userId: 1,
        });
        (ruleRepository.save as jest.Mock).mockResolvedValue({
          ...mockRule,
          ...createDto,
        });

        // Act
        const result = await service.createRule(1, createDto);

        // Assert
        expect(result.name).toBe('Monthly Salary');
        expect(ruleRepository.create).toHaveBeenCalledWith({
          ...createDto,
          userId: 1,
        });
        expect(ruleRepository.save).toHaveBeenCalled();
      });
    });

    describe('updateRule', () => {
      it('should update an existing rule', async () => {
        // Arrange
        const updateDto = { name: 'Updated Salary' };
        (ruleRepository.findOne as jest.Mock).mockResolvedValue(mockRule);
        (ruleRepository.save as jest.Mock).mockResolvedValue({
          ...mockRule,
          ...updateDto,
        });

        // Act
        const result = await service.updateRule(1, 1, updateDto);

        // Assert
        expect(result.name).toBe('Updated Salary');
      });

      it('should throw NotFoundException when updating non-existent rule', async () => {
        // Arrange
        (ruleRepository.findOne as jest.Mock).mockResolvedValue(null);

        // Act & Assert
        await expect(
          service.updateRule(999, 1, { name: 'Test' }),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('deleteRule', () => {
      it('should delete an existing rule', async () => {
        // Arrange
        (ruleRepository.findOne as jest.Mock).mockResolvedValue(mockRule);
        (ruleRepository.remove as jest.Mock).mockResolvedValue(mockRule);

        // Act
        await service.deleteRule(1, 1);

        // Assert
        expect(ruleRepository.remove).toHaveBeenCalledWith(mockRule);
      });

      it('should throw NotFoundException when deleting non-existent rule', async () => {
        // Arrange
        (ruleRepository.findOne as jest.Mock).mockResolvedValue(null);

        // Act & Assert
        await expect(service.deleteRule(999, 1)).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });

  describe('Rule Matching', () => {
    describe('findMatchingRule', () => {
      it('should match rule by amount within tolerance', async () => {
        // Arrange
        const transaction = {
          ...mockTransaction,
          amount: 2950,
          description: 'OTHER PAYMENT',
        };
        (ruleRepository.find as jest.Mock).mockResolvedValue([mockRule]);

        // Act
        const result = await service.findMatchingRule(
          transaction as Transaction,
        );

        // Assert
        expect(result).toEqual(mockRule);
      });

      it('should match rule by description pattern', async () => {
        // Arrange
        const transaction = {
          ...mockTransaction,
          amount: 5000,
          description: 'MONTHLY SALARY DEPOSIT',
        };
        const ruleWithoutAmount = { ...mockRule, expectedAmount: null };
        (ruleRepository.find as jest.Mock).mockResolvedValue([
          ruleWithoutAmount,
        ]);

        // Act
        const result = await service.findMatchingRule(
          transaction as Transaction,
        );

        // Assert
        expect(result).toEqual(ruleWithoutAmount);
      });

      it('should match rule by category', async () => {
        // Arrange
        const transaction = {
          ...mockTransaction,
          category: { id: 5, name: 'Salary' },
          description: 'RANDOM DEPOSIT',
        };
        const ruleWithCategory = {
          ...mockRule,
          expectedAmount: null,
          descriptionPattern: null,
        };
        (ruleRepository.find as jest.Mock).mockResolvedValue([
          ruleWithCategory,
        ]);

        // Act
        const result = await service.findMatchingRule(
          transaction as Transaction,
        );

        // Assert
        expect(result).toEqual(ruleWithCategory);
      });

      it('should match rule by bank account', async () => {
        // Arrange
        const transaction = {
          ...mockTransaction,
          bankAccount: { id: 1, name: 'Main' },
          category: null,
          description: 'DEPOSIT',
        } as unknown as Transaction;
        const ruleWithBankAccount = {
          ...mockRule,
          expectedAmount: null,
          descriptionPattern: null,
          categoryId: null,
        };
        (ruleRepository.find as jest.Mock).mockResolvedValue([
          ruleWithBankAccount,
        ]);

        // Act
        const result = await service.findMatchingRule(transaction);

        // Assert
        expect(result).toEqual(ruleWithBankAccount);
      });

      it('should return null when no rules match', async () => {
        // Arrange
        const transaction = {
          ...mockTransaction,
          amount: 100,
          description: 'RANDOM',
          category: null,
          bankAccount: null,
        } as unknown as Transaction;
        (ruleRepository.find as jest.Mock).mockResolvedValue([mockRule]);

        // Act
        const result = await service.findMatchingRule(transaction);

        // Assert
        expect(result).toBeNull();
      });

      it('should not match inactive rules', async () => {
        // Arrange
        const inactiveRule = { ...mockRule, isActive: false };
        (ruleRepository.find as jest.Mock).mockResolvedValue([]);

        // Act
        const result = await service.findMatchingRule(
          mockTransaction as Transaction,
        );

        // Assert
        expect(result).toBeNull();
      });
    });
  });

  describe('Distribution Strategies', () => {
    const plan1 = {
      ...mockExpensePlan,
      id: 1,
      priority: 'essential',
      monthlyContribution: 100,
    };
    const plan2 = {
      ...mockExpensePlan,
      id: 2,
      priority: 'important',
      monthlyContribution: 200,
    };
    const plan3 = {
      ...mockExpensePlan,
      id: 3,
      priority: 'discretionary',
      monthlyContribution: 150,
    };

    describe('priority strategy', () => {
      it('should distribute by priority order (essential first)', async () => {
        // Arrange
        const plans = [plan1, plan2, plan3];
        const incomeAmount = 350; // Enough for plan1 (100) + plan2 (200) + partial plan3

        // Act
        const result = service.calculateDistribution(
          plans as ExpensePlan[],
          incomeAmount,
          'priority',
        );

        // Assert
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ planId: 1, amount: 100 });
        expect(result[1]).toEqual({ planId: 2, amount: 200 });
        expect(result[2]).toEqual({ planId: 3, amount: 50 }); // Remaining
      });

      it('should stop when income is exhausted', async () => {
        // Arrange
        const plans = [plan1, plan2, plan3];
        const incomeAmount = 150; // Only enough for plan1 + partial plan2

        // Act
        const result = service.calculateDistribution(
          plans as ExpensePlan[],
          incomeAmount,
          'priority',
        );

        // Assert
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ planId: 1, amount: 100 });
        expect(result[1]).toEqual({ planId: 2, amount: 50 });
      });
    });

    describe('proportional strategy', () => {
      it('should distribute proportionally based on monthly contribution', async () => {
        // Arrange
        const plans = [plan1, plan2, plan3]; // 100, 200, 150 = 450 total
        const incomeAmount = 450;

        // Act
        const result = service.calculateDistribution(
          plans as ExpensePlan[],
          incomeAmount,
          'proportional',
        );

        // Assert
        expect(result).toHaveLength(3);
        // plan1: 100/450 * 450 = 100
        // plan2: 200/450 * 450 = 200
        // plan3: 150/450 * 450 = 150
        expect(result[0].amount).toBeCloseTo(100, 1);
        expect(result[1].amount).toBeCloseTo(200, 1);
        expect(result[2].amount).toBeCloseTo(150, 1);
      });

      it('should cap distribution at monthly contribution', async () => {
        // Arrange
        const plans = [plan1, plan2]; // 100, 200 = 300 total
        const incomeAmount = 600; // More than enough

        // Act
        const result = service.calculateDistribution(
          plans as ExpensePlan[],
          incomeAmount,
          'proportional',
        );

        // Assert
        // Each gets their full monthly contribution
        expect(result[0].amount).toBe(100);
        expect(result[1].amount).toBe(200);
      });
    });

    describe('fixed strategy', () => {
      it('should allocate exact monthly contribution amounts', async () => {
        // Arrange
        const plans = [plan1, plan2, plan3];
        const incomeAmount = 500;

        // Act
        const result = service.calculateDistribution(
          plans as ExpensePlan[],
          incomeAmount,
          'fixed',
        );

        // Assert
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ planId: 1, amount: 100 });
        expect(result[1]).toEqual({ planId: 2, amount: 200 });
        expect(result[2]).toEqual({ planId: 3, amount: 150 });
      });

      it('should allocate partial amounts when income is insufficient', async () => {
        // Arrange
        const plans = [plan1, plan2, plan3];
        const incomeAmount = 250;

        // Act
        const result = service.calculateDistribution(
          plans as ExpensePlan[],
          incomeAmount,
          'fixed',
        );

        // Assert
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ planId: 1, amount: 100 });
        expect(result[1]).toEqual({ planId: 2, amount: 150 }); // Partial
      });
    });
  });

  describe('getPendingDistributions', () => {
    it('should return plans that need funding', async () => {
      // Arrange
      const plans = [
        {
          ...mockExpensePlan,
          id: 1,
          monthlyContribution: 100,
        },
        {
          ...mockExpensePlan,
          id: 2,
          monthlyContribution: 100,
        },
      ];
      (planRepository.find as jest.Mock).mockResolvedValue(plans);

      // Act
      const result = await service.getPendingDistributions(1);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].amountNeeded).toBe(100); // Monthly contribution
      expect(result[1].amountNeeded).toBe(100);
    });
  });
});
