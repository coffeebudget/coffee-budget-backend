import { Repository, ObjectLiteral } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';

/**
 * Standardized repository mock factory for consistent testing
 * Provides complete method sets for all common TypeORM repository operations
 */
export class RepositoryMockFactory {
  /**
   * Creates a complete mock repository with all common TypeORM methods
   */
  static createMockRepository<T extends ObjectLiteral>(): any {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      having: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      getMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue(null),
      getRawMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
      execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
    };

    return {
      // Basic CRUD operations
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      findOneBy: jest.fn().mockResolvedValue(null),
      findBy: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      findAndCountBy: jest.fn().mockResolvedValue([[], 0]),
      save: jest
        .fn()
        .mockImplementation((entity) => Promise.resolve({ id: 1, ...entity })),
      create: jest.fn().mockImplementation((dto) => dto),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      remove: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(0),
      countBy: jest.fn().mockResolvedValue(0),
      exists: jest.fn().mockResolvedValue(false),
      existsBy: jest.fn().mockResolvedValue(false),

      // Query builder
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),

      // Additional TypeORM methods
      preload: jest
        .fn()
        .mockImplementation((entity) => Promise.resolve(entity)),
      upsert: jest.fn().mockResolvedValue({ affected: 1 }),
      insert: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      restore: jest.fn().mockResolvedValue({ affected: 1 }),
      query: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
    };
  }

  /**
   * Creates a standardized repository provider for NestJS testing modules
   */
  static createRepositoryProvider<T extends ObjectLiteral>(
    entity: new () => T,
  ) {
    return {
      provide: getRepositoryToken(entity),
      useValue: this.createMockRepository<T>(),
    };
  }

  /**
   * Creates multiple repository providers at once
   */
  static createRepositoryProviders<
    T extends Record<string, new () => ObjectLiteral>,
  >(entities: T) {
    return Object.entries(entities).map(([key, entity]) =>
      this.createRepositoryProvider(entity),
    );
  }
}

/**
 * Common entity types for easy repository mock creation
 */
export const CommonEntities = {
  User: class User {},
  Transaction: class Transaction {},
  BankAccount: class BankAccount {},
  CreditCard: class CreditCard {},
  Category: class Category {},
  Tag: class Tag {},
  PendingDuplicate: class PendingDuplicate {},
} as const;

/**
 * Pre-configured repository mocks for common entities
 */
export const StandardRepositoryMocks = {
  User: () =>
    RepositoryMockFactory.createRepositoryProvider(CommonEntities.User),
  Transaction: () =>
    RepositoryMockFactory.createRepositoryProvider(CommonEntities.Transaction),
  BankAccount: () =>
    RepositoryMockFactory.createRepositoryProvider(CommonEntities.BankAccount),
  CreditCard: () =>
    RepositoryMockFactory.createRepositoryProvider(CommonEntities.CreditCard),
  Category: () =>
    RepositoryMockFactory.createRepositoryProvider(CommonEntities.Category),
  Tag: () => RepositoryMockFactory.createRepositoryProvider(CommonEntities.Tag),
  PendingDuplicate: () =>
    RepositoryMockFactory.createRepositoryProvider(
      CommonEntities.PendingDuplicate,
    ),
};
