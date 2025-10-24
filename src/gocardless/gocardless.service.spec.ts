import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GocardlessService } from './gocardless.service';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';

describe('GocardlessService', () => {
  let service: GocardlessService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GocardlessService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'GOCARDLESS_SECRET_ID':
                  return 'test_secret_id';
                case 'GOCARDLESS_SECRET_KEY':
                  return 'test_secret_key';
                default:
                  return null;
              }
            }),
          },
        },
        {
          provide: getRepositoryToken(BankAccount),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CreditCard),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GocardlessService>(GocardlessService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have correct base URL', () => {
    expect(service['baseUrl']).toBe(
      'https://bankaccountdata.gocardless.com/api/v2',
    );
  });

  it('should initialize with null access token', () => {
    expect(service['accessToken']).toBeNull();
    expect(service['tokenExpiry']).toBeNull();
  });

  describe('getItalianBanks', () => {
    it('should be defined', () => {
      expect(service.getItalianBanks).toBeDefined();
    });
  });

  describe('getTransactionsFlow', () => {
    it('should be defined', () => {
      expect(service.getTransactionsFlow).toBeDefined();
    });
  });
});
