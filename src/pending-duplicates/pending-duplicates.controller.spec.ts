import { Test, TestingModule } from '@nestjs/testing';
import { PendingDuplicatesController } from './pending-duplicates.controller';
import { PendingDuplicatesService } from './pending-duplicates.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PendingDuplicate } from './entities/pending-duplicate.entity';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionOperationsService } from '../shared/transaction-operations.service';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { User } from '../users/user.entity';
import { DuplicateTransactionChoice } from '../transactions/dto/duplicate-transaction-choice.dto';
describe('PendingDuplicatesController', () => {
  let controller: PendingDuplicatesController;
  let service: PendingDuplicatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PendingDuplicatesController],
      providers: [
        PendingDuplicatesService,
        {
          provide: getRepositoryToken(PendingDuplicate),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(Transaction),
          useClass: Repository,
        },
        {
          provide: TransactionOperationsService,
          useValue: {
            findMatchingTransactions: jest.fn(),
            handleDuplicateResolution: jest.fn(),
            createPendingDuplicate: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(RecurringTransaction),
          useClass: Repository,
        },
      ],
    }).compile();

    controller = module.get<PendingDuplicatesController>(
      PendingDuplicatesController,
    );
    service = module.get<PendingDuplicatesService>(PendingDuplicatesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return pending duplicates for the user', async () => {
      const mockUserId = 1;
      const mockDuplicates = [
        {
          id: 1,
          existingTransaction: { id: 100 },
          newTransactionData: { amount: 50 },
        },
      ];

      jest
        .spyOn(service, 'findPendingDuplicates')
        .mockResolvedValue(mockDuplicates as PendingDuplicate[]);

      const result = await controller.findAll({ id: mockUserId } as User);

      expect(result).toEqual(mockDuplicates);
      expect(service.findPendingDuplicates).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe('resolve', () => {
    it('should resolve a pending duplicate with the chosen action', async () => {
      const mockUserId = 1;
      const mockId = 5;
      const mockChoice = DuplicateTransactionChoice.MAINTAIN_BOTH;
      const mockResult = {
        existingTransaction: { id: 100 },
        newTransaction: { id: 101 },
        resolved: true,
      };

      jest
        .spyOn(service, 'resolvePendingDuplicate')
        .mockResolvedValue(mockResult as any);

      const result = await controller.resolve(mockId, { choice: mockChoice }, {
        id: mockUserId,
      } as User);

      expect(result).toEqual(mockResult);
      expect(service.resolvePendingDuplicate).toHaveBeenCalledWith(
        mockId,
        mockUserId,
        mockChoice,
      );
    });
  });
});
