import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GocardlessService } from './gocardless.service';

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
