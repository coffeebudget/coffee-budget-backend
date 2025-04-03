import { Test, TestingModule } from '@nestjs/testing';
import { CreditCardsController } from './credit-cards.controller';
import { CreditCardsService } from './credit-cards.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreditCard } from './entities/credit-card.entity';
import { Repository } from 'typeorm';

describe('CreditCardsController', () => {
  let controller: CreditCardsController;
  let service: CreditCardsService;

  const mockCreditCardsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreditCardsController],
      providers: [
        {
          provide: CreditCardsService,
          useValue: mockCreditCardsService,
        },
        {
          provide: getRepositoryToken(CreditCard),
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<CreditCardsController>(CreditCardsController);
    service = module.get<CreditCardsService>(CreditCardsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
