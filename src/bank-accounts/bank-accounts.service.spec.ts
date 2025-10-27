import { Test, TestingModule } from '@nestjs/testing';
import { BankAccountsService } from './bank-accounts.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BankAccount } from './entities/bank-account.entity';
import { Repository } from 'typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { Currency } from '../enums/currency.enum';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { TransactionOperationsService } from '../transactions/transaction-operations.service';
import { EventPublisherService } from '../shared/services/event-publisher.service';

describe('BankAccountsService', () => {
  let service: BankAccountsService;
  let bankAccountRepository: Repository<BankAccount>;
  let transactionRepository: jest.Mocked<Repository<Transaction>>;
  let recurringTransactionRepository: jest.Mocked<
    Repository<RecurringTransaction>
  >;
  let creditCardRepository: jest.Mocked<Repository<CreditCard>>;

  const mockUser: User = {
    id: 1,
    auth0Id: 'auth0|123',
    email: 'test@example.com',
    isDemoUser: false,
    demoExpiryDate: new Date('2024-12-31'),
    demoActivatedAt: new Date('2024-01-01'),
    bankAccounts: [],
    creditCards: [],
    transactions: null,
    tags: null,
    categories: null,
  };

  const mockBankAccount: BankAccount = {
    id: 1,
    name: 'Test Account',
    balance: 1000,
    type: 'CHECKING',
    gocardlessAccountId: 'test-gocardless-id',
    user: mockUser,
    currency: Currency.USD,
    transactions: [],
    creditCards: [],
    recurringTransactions: [],
  };

  const mockBankAccountRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankAccountsService,
        {
          provide: getRepositoryToken(BankAccount),
          useValue: mockBankAccountRepository,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(RecurringTransaction),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(CreditCard),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: TransactionOperationsService,
          useValue: {
            linkTransactionsToRecurring: jest.fn(),
            findMatchingTransactions: jest.fn(),
            createAutomatedTransaction: jest.fn(),
            findMatchingRecurringTransaction: jest.fn(),
          },
        },
        {
          provide: EventPublisherService,
          useValue: {
            publish: jest.fn().mockResolvedValue(undefined),
            publishBatch: jest.fn().mockResolvedValue(undefined),
            publishSync: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BankAccountsService>(BankAccountsService);
    bankAccountRepository = module.get<Repository<BankAccount>>(
      getRepositoryToken(BankAccount),
    );
    transactionRepository = module.get(getRepositoryToken(Transaction));
    recurringTransactionRepository = module.get(
      getRepositoryToken(RecurringTransaction),
    );
    creditCardRepository = module.get(getRepositoryToken(CreditCard));
  });

  describe('create', () => {
    it('should create a bank account for a user', async () => {
      const createDto = {
        name: 'Test Account',
        balance: 1000,
        type: 'CHECKING',
        currency: Currency.USD,
      };
      mockBankAccountRepository.create.mockReturnValue(mockBankAccount);
      mockBankAccountRepository.save.mockResolvedValue(mockBankAccount);

      const result = await service.create(createDto, mockUser);
      expect(result).toEqual(mockBankAccount);
      expect(mockBankAccountRepository.create).toHaveBeenCalledWith({
        ...createDto,
        user: mockUser,
      });
    });
  });

  describe('findAll', () => {
    it('should return all bank accounts for a user', async () => {
      mockBankAccountRepository.find.mockResolvedValue([mockBankAccount]);

      const result = await service.findAll(mockUser.id);
      expect(result).toEqual([mockBankAccount]);
      expect(mockBankAccountRepository.find).toHaveBeenCalledWith({
        where: { user: { id: mockUser.id } },
        relations: ['user'],
      });
    });
  });

  describe('findOne', () => {
    it('should return a bank account if it belongs to the user', async () => {
      mockBankAccountRepository.findOne.mockResolvedValue(mockBankAccount);

      const result = await service.findOne(1, mockUser.id);
      expect(result).toEqual(mockBankAccount);
    });

    it('should throw NotFoundException if bank account is not found', async () => {
      mockBankAccountRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(1, mockUser.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a bank account if it belongs to the user', async () => {
      const updateDto = { name: 'Updated Account' };
      mockBankAccountRepository.findOne.mockResolvedValue(mockBankAccount);
      mockBankAccountRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.update(1, updateDto, mockUser.id);
      expect(mockBankAccountRepository.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException if bank account is not found', async () => {
      mockBankAccountRepository.findOne.mockResolvedValue(null);

      await expect(service.update(1, {}, mockUser.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a bank account if it belongs to the user', async () => {
      mockBankAccountRepository.findOne.mockResolvedValue(mockBankAccount);
      mockBankAccountRepository.delete.mockResolvedValue({ affected: 1 });

      await service.remove(1, mockUser.id);
      expect(mockBankAccountRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if bank account is not found', async () => {
      mockBankAccountRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(1, mockUser.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if the bank account is linked to a transaction', async () => {
      const mockBankAccount = {
        id: 1,
        name: 'Test Account',
        balance: 1000,
        type: 'CHECKING',
        user: mockUser,
        currency: Currency.USD,
        creditCards: [],
        recurringTransactions: [],
        transactions: [{ id: 101 }], // Simulating a linked transaction
      };

      // Mock finding the existing bank account
      mockBankAccountRepository.findOne.mockResolvedValue(mockBankAccount);

      // Mock the transaction repository to simulate that the bank account is linked to a transaction
      transactionRepository.find.mockResolvedValue([
        { id: 101, bankAccount: { id: 1 } } as Transaction,
      ]);

      await expect(service.remove(1, mockUser.id)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if the bank account is linked to a recurring transaction', async () => {
      const mockBankAccount = {
        id: 1,
        name: 'Test Account',
        balance: 1000,
        type: 'CHECKING',
        user: mockUser,
        currency: Currency.USD,
        transactions: [],
        creditCards: [],
        recurringTransactions: [{ id: 201 }], // Simulating a linked recurring transaction
      };

      // Mock finding the existing bank account
      mockBankAccountRepository.findOne.mockResolvedValue(mockBankAccount);

      // Mock the recurring transaction repository to simulate that the bank account is linked to a recurring transaction
      recurringTransactionRepository.find.mockResolvedValue([
        { id: 201, bankAccount: { id: 1 } } as RecurringTransaction,
      ]);

      await expect(service.remove(1, mockUser.id)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if the bank account is linked to a credit card', async () => {
      const mockBankAccount = {
        id: 1,
        name: 'Test Account',
        balance: 1000,
        type: 'CHECKING',
        user: mockUser,
        currency: Currency.USD,
        recurringTransactions: [],
        transactions: [],
        creditCards: [{ id: 301 }], // Simulating a linked credit card
      };

      // Mock finding the existing bank account
      mockBankAccountRepository.findOne.mockResolvedValue(mockBankAccount);

      // Mock the credit card repository to simulate that the bank account is linked to a credit card
      creditCardRepository.find.mockResolvedValue([
        { id: 301, bankAccount: { id: 1 } } as CreditCard,
      ]);

      await expect(service.remove(1, mockUser.id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
