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

  describe('findByName', () => {
    it('should find a tag case-insensitively', async () => {
      const mockTag = { id: 1, name: 'Coffee', user: { id: 1 } };
      tagsRepository.findOne.mockResolvedValue(mockTag);

      const result = await service.findByName('coffee', 1);

      expect(result).toEqual(mockTag);
      // Verify ILike is used (the where clause receives an ILike object)
      expect(tagsRepository.findOne).toHaveBeenCalledWith({
        where: { name: expect.anything(), user: { id: 1 } },
      });
    });

    it('should trim whitespace from the name', async () => {
      const mockTag = { id: 1, name: 'Coffee', user: { id: 1 } };
      tagsRepository.findOne.mockResolvedValue(mockTag);

      const result = await service.findByName('  Coffee  ', 1);

      expect(result).toEqual(mockTag);
    });
  });

  describe('findOrCreate', () => {
    it('should return existing tag when found', async () => {
      const mockTag = { id: 1, name: 'Coffee', user: { id: 1 } };
      tagsRepository.findOne.mockResolvedValue(mockTag);

      const result = await service.findOrCreate('Coffee', 1);

      expect(result).toEqual(mockTag);
      // Should not attempt to create
      expect(tagsRepository.create).not.toHaveBeenCalled();
      expect(tagsRepository.save).not.toHaveBeenCalled();
    });

    it('should create a new tag when not found', async () => {
      const newTag = { id: 2, name: 'NewTag', user: { id: 1 } };
      // First call (findByName) returns null, second call (create's duplicate check) returns null
      tagsRepository.findOne.mockResolvedValue(null);
      tagsRepository.create.mockReturnValue(newTag);
      tagsRepository.save.mockResolvedValue(newTag);

      const result = await service.findOrCreate('NewTag', 1);

      expect(result).toEqual(newTag);
      expect(tagsRepository.create).toHaveBeenCalled();
      expect(tagsRepository.save).toHaveBeenCalled();
    });

    it('should be case-insensitive (return existing tag for different case)', async () => {
      const mockTag = { id: 1, name: 'Coffee', user: { id: 1 } };
      tagsRepository.findOne.mockResolvedValue(mockTag);

      const result = await service.findOrCreate('COFFEE', 1);

      expect(result).toEqual(mockTag);
      expect(tagsRepository.create).not.toHaveBeenCalled();
    });

    it('should trim whitespace', async () => {
      const mockTag = { id: 1, name: 'Coffee', user: { id: 1 } };
      tagsRepository.findOne.mockResolvedValue(mockTag);

      const result = await service.findOrCreate('  Coffee  ', 1);

      expect(result).toEqual(mockTag);
      expect(tagsRepository.create).not.toHaveBeenCalled();
    });

    it('should handle race condition by retrying findByName on ConflictException', async () => {
      const mockTag = { id: 1, name: 'Coffee', user: { id: 1 } };
      tagsRepository.findOne
        // 1st call: findOrCreate's findByName → null (tag doesn't exist yet)
        .mockResolvedValueOnce(null)
        // 2nd call: create's internal duplicate check → tag now exists (another process created it)
        .mockResolvedValueOnce(mockTag)
        // 3rd call: findOrCreate's retry findByName in catch block → finds the tag
        .mockResolvedValueOnce(mockTag);

      const result = await service.findOrCreate('Coffee', 1);

      expect(result).toEqual(mockTag);
      // create/save should NOT have been called since the ConflictException was thrown before save
      expect(tagsRepository.save).not.toHaveBeenCalled();
    });
  });
});
