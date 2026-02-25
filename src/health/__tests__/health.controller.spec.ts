import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../health.controller';
import {
  HealthCheckService,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  HealthCheckResult,
} from '@nestjs/terminus';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: HealthCheckService;
  let dbIndicator: TypeOrmHealthIndicator;
  let memoryIndicator: MemoryHealthIndicator;

  const mockHealthResult: HealthCheckResult = {
    status: 'ok',
    info: { database: { status: 'up' } },
    error: {},
    details: { database: { status: 'up' } },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: {
            check: jest.fn().mockResolvedValue(mockHealthResult),
          },
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: {
            pingCheck: jest.fn(),
          },
        },
        {
          provide: MemoryHealthIndicator,
          useValue: {
            checkHeap: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);
    dbIndicator = module.get<TypeOrmHealthIndicator>(TypeOrmHealthIndicator);
    memoryIndicator = module.get<MemoryHealthIndicator>(MemoryHealthIndicator);
  });

  describe('GET /health', () => {
    it('should return liveness status', async () => {
      const result = await controller.liveness();

      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('GET /health/ready', () => {
    it('should call health check service with DB and memory indicators', async () => {
      await controller.readiness();

      expect(healthCheckService.check).toHaveBeenCalledWith([
        expect.any(Function),
        expect.any(Function),
      ]);
    });

    it('should return health check result', async () => {
      const result = await controller.readiness();

      expect(result).toEqual(mockHealthResult);
    });

    it('should check database connection via ping', async () => {
      const checkFns: Array<() => Promise<any>> = [];
      (healthCheckService.check as jest.Mock).mockImplementation(
        (indicators: Array<() => Promise<any>>) => {
          checkFns.push(...indicators);
          return Promise.resolve(mockHealthResult);
        },
      );

      await controller.readiness();

      // Execute the first indicator function (DB check)
      await checkFns[0]();
      expect(dbIndicator.pingCheck).toHaveBeenCalledWith('database');
    });

    it('should check memory heap usage', async () => {
      const checkFns: Array<() => Promise<any>> = [];
      (healthCheckService.check as jest.Mock).mockImplementation(
        (indicators: Array<() => Promise<any>>) => {
          checkFns.push(...indicators);
          return Promise.resolve(mockHealthResult);
        },
      );

      await controller.readiness();

      // Execute the second indicator function (memory check)
      await checkFns[1]();
      expect(memoryIndicator.checkHeap).toHaveBeenCalledWith(
        'memory_heap',
        300 * 1024 * 1024,
      );
    });
  });
});
