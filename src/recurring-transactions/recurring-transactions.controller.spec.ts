import { Test, TestingModule } from '@nestjs/testing';
import { RecurringTransactionsController } from './recurring-transactions.controller';
import { RecurringTransactionsService } from './recurring-transactions.service';
import { RecurringTransactionCronService } from './recurring-transaction-cron.service';
import { RecurringPatternDetectorService } from './recurring-pattern-detector.service';
import { TransactionOperationsService } from '../shared/transaction-operations.service';
import { TransactionsService } from '../transactions/transactions.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RecurringTransaction } from './entities/recurring-transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringTransactionGeneratorService } from './recurring-transaction-generator.service';

describe('RecurringTransactionsController', () => {
  let controller: RecurringTransactionsController;
  let service: RecurringTransactionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecurringTransactionsController],
      providers: [
        {
          provide: RecurringTransactionsService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: TransactionsService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: RecurringTransactionCronService,
          useValue: {
            handleRecurringTransactions: jest.fn(),
          },
        },
        {
          provide: RecurringPatternDetectorService,
          useValue: {
            detectAllRecurringPatterns: jest.fn(),
          },
        },
        {
          provide: TransactionOperationsService,
          useValue: {
            findMatchingTransactions: jest.fn(),
            handleDuplicateResolution: jest.fn(),
            createPendingDuplicate: jest.fn(),
            linkTransactionsToRecurring: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(RecurringTransaction),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Category),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Tag),
          useValue: {
            findByIds: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(BankAccount),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CreditCard),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: RecurringTransactionGeneratorService,
          useValue: {
            generateTransactionsForRecurring: jest.fn(),
            generateNextOccurrences: jest.fn(),
            calculateNextExecutionDate: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<RecurringTransactionsController>(
      RecurringTransactionsController,
    );
    service = module.get<RecurringTransactionsService>(
      RecurringTransactionsService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
