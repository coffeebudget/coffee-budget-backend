import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RepositoryMockFactory } from './repository-mocks';

/**
 * Standardized test setup utilities for consistent repository mocking
 */
export class StandardizedTestSetup {
  /**
   * Creates a testing module with standardized repository mocks
   */
  static async createTestingModuleWithRepositories<T>(
    serviceClass: new (...args: any[]) => T,
    entities: Array<new () => any>,
    additionalProviders: any[] = [],
  ): Promise<TestingModule> {
    const repositoryProviders = entities.map((entity) =>
      RepositoryMockFactory.createRepositoryProvider(entity),
    );

    return Test.createTestingModule({
      providers: [serviceClass, ...repositoryProviders, ...additionalProviders],
    }).compile();
  }

  /**
   * Sets up common mock return values for repositories
   */
  static setupCommonMocks(
    module: TestingModule,
    entities: Array<new () => any>,
  ) {
    entities.forEach((entity) => {
      const repository = module.get<Repository<any>>(
        getRepositoryToken(entity),
      );

      // Set up common mock behaviors - these are already Jest mocks from RepositoryMockFactory
      // Type assertion to avoid TypeScript issues with Jest mocks
      const mockRepository = repository as any;

      if (mockRepository.save && mockRepository.save.mockImplementation) {
        mockRepository.save.mockImplementation((entity: any) =>
          Promise.resolve({ id: 1, ...entity }),
        );
      }

      if (mockRepository.create && mockRepository.create.mockImplementation) {
        mockRepository.create.mockImplementation((dto: any) => dto);
      }

      if (mockRepository.find && mockRepository.find.mockResolvedValue) {
        mockRepository.find.mockResolvedValue([]);
      }

      if (mockRepository.findOne && mockRepository.findOne.mockResolvedValue) {
        mockRepository.findOne.mockResolvedValue(null);
      }

      if (mockRepository.count && mockRepository.count.mockResolvedValue) {
        mockRepository.count.mockResolvedValue(0);
      }
    });
  }

  /**
   * Creates a complete test setup with standardized mocks
   */
  static async createCompleteTestSetup<T>(
    serviceClass: new (...args: any[]) => T,
    entities: Array<new () => any>,
    additionalProviders: any[] = [],
  ) {
    const module = await this.createTestingModuleWithRepositories(
      serviceClass,
      entities,
      additionalProviders,
    );

    this.setupCommonMocks(module, entities);

    return module;
  }
}

/**
 * Common entity imports for easy use in tests
 */
export const TestEntities = {
  User: class User {},
  Transaction: class Transaction {},
  BankAccount: class BankAccount {},
  CreditCard: class CreditCard {},
  Category: class Category {},
  Tag: class Tag {},
  RecurringTransaction: class RecurringTransaction {},
  PendingDuplicate: class PendingDuplicate {},
} as const;
