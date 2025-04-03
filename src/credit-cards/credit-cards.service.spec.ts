import { Test, TestingModule } from '@nestjs/testing';
import { CreditCardsService } from './credit-cards.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreditCard } from './entities/credit-card.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { TransactionOperationsService } from '../shared/transaction-operations.service';
import { Repository } from 'typeorm';
import { CreateCreditCardDto } from './dto/create-credit-card.dto';
import { NotFoundException } from '@nestjs/common'; 

describe('CreditCardsService', () => {
  let service: CreditCardsService;
  let mockCreditCardsRepository: Partial<Repository<CreditCard>>;
  let mockBankAccountsRepository: Partial<Repository<BankAccount>>;
  let mockTransactionRepository: Partial<Repository<Transaction>>;
  let mockRecurringTransactionRepository: Partial<Repository<RecurringTransaction>>;
  let mockTransactionOperationsService: Partial<TransactionOperationsService>;

  const mockUser = { id: 1, email: 'test@example.com', auth0Id: 'auth0|123' };
  const mockUserId = 1;

  beforeEach(async () => {
    mockCreditCardsRepository = {
      create: jest.fn().mockImplementation((dto) => ({ ...dto })),
      save: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    } as Partial<Repository<CreditCard>>;

    mockBankAccountsRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    } as Partial<Repository<BankAccount>>;

    mockTransactionRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    } as Partial<Repository<Transaction>>;

    mockRecurringTransactionRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    } as Partial<Repository<RecurringTransaction>>;

    mockTransactionOperationsService = {
      linkTransactionsToRecurring: jest.fn(),
      findMatchingTransactions: jest.fn(),
      createAutomatedTransaction: jest.fn(),
      findMatchingRecurringTransaction: jest.fn(),
    } as Partial<TransactionOperationsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditCardsService,
        {
          provide: getRepositoryToken(CreditCard),
          useValue: mockCreditCardsRepository,
        },
        {
          provide: getRepositoryToken(BankAccount),
          useValue: mockBankAccountsRepository,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(RecurringTransaction),
          useValue: mockRecurringTransactionRepository,
        },
        {
          provide: TransactionOperationsService,
          useValue: mockTransactionOperationsService,
        },
      ],
    }).compile();

    service = module.get<CreditCardsService>(CreditCardsService);
  });

  describe('create', () => {
    it('should create a credit card with proper user context', async () => {
      const createDto = {
        name: 'Test Card',
        creditLimit: 1000,
        availableCredit: 1000,
        currentBalance: 0,
        billingDay: 15,
        interestRate: 0.15
      };

      const expectedCreditCard = {
        ...createDto,
        user: mockUser,
      };

      (mockCreditCardsRepository.create as jest.Mock).mockReturnValue(expectedCreditCard);
      (mockCreditCardsRepository.save as jest.Mock).mockResolvedValue(expectedCreditCard);

      const result = await service.create(createDto, mockUser as any);

      expect(mockCreditCardsRepository.create).toHaveBeenCalledWith({
        ...createDto,
        user: mockUser,
      });
      expect(result).toEqual(expectedCreditCard);
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
