import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GocardlessController } from './gocardless.controller';
import { GocardlessService } from './gocardless.service';
import { GocardlessSchedulerService } from './gocardless-scheduler.service';

describe('GocardlessController', () => {
  let controller: GocardlessController;
  let service: GocardlessService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GocardlessController],
      providers: [
        {
          provide: GocardlessService,
          useValue: {
            createAccessToken: jest.fn(),
            getInstitutions: jest.fn(),
            getItalianBanks: jest.fn(),
            createEndUserAgreement: jest.fn(),
            createRequisition: jest.fn(),
            getRequisition: jest.fn(),
            getAccountDetails: jest.fn(),
            getAccountBalances: jest.fn(),
            getAccountTransactions: jest.fn(),
            getTransactionsFlow: jest.fn(),
          },
        },
        {
          provide: GocardlessSchedulerService,
          useValue: {
            dailyBankSync: jest.fn(),
            getUsersWithGocardlessAccounts: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<GocardlessController>(GocardlessController);
    service = module.get<GocardlessService>(GocardlessService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should have service injected', () => {
    expect(service).toBeDefined();
  });
});
