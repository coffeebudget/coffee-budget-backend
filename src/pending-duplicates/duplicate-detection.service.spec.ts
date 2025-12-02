import { Test, TestingModule } from '@nestjs/testing';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { PendingDuplicate } from './entities/pending-duplicate.entity';
import { User } from '../users/user.entity';
import { PreventedDuplicatesService } from '../prevented-duplicates/prevented-duplicates.service';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';

describe('DuplicateDetectionService', () => {
  let service: DuplicateDetectionService;
  let transactionRepository: any;
  let pendingDuplicateRepository: any;
  let userRepository: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DuplicateDetectionService,
        RepositoryMockFactory.createRepositoryProvider(Transaction),
        RepositoryMockFactory.createRepositoryProvider(PendingDuplicate),
        RepositoryMockFactory.createRepositoryProvider(User),
        {
          provide: PreventedDuplicatesService,
          useValue: {
            createPreventedDuplicate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DuplicateDetectionService>(DuplicateDetectionService);
    transactionRepository = module.get(getRepositoryToken(Transaction));
    pendingDuplicateRepository = module.get(getRepositoryToken(PendingDuplicate));
    userRepository = module.get(getRepositoryToken(User));
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe('checkForDuplicateBeforeCreation', () => {
    const userId = 1;
    const baseTransactionData = {
      description: 'Netflix Subscription',
      amount: 15.99,
      type: 'expense' as const,
      executionDate: new Date('2025-01-15'),
      source: 'gocardless',
    };

    describe('Date Tolerance - Graduated Scoring', () => {
      it('should detect duplicates with same date (100% date score)', async () => {
        const existingTransaction = {
          id: 1,
          description: 'Netflix Subscription',
          amount: 15.99,
          type: 'expense',
          executionDate: new Date('2025-01-15'),
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const result = await service.checkForDuplicateBeforeCreation(
          baseTransactionData,
          userId,
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.similarityScore).toBe(100);
        expect(result.confidence).toBe('high');
        expect(result.shouldPrevent).toBe(true);
        expect(result.reason).toContain('Exact match');
      });

      it('should detect duplicates with ±1 day difference (80% date score)', async () => {
        const existingTransaction = {
          id: 1,
          description: 'Netflix Subscription',
          amount: 15.99,
          type: 'expense',
          executionDate: new Date('2025-01-16'), // +1 day
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const result = await service.checkForDuplicateBeforeCreation(
          baseTransactionData,
          userId,
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.similarityScore).toBeGreaterThanOrEqual(80);
        expect(result.confidence).toBe('high');
        expect(result.shouldCreatePending).toBe(true);
        expect(result.reason).toContain('similarity');
      });

      it('should detect duplicates with ±2 days difference (60% date score)', async () => {
        const existingTransaction = {
          id: 1,
          description: 'Netflix Subscription',
          amount: 15.99,
          type: 'expense',
          executionDate: new Date('2025-01-17'), // +2 days
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const result = await service.checkForDuplicateBeforeCreation(
          baseTransactionData,
          userId,
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.similarityScore).toBeGreaterThanOrEqual(72);
        // Score is 92% (30+10+40+12) so it gets 'high' confidence (>90%)
        expect(result.confidence).toBe('high');
        expect(result.shouldCreatePending).toBe(true);
      });

      it('should detect duplicates with 3-7 days difference (40% date score)', async () => {
        const existingTransaction = {
          id: 1,
          description: 'Netflix Subscription',
          amount: 15.99,
          type: 'expense',
          executionDate: new Date('2025-01-20'), // +5 days
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const result = await service.checkForDuplicateBeforeCreation(
          baseTransactionData,
          userId,
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.similarityScore).toBeGreaterThanOrEqual(60);
        // Score is 88% (30+10+40+8) so it gets 'high' confidence (>80%)
        expect(result.confidence).toBe('high');
        expect(result.shouldCreatePending).toBe(true);
      });

      it('should detect duplicates with 8-14 days difference (0% date score but within threshold)', async () => {
        const existingTransaction = {
          id: 1,
          description: 'Netflix Subscription',
          amount: 15.99,
          type: 'expense',
          executionDate: new Date('2025-01-23'), // +8 days
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const result = await service.checkForDuplicateBeforeCreation(
          baseTransactionData,
          userId,
        );

        // With 0% date score but 100% on other criteria (30+10+40=80%)
        // Final score = 80%
        expect(result.similarityScore).toBeLessThan(90);
        expect(result.isDuplicate).toBe(true); // Still flagged due to high other scores
        expect(result.shouldCreatePending).toBe(true);
      });

      it('should NOT detect duplicates with >14 days difference (early rejection)', async () => {
        const existingTransaction = {
          id: 1,
          description: 'Netflix Subscription',
          amount: 15.99,
          type: 'expense',
          executionDate: new Date('2025-01-30'), // +15 days
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const result = await service.checkForDuplicateBeforeCreation(
          baseTransactionData,
          userId,
        );

        // Early rejection due to >14 days difference
        expect(result.isDuplicate).toBe(false);
        expect(result.similarityScore).toBe(0);
        expect(result.shouldCreatePending).toBe(false);
      });

      it('should NOT detect duplicates for recurring transactions from different months (647 days apart)', async () => {
        const existingTransaction = {
          id: 1,
          description: 'ATM Withdrawal',
          amount: 50.00,
          type: 'expense',
          executionDate: new Date('2023-12-21'), // 647 days before
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const newTransactionData = {
          description: 'ATM Withdrawal',
          amount: 50.00,
          type: 'expense' as const,
          executionDate: new Date('2025-09-29'),
          source: 'gocardless',
        };

        const result = await service.checkForDuplicateBeforeCreation(
          newTransactionData,
          userId,
        );

        // Should be rejected immediately due to >14 days difference
        expect(result.isDuplicate).toBe(false);
        expect(result.similarityScore).toBe(0);
        expect(result.shouldCreatePending).toBe(false);
      });

      it('should handle transactions with very different dates and descriptions', async () => {
        const existingTransaction = {
          id: 1,
          description: 'Amazon Purchase',
          amount: 15.99,
          type: 'expense',
          executionDate: new Date('2025-01-23'), // +8 days
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const result = await service.checkForDuplicateBeforeCreation(
          baseTransactionData,
          userId,
        );

        // Different description + no date score = low similarity
        expect(result.isDuplicate).toBe(false);
        expect(result.similarityScore).toBeLessThan(60);
      });
    });

    describe('Amount Tolerance', () => {
      it('should match amounts with floating-point tolerance (exact)', async () => {
        const existingTransaction = {
          id: 1,
          description: 'Netflix Subscription',
          amount: 15.99,
          type: 'expense',
          executionDate: new Date('2025-01-15'),
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const result = await service.checkForDuplicateBeforeCreation(
          baseTransactionData,
          userId,
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.similarityScore).toBe(100);
      });

      it('should match amounts within $0.01 tolerance', async () => {
        const existingTransaction = {
          id: 1,
          description: 'Netflix Subscription',
          amount: 15.98, // $0.01 difference
          type: 'expense',
          executionDate: new Date('2025-01-15'),
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const result = await service.checkForDuplicateBeforeCreation(
          baseTransactionData,
          userId,
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.similarityScore).toBeGreaterThanOrEqual(90);
      });

      it('should NOT match amounts beyond tolerance threshold', async () => {
        const existingTransaction = {
          id: 1,
          description: 'Netflix Subscription',
          amount: 15.50, // $0.49 difference
          type: 'expense',
          executionDate: new Date('2025-01-15'),
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const result = await service.checkForDuplicateBeforeCreation(
          baseTransactionData,
          userId,
        );

        // Should still flag due to description match but lower score
        expect(result.similarityScore).toBeLessThan(80);
      });
    });

    describe('Confidence Thresholds', () => {
      it('should prevent creation for 98%+ similarity (near-exact)', async () => {
        const existingTransaction = {
          id: 1,
          description: 'Netflix Subscription',
          amount: 15.99,
          type: 'expense',
          executionDate: new Date('2025-01-15'),
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const result = await service.checkForDuplicateBeforeCreation(
          baseTransactionData,
          userId,
        );

        expect(result.similarityScore).toBe(100);
        expect(result.shouldPrevent).toBe(true);
        expect(result.shouldCreatePending).toBe(false);
      });

      it('should create pending duplicate for 70-97% similarity', async () => {
        const existingTransaction = {
          id: 1,
          description: 'Netflix Subscription',
          amount: 15.99,
          type: 'expense',
          executionDate: new Date('2025-01-16'), // +1 day for ~96% score
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const result = await service.checkForDuplicateBeforeCreation(
          baseTransactionData,
          userId,
        );

        expect(result.similarityScore).toBeGreaterThanOrEqual(70);
        expect(result.similarityScore).toBeLessThan(98);
        expect(result.shouldPrevent).toBe(false);
        expect(result.shouldCreatePending).toBe(true);
      });

      it('should allow creation for <70% similarity', async () => {
        const existingTransaction = {
          id: 1,
          description: 'Amazon Purchase',
          amount: 25.99,
          type: 'expense',
          executionDate: new Date('2025-01-20'),
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const result = await service.checkForDuplicateBeforeCreation(
          baseTransactionData,
          userId,
        );

        expect(result.similarityScore).toBeLessThan(70);
        expect(result.shouldPrevent).toBe(false);
        expect(result.shouldCreatePending).toBe(false);
      });
    });

    describe('Real-World Scenarios', () => {
      it('should handle bank processing delays (same transaction, next day)', async () => {
        const existingTransaction = {
          id: 1,
          description: 'STRIPE PAYMENT',
          amount: 49.99,
          type: 'expense',
          executionDate: new Date('2025-01-15'),
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const newTransactionData = {
          description: 'STRIPE PAYMENT',
          amount: 49.99,
          type: 'expense' as const,
          executionDate: new Date('2025-01-16'), // Next day
          source: 'gocardless',
        };

        const result = await service.checkForDuplicateBeforeCreation(
          newTransactionData,
          userId,
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.similarityScore).toBeGreaterThanOrEqual(80);
        expect(result.shouldCreatePending).toBe(true);
        expect(result.confidence).toBe('high');
      });

      it('should handle recurring payments from different months (NOT duplicates)', async () => {
        const existingTransaction = {
          id: 1,
          description: 'Spotify Premium',
          amount: 9.99,
          type: 'expense',
          executionDate: new Date('2024-12-14'),
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const newTransactionData = {
          description: 'Spotify Premium',
          amount: 9.99,
          type: 'expense' as const,
          executionDate: new Date('2025-01-15'), // Next month billing (32 days later)
          source: 'gocardless',
        };

        const result = await service.checkForDuplicateBeforeCreation(
          newTransactionData,
          userId,
        );

        // Should NOT flag as duplicate due to >14 days difference (32 days)
        // This is intentional - monthly subscriptions are separate transactions, not duplicates
        expect(result.isDuplicate).toBe(false);
        expect(result.similarityScore).toBe(0);
        expect(result.shouldCreatePending).toBe(false);
      });

      it('should handle GoCardless pending vs posted transactions', async () => {
        const existingTransaction = {
          id: 1,
          description: 'PENDING: AMAZON MARKETPLACE',
          amount: 34.99,
          type: 'expense',
          executionDate: new Date('2025-01-15'),
          source: 'gocardless',
          createdAt: new Date(),
        } as Transaction;

        transactionRepository.find.mockResolvedValue([existingTransaction]);

        const newTransactionData = {
          description: 'AMAZON MARKETPLACE',
          amount: 34.99,
          type: 'expense' as const,
          executionDate: new Date('2025-01-16'), // Posted next day
          source: 'gocardless',
        };

        const result = await service.checkForDuplicateBeforeCreation(
          newTransactionData,
          userId,
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.similarityScore).toBeGreaterThanOrEqual(70);
        expect(result.shouldCreatePending).toBe(true);
      });
    });
  });
});
