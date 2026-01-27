import { Test, TestingModule } from '@nestjs/testing';
import { IncomePlansService } from './income-plans.service';
import { IncomePlan } from './entities/income-plan.entity';
import { IncomePlanEntry } from './entities/income-plan-entry.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';
import { EventPublisherService } from '../shared/services/event-publisher.service';

describe('IncomePlansService', () => {
  let service: IncomePlansService;
  let incomePlanRepository: Repository<IncomePlan>;
  let module: TestingModule;
  let eventPublisher: EventPublisherService;

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
    name: 'Salary',
    keywords: ['salary', 'stipendio'],
    user: mockUser,
    transactions: [],
    recurringTransactions: [],
    excludeFromExpenseAnalytics: true,
    analyticsExclusionReason: 'Income category',
    budgetLevel: 'primary' as const,
    monthlyBudget: null,
    yearlyBudget: null,
    maxThreshold: null,
    warningThreshold: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockIncomePlan: IncomePlan = {
    id: 1,
    userId: 1,
    user: mockUser as any,
    name: 'Stipendio Alessandro',
    description: 'Monthly salary with 13th month bonus in December',
    icon: '💼',
    reliability: 'guaranteed',
    categoryId: 1,
    category: mockCategory as any,
    january: 4000,
    february: 4000,
    march: 4000,
    april: 4000,
    may: 4000,
    june: 4000,
    july: 4000,
    august: 4000,
    september: 4000,
    october: 4000,
    november: 4000,
    december: 7000, // 13th month bonus
    paymentAccountId: null,
    paymentAccount: null,
    expectedDay: 27,
    status: 'active',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    getMonthlyAmounts: jest.fn().mockReturnValue({
      january: 4000,
      february: 4000,
      march: 4000,
      april: 4000,
      may: 4000,
      june: 4000,
      july: 4000,
      august: 4000,
      september: 4000,
      october: 4000,
      november: 4000,
      december: 7000,
    }),
    getAmountForMonth: jest.fn().mockImplementation((monthIndex: number) => {
      const amounts = [
        4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 7000,
      ];
      return amounts[monthIndex];
    }),
    getAnnualTotal: jest.fn().mockReturnValue(51000),
    getMonthlyAverage: jest.fn().mockReturnValue(4250),
  };

  const mockIncomePlanSeasonalWife: IncomePlan = {
    id: 2,
    userId: 1,
    user: mockUser as any,
    name: 'Stipendio Maria',
    description: 'Wife salary with seasonal reduction',
    icon: '👩‍💼',
    reliability: 'guaranteed',
    categoryId: 1,
    category: mockCategory as any,
    january: 1500,
    february: 1500,
    march: 1500,
    april: 1500,
    may: 1500,
    june: 1500,
    july: 700, // Seasonal reduction
    august: 700,
    september: 700,
    october: 1500,
    november: 1500,
    december: 1500,
    paymentAccountId: null,
    paymentAccount: null,
    expectedDay: 27,
    status: 'active',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    getMonthlyAmounts: jest.fn().mockReturnValue({
      january: 1500,
      february: 1500,
      march: 1500,
      april: 1500,
      may: 1500,
      june: 1500,
      july: 700,
      august: 700,
      september: 700,
      october: 1500,
      november: 1500,
      december: 1500,
    }),
    getAmountForMonth: jest.fn().mockImplementation((monthIndex: number) => {
      const amounts = [
        1500, 1500, 1500, 1500, 1500, 1500, 700, 700, 700, 1500, 1500, 1500,
      ];
      return amounts[monthIndex];
    }),
    getAnnualTotal: jest.fn().mockReturnValue(15600),
    getMonthlyAverage: jest.fn().mockReturnValue(1300),
  };

  const mockIncomePlanUncertain: IncomePlan = {
    id: 3,
    userId: 1,
    user: mockUser as any,
    name: 'Contributo Genitori',
    description: 'Variable contribution from parents',
    icon: '👨‍👩‍👦',
    reliability: 'uncertain',
    categoryId: null,
    category: null,
    january: 300,
    february: 300,
    march: 300,
    april: 300,
    may: 300,
    june: 300,
    july: 300,
    august: 300,
    september: 300,
    october: 300,
    november: 300,
    december: 300,
    paymentAccountId: null,
    paymentAccount: null,
    expectedDay: null,
    status: 'active',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    getMonthlyAmounts: jest.fn().mockReturnValue({
      january: 300,
      february: 300,
      march: 300,
      april: 300,
      may: 300,
      june: 300,
      july: 300,
      august: 300,
      september: 300,
      october: 300,
      november: 300,
      december: 300,
    }),
    getAmountForMonth: jest.fn().mockReturnValue(300),
    getAnnualTotal: jest.fn().mockReturnValue(3600),
    getMonthlyAverage: jest.fn().mockReturnValue(300),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        IncomePlansService,
        RepositoryMockFactory.createRepositoryProvider(IncomePlan),
        RepositoryMockFactory.createRepositoryProvider(IncomePlanEntry),
        RepositoryMockFactory.createRepositoryProvider(Transaction),
        {
          provide: EventPublisherService,
          useValue: {
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<IncomePlansService>(IncomePlansService);
    incomePlanRepository = module.get(getRepositoryToken(IncomePlan));
    eventPublisher = module.get<EventPublisherService>(EventPublisherService);
  });

  afterEach(async () => {
    await module.close();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND ALL
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findAllByUser', () => {
    it('should return all income plans for a user', async () => {
      // Arrange
      const userId = 1;
      const mockPlans = [mockIncomePlan, mockIncomePlanSeasonalWife];
      (incomePlanRepository.find as jest.Mock).mockResolvedValue(mockPlans);

      // Act
      const result = await service.findAllByUser(userId);

      // Assert
      expect(result).toEqual(mockPlans);
      expect(incomePlanRepository.find).toHaveBeenCalledWith({
        where: { userId },
        relations: ['category', 'paymentAccount'],
        order: { name: 'ASC' },
      });
    });

    it('should return empty array when user has no income plans', async () => {
      // Arrange
      const userId = 999;
      (incomePlanRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.findAllByUser(userId);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('findActiveByUser', () => {
    it('should return only active income plans for a user', async () => {
      // Arrange
      const userId = 1;
      const mockPlans = [mockIncomePlan];
      (incomePlanRepository.find as jest.Mock).mockResolvedValue(mockPlans);

      // Act
      const result = await service.findActiveByUser(userId);

      // Assert
      expect(result).toEqual(mockPlans);
      expect(incomePlanRepository.find).toHaveBeenCalledWith({
        where: { userId, status: 'active' },
        relations: ['category', 'paymentAccount'],
        order: { name: 'ASC' },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND ONE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findOne', () => {
    it('should return income plan when found', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      (incomePlanRepository.findOne as jest.Mock).mockResolvedValue(
        mockIncomePlan,
      );

      // Act
      const result = await service.findOne(id, userId);

      // Assert
      expect(result).toEqual(mockIncomePlan);
      expect(incomePlanRepository.findOne).toHaveBeenCalledWith({
        where: { id, userId },
        relations: ['category', 'paymentAccount'],
      });
    });

    it('should throw NotFoundException when plan not found', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      (incomePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(id, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not return plan belonging to different user', async () => {
      // Arrange
      const id = 1;
      const userId = 999; // Different user
      (incomePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

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
    it('should create income plan with all fields', async () => {
      // Arrange
      const userId = 1;
      const createDto = {
        name: 'Stipendio Alessandro',
        description: 'Monthly salary',
        icon: '💼',
        reliability: 'guaranteed' as const,
        january: 4000,
        february: 4000,
        march: 4000,
        april: 4000,
        may: 4000,
        june: 4000,
        july: 4000,
        august: 4000,
        september: 4000,
        october: 4000,
        november: 4000,
        december: 7000,
        expectedDay: 27,
      };

      (incomePlanRepository.create as jest.Mock).mockReturnValue({
        ...createDto,
        userId,
        id: 1,
      });
      (incomePlanRepository.save as jest.Mock).mockResolvedValue({
        ...createDto,
        userId,
        id: 1,
      });

      // Act
      const result = await service.create(userId, createDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.name).toBe('Stipendio Alessandro');
      expect(incomePlanRepository.create).toHaveBeenCalled();
      expect(incomePlanRepository.save).toHaveBeenCalled();
      expect(eventPublisher.publish).toHaveBeenCalled();
    });

    it('should create income plan with defaults for optional fields', async () => {
      // Arrange
      const userId = 1;
      const createDto = {
        name: 'Simple Income',
      };

      const expectedDefaults = {
        userId,
        name: 'Simple Income',
        description: null,
        icon: null,
        reliability: 'guaranteed',
        categoryId: null,
        january: 0,
        february: 0,
        march: 0,
        april: 0,
        may: 0,
        june: 0,
        july: 0,
        august: 0,
        september: 0,
        october: 0,
        november: 0,
        december: 0,
        paymentAccountId: null,
        expectedDay: null,
        status: 'active',
      };

      (incomePlanRepository.create as jest.Mock).mockReturnValue({
        id: 1,
        ...expectedDefaults,
      });
      (incomePlanRepository.save as jest.Mock).mockResolvedValue({
        id: 1,
        ...expectedDefaults,
      });

      // Act
      const result = await service.create(userId, createDto);

      // Assert
      expect(incomePlanRepository.create).toHaveBeenCalledWith(
        expectedDefaults,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('update', () => {
    it('should update income plan fields', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const updateDto = {
        name: 'Updated Name',
        december: 8000,
      };

      (incomePlanRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockIncomePlan,
      });
      (incomePlanRepository.save as jest.Mock).mockResolvedValue({
        ...mockIncomePlan,
        name: 'Updated Name',
        december: 8000,
      });

      // Act
      const result = await service.update(id, userId, updateDto);

      // Assert
      expect(result.name).toBe('Updated Name');
      expect(result.december).toBe(8000);
      expect(eventPublisher.publish).toHaveBeenCalled();
    });

    it('should throw NotFoundException when updating non-existent plan', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      const updateDto = { name: 'New Name' };
      (incomePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.update(id, userId, updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('delete', () => {
    it('should delete income plan', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      (incomePlanRepository.findOne as jest.Mock).mockResolvedValue(
        mockIncomePlan,
      );
      (incomePlanRepository.remove as jest.Mock).mockResolvedValue(
        mockIncomePlan,
      );

      // Act
      await service.delete(id, userId);

      // Assert
      expect(incomePlanRepository.remove).toHaveBeenCalledWith(mockIncomePlan);
      expect(eventPublisher.publish).toHaveBeenCalled();
    });

    it('should throw NotFoundException when deleting non-existent plan', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      (incomePlanRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(id, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MONTHLY SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getMonthlySummary', () => {
    it('should return correct monthly summary with guaranteed and uncertain income', async () => {
      // Arrange
      const userId = 1;
      const year = 2025;
      const month = 1; // January

      (incomePlanRepository.find as jest.Mock).mockResolvedValue([
        mockIncomePlan,
        mockIncomePlanSeasonalWife,
        mockIncomePlanUncertain,
      ]);

      // Act
      const result = await service.getMonthlySummary(userId, year, month);

      // Assert
      expect(result.year).toBe(2025);
      expect(result.month).toBe(1);
      expect(result.guaranteedTotal).toBe(5500); // 4000 + 1500
      expect(result.uncertainTotal).toBe(300);
      expect(result.totalIncome).toBe(5800); // 4000 + 1500 + 300
      expect(result.budgetSafeIncome).toBe(5500); // Only guaranteed
      expect(result.planCount).toBe(3);
      expect(result.plans).toHaveLength(3);
    });

    it('should return reduced income for seasonal months (July)', async () => {
      // Arrange
      const userId = 1;
      const year = 2025;
      const month = 7; // July - seasonal reduction

      (incomePlanRepository.find as jest.Mock).mockResolvedValue([
        mockIncomePlan,
        mockIncomePlanSeasonalWife,
        mockIncomePlanUncertain,
      ]);

      // Act
      const result = await service.getMonthlySummary(userId, year, month);

      // Assert
      expect(result.guaranteedTotal).toBe(4700); // 4000 + 700 (seasonal reduction)
      expect(result.uncertainTotal).toBe(300);
      expect(result.totalIncome).toBe(5000); // 4000 + 700 + 300
    });

    it('should return correct income for December with bonus', async () => {
      // Arrange
      const userId = 1;
      const year = 2025;
      const month = 12; // December - 13th month bonus

      (incomePlanRepository.find as jest.Mock).mockResolvedValue([
        mockIncomePlan,
        mockIncomePlanSeasonalWife,
        mockIncomePlanUncertain,
      ]);

      // Act
      const result = await service.getMonthlySummary(userId, year, month);

      // Assert
      expect(result.guaranteedTotal).toBe(8500); // 7000 (with bonus) + 1500
      expect(result.totalIncome).toBe(8800); // 7000 + 1500 + 300
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ANNUAL SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getAnnualSummary', () => {
    it('should return correct annual totals', async () => {
      // Arrange
      const userId = 1;
      const year = 2025;

      (incomePlanRepository.find as jest.Mock).mockResolvedValue([
        mockIncomePlan,
        mockIncomePlanSeasonalWife,
      ]);

      // Act
      const result = await service.getAnnualSummary(userId, year);

      // Assert
      expect(result.year).toBe(2025);
      expect(result.totalAnnualIncome).toBe(66600); // 51000 + 15600
      expect(result.planCount).toBe(2);
      expect(result.monthlyBreakdown).toBeDefined();
      expect(result.monthlyBreakdown.january).toBe(5500); // 4000 + 1500
      expect(result.monthlyBreakdown.july).toBe(4700); // 4000 + 700
      expect(result.monthlyBreakdown.december).toBe(8500); // 7000 + 1500
    });

    it('should identify minimum and maximum months', async () => {
      // Arrange
      const userId = 1;
      const year = 2025;

      (incomePlanRepository.find as jest.Mock).mockResolvedValue([
        mockIncomePlan,
        mockIncomePlanSeasonalWife,
      ]);

      // Act
      const result = await service.getAnnualSummary(userId, year);

      // Assert
      expect(result.minimumMonth).toBe(4700); // July/Aug/Sep with seasonal reduction
      expect(result.maximumMonth).toBe(8500); // December with 13th month bonus
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getGuaranteedIncomeForMonth', () => {
    it('should return only guaranteed income total', async () => {
      // Arrange
      const userId = 1;
      (incomePlanRepository.find as jest.Mock).mockResolvedValue([
        mockIncomePlan,
        mockIncomePlanUncertain,
      ]);

      // Act
      const result = await service.getGuaranteedIncomeForMonth(userId, 2025, 1);

      // Assert
      expect(result).toBe(4000); // Only guaranteed (Alessandro), excludes uncertain (parents)
    });
  });

  describe('getIncomeByReliabilityForMonth', () => {
    it('should group income by reliability type', async () => {
      // Arrange
      const userId = 1;
      (incomePlanRepository.find as jest.Mock).mockResolvedValue([
        mockIncomePlan,
        mockIncomePlanUncertain,
      ]);

      // Act
      const result = await service.getIncomeByReliabilityForMonth(
        userId,
        2025,
        1,
      );

      // Assert
      expect(result.guaranteed).toBe(4000);
      expect(result.expected).toBe(0);
      expect(result.uncertain).toBe(300);
    });
  });
});
