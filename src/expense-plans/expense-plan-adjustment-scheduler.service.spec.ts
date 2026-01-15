import { Test, TestingModule } from '@nestjs/testing';
import { ExpensePlanAdjustmentSchedulerService } from './expense-plan-adjustment-scheduler.service';
import { ExpensePlanAdjustmentService } from './expense-plan-adjustment.service';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../users/user.entity';

describe('ExpensePlanAdjustmentSchedulerService', () => {
  let service: ExpensePlanAdjustmentSchedulerService;
  let adjustmentService: ExpensePlanAdjustmentService;
  let userRepository: Repository<User>;
  let module: TestingModule;

  const mockUsers = [
    { id: 1, auth0Id: 'auth0|user1', isDemoUser: false },
    { id: 2, auth0Id: 'auth0|user2', isDemoUser: false },
    { id: 3, auth0Id: 'auth0|demo', isDemoUser: true },
  ];

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ExpensePlanAdjustmentSchedulerService,
        {
          provide: ExpensePlanAdjustmentService,
          useValue: {
            reviewAllPlansForUser: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExpensePlanAdjustmentSchedulerService>(
      ExpensePlanAdjustmentSchedulerService,
    );
    adjustmentService = module.get<ExpensePlanAdjustmentService>(
      ExpensePlanAdjustmentService,
    );
    userRepository = module.get(getRepositoryToken(User));
  });

  afterEach(async () => {
    await module.close();
  });

  describe('weeklyAdjustmentReview', () => {
    it('should process all non-demo users', async () => {
      // Arrange
      const nonDemoUsers = mockUsers.filter((u) => !u.isDemoUser);
      (userRepository.find as jest.Mock).mockResolvedValue(nonDemoUsers);
      (adjustmentService.reviewAllPlansForUser as jest.Mock).mockResolvedValue({
        plansReviewed: 5,
        newSuggestions: 1,
        clearedSuggestions: 0,
      });

      // Act
      await service.weeklyAdjustmentReview();

      // Assert
      expect(userRepository.find).toHaveBeenCalledWith({
        where: { isDemoUser: false },
      });
      expect(adjustmentService.reviewAllPlansForUser).toHaveBeenCalledTimes(2);
      expect(adjustmentService.reviewAllPlansForUser).toHaveBeenCalledWith(1);
      expect(adjustmentService.reviewAllPlansForUser).toHaveBeenCalledWith(2);
    });

    it('should continue processing if one user fails', async () => {
      // Arrange
      const nonDemoUsers = mockUsers.filter((u) => !u.isDemoUser);
      (userRepository.find as jest.Mock).mockResolvedValue(nonDemoUsers);
      (adjustmentService.reviewAllPlansForUser as jest.Mock)
        .mockRejectedValueOnce(new Error('User 1 failed'))
        .mockResolvedValueOnce({
          plansReviewed: 3,
          newSuggestions: 1,
          clearedSuggestions: 0,
        });

      // Act
      await service.weeklyAdjustmentReview();

      // Assert
      expect(adjustmentService.reviewAllPlansForUser).toHaveBeenCalledTimes(2);
      expect(adjustmentService.reviewAllPlansForUser).toHaveBeenCalledWith(2);
    });

    it('should handle no users gracefully', async () => {
      // Arrange
      (userRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      await service.weeklyAdjustmentReview();

      // Assert
      expect(adjustmentService.reviewAllPlansForUser).not.toHaveBeenCalled();
    });

    it('should aggregate results from all users', async () => {
      // Arrange
      const nonDemoUsers = mockUsers.filter((u) => !u.isDemoUser);
      (userRepository.find as jest.Mock).mockResolvedValue(nonDemoUsers);
      (adjustmentService.reviewAllPlansForUser as jest.Mock)
        .mockResolvedValueOnce({
          plansReviewed: 5,
          newSuggestions: 2,
          clearedSuggestions: 1,
        })
        .mockResolvedValueOnce({
          plansReviewed: 3,
          newSuggestions: 1,
          clearedSuggestions: 0,
        });

      // Act
      const result = await service.weeklyAdjustmentReview();

      // Assert
      expect(result.usersProcessed).toBe(2);
      expect(result.totalPlansReviewed).toBe(8);
      expect(result.totalNewSuggestions).toBe(3);
      expect(result.totalClearedSuggestions).toBe(1);
    });
  });
});
