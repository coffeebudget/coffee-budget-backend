import { Test, TestingModule } from '@nestjs/testing';
import { TagsService } from './tags.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Tag } from './entities/tag.entity';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionOperationsService } from '../transactions/transaction-operations.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';

describe('TagsService', () => {
  let service: TagsService;
  let tagsRepository: any;
  let transactionsRepository: any;
  let transactionOperationsService: any;

  beforeEach(async () => {
    // Create a more complete mock for the tags repository
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        find: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({ affected: 0 }),
      },
    };

    const tagsRepositoryMock = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
        getMany: jest.fn(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        execute: jest.fn().mockReturnValue({
          affected: 1,
          raw: [],
        }),
      }),
      manager: {
        connection: {
          createQueryRunner: jest.fn().mockReturnValue(queryRunner),
        },
      },
    };

    const transactionsRepositoryMock = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };

    const transactionOperationsServiceMock = {
      findMatchingTransactions: jest.fn(),
      handleDuplicateResolution: jest.fn(),
      createPendingDuplicate: jest.fn(),
      linkTransactionsToRecurring: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        {
          provide: getRepositoryToken(Tag),
          useValue: tagsRepositoryMock,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: transactionsRepositoryMock,
        },
        {
          provide: getRepositoryToken(PendingDuplicate),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: TransactionOperationsService,
          useValue: transactionOperationsServiceMock,
        },
      ],
    }).compile();

    service = module.get<TagsService>(TagsService);
    tagsRepository = module.get(getRepositoryToken(Tag));
    transactionsRepository = module.get(getRepositoryToken(Transaction));
    transactionOperationsService = module.get(TransactionOperationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw a NotFoundException when trying to remove a tag that does not exist', async () => {
    const tagId = 1;
    const mockUserId = 1;

    // Mock that the tag does not exist
    tagsRepository.findOne.mockResolvedValue(null);

    await expect(service.remove(tagId, mockUserId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should successfully remove a tag when it exists and is not associated with transactions', async () => {
    const tagId = 1;
    const mockUserId = 1;

    // Mock that the tag exists
    tagsRepository.findOne.mockResolvedValue({
      id: tagId,
      name: 'Test Tag',
      user: { id: mockUserId },
    });

    // Mock that there are no transactions using this tag
    transactionsRepository.find.mockResolvedValue([]);

    // Mock the query runner's manager.delete to return affected: 1
    const queryRunner = tagsRepository.manager.connection.createQueryRunner();
    queryRunner.manager.delete.mockResolvedValue({ affected: 1 });

    await service.remove(tagId, mockUserId);

    expect(queryRunner.connect).toHaveBeenCalled();
    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  // Add more tests here...
});
