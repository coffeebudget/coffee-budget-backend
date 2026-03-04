import { Test, TestingModule } from '@nestjs/testing';
import { PlanLifecycleService } from './plan-lifecycle.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExpensePlan } from '../../expense-plans/entities/expense-plan.entity';
import { IncomePlan } from '../../income-plans/entities/income-plan.entity';
import { EventPublisherService } from '../services/event-publisher.service';
import { RepositoryMockFactory } from '../../test/test-utils/repository-mocks';
import { Repository } from 'typeorm';

describe('PlanLifecycleService', () => {
  let service: PlanLifecycleService;
  let expensePlanRepo: Repository<ExpensePlan>;
  let incomePlanRepo: Repository<IncomePlan>;
  let eventPublisher: EventPublisherService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        PlanLifecycleService,
        RepositoryMockFactory.createRepositoryProvider(ExpensePlan),
        RepositoryMockFactory.createRepositoryProvider(IncomePlan),
        {
          provide: EventPublisherService,
          useValue: { publish: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(PlanLifecycleService);
    expensePlanRepo = module.get(getRepositoryToken(ExpensePlan));
    incomePlanRepo = module.get(getRepositoryToken(IncomePlan));
    eventPublisher = module.get(EventPublisherService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('autoCompleteExpiredPlans', () => {
    it('should complete expense plans with past endDate', async () => {
      const expiredPlan = {
        id: 1,
        name: 'Daycare',
        status: 'active',
        endDate: new Date('2025-01-01'),
        userId: 10,
      };
      (expensePlanRepo.find as jest.Mock).mockResolvedValue([expiredPlan]);
      (incomePlanRepo.find as jest.Mock).mockResolvedValue([]);

      await service.autoCompleteExpiredPlans();

      expect(expensePlanRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, status: 'completed' }),
      );
      expect(eventPublisher.publish).toHaveBeenCalled();
    });

    it('should complete income plans with past endDate', async () => {
      const expiredIncome = {
        id: 2,
        name: 'Contract',
        status: 'active',
        endDate: new Date('2025-06-01'),
        userId: 10,
      };
      (expensePlanRepo.find as jest.Mock).mockResolvedValue([]);
      (incomePlanRepo.find as jest.Mock).mockResolvedValue([expiredIncome]);

      await service.autoCompleteExpiredPlans();

      expect(incomePlanRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2, status: 'archived' }),
      );
      expect(eventPublisher.publish).toHaveBeenCalled();
    });

    it('should not touch plans with null endDate', async () => {
      (expensePlanRepo.find as jest.Mock).mockResolvedValue([]);
      (incomePlanRepo.find as jest.Mock).mockResolvedValue([]);

      await service.autoCompleteExpiredPlans();

      expect(expensePlanRepo.save).not.toHaveBeenCalled();
      expect(incomePlanRepo.save).not.toHaveBeenCalled();
    });

    it('should not touch plans with future endDate', async () => {
      (expensePlanRepo.find as jest.Mock).mockResolvedValue([]);
      (incomePlanRepo.find as jest.Mock).mockResolvedValue([]);

      await service.autoCompleteExpiredPlans();

      expect(expensePlanRepo.save).not.toHaveBeenCalled();
    });
  });
});
