import { Test, TestingModule } from '@nestjs/testing';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BankAccount } from './entities/bank-account.entity';
import { Repository } from 'typeorm';

describe('BankAccountsController', () => {
  let controller: BankAccountsController;
  let service: BankAccountsService;

  const mockBankAccountsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BankAccountsController],
      providers: [
        {
          provide: BankAccountsService,
          useValue: mockBankAccountsService,
        },
        {
          provide: getRepositoryToken(BankAccount),
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<BankAccountsController>(BankAccountsController);
    service = module.get<BankAccountsService>(BankAccountsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
