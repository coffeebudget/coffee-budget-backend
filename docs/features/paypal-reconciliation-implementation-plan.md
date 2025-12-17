# PayPal Reconciliation Implementation Plan

**Feature**: Automatic reconciliation of PayPal account transactions with bank PayPal transactions

**Goal**: Enrich bank transactions with detailed PayPal merchant information and prevent duplicate counting in analytics

**Priority**: Medium-High
**Estimated Effort**: 2-3 days
**TDD Required**: Yes (write tests first)

---

## Overview

When a PayPal account is connected via GoCardless, transactions appear twice:
- **Bank transaction**: "PAYPAL *AMAZON" (limited detail)
- **PayPal transaction**: "Amazon.it - Order #123456" (full detail)

This feature automatically:
1. Detects matching transactions
2. Enriches bank transaction with PayPal details
3. Marks PayPal transaction as reconciled
4. Excludes reconciled PayPal transaction from analytics

---

## Phase 1: Database Schema Changes

### Migration: Add Reconciliation Fields

**File**: `src/migrations/{timestamp}-add-reconciliation-fields.ts`

```typescript
export class AddReconciliationFields1234567890123 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add reconciledWithTransactionId field
    await queryRunner.addColumn(
      'transaction',
      new TableColumn({
        name: 'reconciledWithTransactionId',
        type: 'integer',
        isNullable: true,
      }),
    );

    // Add foreign key constraint
    await queryRunner.createForeignKey(
      'transaction',
      new TableForeignKey({
        name: 'FK_transaction_reconciled_with',
        columnNames: ['reconciledWithTransactionId'],
        referencedTableName: 'transaction',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    // Add index for performance
    await queryRunner.createIndex(
      'transaction',
      new TableIndex({
        name: 'IDX_transaction_reconciled_with',
        columnNames: ['reconciledWithTransactionId'],
      }),
    );

    // Add reconciliation status enum field
    await queryRunner.query(`
      CREATE TYPE "transaction_reconciliation_status_enum" AS ENUM(
        'not_reconciled',
        'reconciled_as_primary',
        'reconciled_as_secondary'
      )
    `);

    await queryRunner.addColumn(
      'transaction',
      new TableColumn({
        name: 'reconciliationStatus',
        type: 'transaction_reconciliation_status_enum',
        default: "'not_reconciled'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('transaction', 'reconciliationStatus');
    await queryRunner.query(`DROP TYPE "transaction_reconciliation_status_enum"`);
    await queryRunner.dropIndex('transaction', 'IDX_transaction_reconciled_with');
    await queryRunner.dropForeignKey('transaction', 'FK_transaction_reconciled_with');
    await queryRunner.dropColumn('transaction', 'reconciledWithTransactionId');
  }
}
```

### Entity Update

**File**: `src/transactions/transaction.entity.ts`

```typescript
@Entity()
export class Transaction {
  // ... existing fields ...

  @ManyToOne(() => Transaction, { nullable: true })
  @JoinColumn({ name: 'reconciledWithTransactionId' })
  reconciledWithTransaction: Transaction | null;

  @Column({ nullable: true })
  reconciledWithTransactionId: number | null;

  @Column({
    type: 'enum',
    enum: ['not_reconciled', 'reconciled_as_primary', 'reconciled_as_secondary'],
    default: 'not_reconciled',
  })
  reconciliationStatus: 'not_reconciled' | 'reconciled_as_primary' | 'reconciled_as_secondary';
}
```

**Test**: `src/transactions/transaction.entity.spec.ts`
```typescript
describe('Transaction Entity - Reconciliation Fields', () => {
  it('should have reconciledWithTransactionId field', () => {
    const transaction = new Transaction();
    transaction.reconciledWithTransactionId = 123;
    expect(transaction.reconciledWithTransactionId).toBe(123);
  });

  it('should have reconciliationStatus with default value', () => {
    const transaction = new Transaction();
    expect(transaction.reconciliationStatus).toBe('not_reconciled');
  });

  it('should allow setting reconciliation status', () => {
    const transaction = new Transaction();
    transaction.reconciliationStatus = 'reconciled_as_secondary';
    expect(transaction.reconciliationStatus).toBe('reconciled_as_secondary');
  });
});
```

---

## Phase 2: Reconciliation Service

### Service: GocardlessPaypalReconciliationService

**File**: `src/gocardless/gocardless-paypal-reconciliation.service.ts`

**Test File**: `src/gocardless/gocardless-paypal-reconciliation.service.spec.ts`

#### Test Cases (Write First - TDD)

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { GocardlessPaypalReconciliationService } from './gocardless-paypal-reconciliation.service';
import { Transaction } from '../transactions/transaction.entity';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('GocardlessPaypalReconciliationService', () => {
  let service: GocardlessPaypalReconciliationService;
  let transactionRepository: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GocardlessPaypalReconciliationService,
        RepositoryMockFactory.createRepositoryProvider(Transaction),
      ],
    }).compile();

    service = module.get<GocardlessPaypalReconciliationService>(
      GocardlessPaypalReconciliationService,
    );
    transactionRepository = module.get(getRepositoryToken(Transaction));
  });

  describe('findMatchingBankTransaction', () => {
    it('should find matching transaction with exact amount and same date', async () => {
      // Arrange
      const paypalTransaction = {
        id: 1,
        amount: 50.00,
        executionDate: new Date('2024-12-01'),
        type: 'expense',
        source: 'gocardless',
        merchantName: 'Amazon.it',
      } as Transaction;

      const bankTransaction = {
        id: 2,
        amount: 50.00,
        executionDate: new Date('2024-12-01'),
        type: 'expense',
        source: 'gocardless',
        description: 'PAYPAL *AMAZON',
      } as Transaction;

      transactionRepository.createQueryBuilder = jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(bankTransaction),
      });

      // Act
      const result = await service.findMatchingBankTransaction(paypalTransaction, 10);

      // Assert
      expect(result).toEqual(bankTransaction);
    });

    it('should find matching transaction within date tolerance (±3 days)', async () => {
      // Arrange
      const paypalTransaction = {
        id: 1,
        amount: 50.00,
        executionDate: new Date('2024-12-01'),
        type: 'expense',
        source: 'gocardless',
        merchantName: 'Amazon.it',
      } as Transaction;

      const bankTransaction = {
        id: 2,
        amount: 50.00,
        executionDate: new Date('2024-12-03'), // 2 days later
        type: 'expense',
        source: 'gocardless',
        description: 'PAYPAL *AMAZON',
      } as Transaction;

      transactionRepository.createQueryBuilder = jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(bankTransaction),
      });

      // Act
      const result = await service.findMatchingBankTransaction(paypalTransaction, 10);

      // Assert
      expect(result).toEqual(bankTransaction);
    });

    it('should find matching transaction with amount tolerance (±1%)', async () => {
      // Arrange
      const paypalTransaction = {
        id: 1,
        amount: 50.00,
        executionDate: new Date('2024-12-01'),
        type: 'expense',
        source: 'gocardless',
        merchantName: 'Amazon.it',
      } as Transaction;

      const bankTransaction = {
        id: 2,
        amount: 50.25, // Within 1% tolerance
        executionDate: new Date('2024-12-01'),
        type: 'expense',
        source: 'gocardless',
        description: 'PAYPAL *AMAZON',
      } as Transaction;

      transactionRepository.createQueryBuilder = jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(bankTransaction),
      });

      // Act
      const result = await service.findMatchingBankTransaction(paypalTransaction, 10);

      // Assert
      expect(result).toEqual(bankTransaction);
    });

    it('should return null when no matching transaction found', async () => {
      // Arrange
      const paypalTransaction = {
        id: 1,
        amount: 50.00,
        executionDate: new Date('2024-12-01'),
        type: 'expense',
        source: 'gocardless',
        merchantName: 'Amazon.it',
      } as Transaction;

      transactionRepository.createQueryBuilder = jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      // Act
      const result = await service.findMatchingBankTransaction(paypalTransaction, 10);

      // Assert
      expect(result).toBeNull();
    });

    it('should exclude already reconciled transactions', async () => {
      // Arrange
      const paypalTransaction = {
        id: 1,
        amount: 50.00,
        executionDate: new Date('2024-12-01'),
        type: 'expense',
        source: 'gocardless',
        merchantName: 'Amazon.it',
      } as Transaction;

      transactionRepository.createQueryBuilder = jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      // Act
      await service.findMatchingBankTransaction(paypalTransaction, 10);

      // Assert
      const queryBuilder = transactionRepository.createQueryBuilder();
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('reconciliationStatus'),
      );
    });

    it('should only match transactions with "paypal" in description', async () => {
      // Arrange
      const paypalTransaction = {
        id: 1,
        amount: 50.00,
        executionDate: new Date('2024-12-01'),
        type: 'expense',
        source: 'gocardless',
        merchantName: 'Amazon.it',
      } as Transaction;

      transactionRepository.createQueryBuilder = jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      // Act
      await service.findMatchingBankTransaction(paypalTransaction, 10);

      // Assert
      const queryBuilder = transactionRepository.createQueryBuilder();
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(transaction.description) LIKE'),
      );
    });
  });

  describe('enrichBankTransactionDescription', () => {
    it('should enrich bank transaction with PayPal merchant name', () => {
      // Arrange
      const bankDescription = 'PAYPAL *AMAZON';
      const paypalMerchantName = 'Amazon.it';

      // Act
      const result = service.enrichBankTransactionDescription(
        bankDescription,
        paypalMerchantName,
      );

      // Assert
      expect(result).toBe('PAYPAL *AMAZON (Amazon.it)');
    });

    it('should not duplicate merchant name if already in description', () => {
      // Arrange
      const bankDescription = 'PAYPAL *AMAZON (Amazon.it)';
      const paypalMerchantName = 'Amazon.it';

      // Act
      const result = service.enrichBankTransactionDescription(
        bankDescription,
        paypalMerchantName,
      );

      // Assert
      expect(result).toBe('PAYPAL *AMAZON (Amazon.it)');
    });

    it('should handle null merchant name', () => {
      // Arrange
      const bankDescription = 'PAYPAL *AMAZON';
      const paypalMerchantName = null;

      // Act
      const result = service.enrichBankTransactionDescription(
        bankDescription,
        paypalMerchantName,
      );

      // Assert
      expect(result).toBe('PAYPAL *AMAZON');
    });
  });

  describe('reconcilePaypalTransaction', () => {
    it('should reconcile PayPal transaction with matching bank transaction', async () => {
      // Arrange
      const paypalTransaction = {
        id: 1,
        amount: 50.00,
        executionDate: new Date('2024-12-01'),
        type: 'expense',
        source: 'gocardless',
        merchantName: 'Amazon.it',
        description: 'Amazon.it - Order #123456',
        reconciliationStatus: 'not_reconciled',
      } as Transaction;

      const bankTransaction = {
        id: 2,
        amount: 50.00,
        executionDate: new Date('2024-12-01'),
        type: 'expense',
        source: 'gocardless',
        description: 'PAYPAL *AMAZON',
        reconciliationStatus: 'not_reconciled',
      } as Transaction;

      jest.spyOn(service, 'findMatchingBankTransaction').mockResolvedValue(bankTransaction);
      transactionRepository.save = jest.fn().mockImplementation((transactions) =>
        Promise.resolve(transactions)
      );

      // Act
      const result = await service.reconcilePaypalTransaction(paypalTransaction, 10);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.reconciledWithTransactionId).toBe(bankTransaction.id);
      expect(result?.reconciliationStatus).toBe('reconciled_as_primary');
      expect(transactionRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: bankTransaction.id,
            description: 'PAYPAL *AMAZON (Amazon.it)',
            reconciliationStatus: 'reconciled_as_primary',
          }),
          expect.objectContaining({
            id: paypalTransaction.id,
            reconciledWithTransactionId: bankTransaction.id,
            reconciliationStatus: 'reconciled_as_secondary',
          }),
        ]),
      );
    });

    it('should return null when no matching bank transaction found', async () => {
      // Arrange
      const paypalTransaction = {
        id: 1,
        amount: 50.00,
        executionDate: new Date('2024-12-01'),
        type: 'expense',
        source: 'gocardless',
        merchantName: 'Amazon.it',
        description: 'Amazon.it - Order #123456',
        reconciliationStatus: 'not_reconciled',
      } as Transaction;

      jest.spyOn(service, 'findMatchingBankTransaction').mockResolvedValue(null);

      // Act
      const result = await service.reconcilePaypalTransaction(paypalTransaction, 10);

      // Assert
      expect(result).toBeNull();
    });

    it('should not reconcile already reconciled transactions', async () => {
      // Arrange
      const paypalTransaction = {
        id: 1,
        amount: 50.00,
        executionDate: new Date('2024-12-01'),
        type: 'expense',
        source: 'gocardless',
        merchantName: 'Amazon.it',
        description: 'Amazon.it - Order #123456',
        reconciliationStatus: 'reconciled_as_secondary',
        reconciledWithTransactionId: 2,
      } as Transaction;

      // Act
      const result = await service.reconcilePaypalTransaction(paypalTransaction, 10);

      // Assert
      expect(result).toBeNull();
      expect(service.findMatchingBankTransaction).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and log them', async () => {
      // Arrange
      const paypalTransaction = {
        id: 1,
        amount: 50.00,
        executionDate: new Date('2024-12-01'),
        type: 'expense',
        source: 'gocardless',
        merchantName: 'Amazon.it',
        description: 'Amazon.it - Order #123456',
        reconciliationStatus: 'not_reconciled',
      } as Transaction;

      jest.spyOn(service, 'findMatchingBankTransaction').mockRejectedValue(
        new Error('Database error'),
      );

      const loggerSpy = jest.spyOn(service['logger'], 'error');

      // Act & Assert
      await expect(
        service.reconcilePaypalTransaction(paypalTransaction, 10),
      ).rejects.toThrow('Database error');
      expect(loggerSpy).toHaveBeenCalled();
    });
  });

  describe('reconcileAllUnreconciledPaypalTransactions', () => {
    it('should reconcile all unreconciled PayPal transactions for a user', async () => {
      // Arrange
      const userId = 10;
      const unreconciledTransactions = [
        {
          id: 1,
          amount: 50.00,
          executionDate: new Date('2024-12-01'),
          type: 'expense',
          source: 'gocardless',
          merchantName: 'Amazon.it',
          reconciliationStatus: 'not_reconciled',
        },
        {
          id: 3,
          amount: 30.00,
          executionDate: new Date('2024-12-02'),
          type: 'expense',
          source: 'gocardless',
          merchantName: 'eBay',
          reconciliationStatus: 'not_reconciled',
        },
      ] as Transaction[];

      transactionRepository.find = jest.fn().mockResolvedValue(unreconciledTransactions);

      jest.spyOn(service, 'reconcilePaypalTransaction')
        .mockResolvedValueOnce({ id: 1, reconciledWithTransactionId: 2 } as Transaction)
        .mockResolvedValueOnce(null);

      // Act
      const result = await service.reconcileAllUnreconciledPaypalTransactions(userId);

      // Assert
      expect(result.totalProcessed).toBe(2);
      expect(result.successfulReconciliations).toBe(1);
      expect(result.failedReconciliations).toBe(1);
    });

    it('should return empty result when no unreconciled transactions found', async () => {
      // Arrange
      const userId = 10;
      transactionRepository.find = jest.fn().mockResolvedValue([]);

      // Act
      const result = await service.reconcileAllUnreconciledPaypalTransactions(userId);

      // Assert
      expect(result.totalProcessed).toBe(0);
      expect(result.successfulReconciliations).toBe(0);
      expect(result.failedReconciliations).toBe(0);
    });
  });
});
```

#### Service Implementation

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';

@Injectable()
export class GocardlessPaypalReconciliationService {
  private readonly logger = new Logger(GocardlessPaypalReconciliationService.name);
  private readonly DATE_TOLERANCE_DAYS = 3;
  private readonly AMOUNT_TOLERANCE_PERCENT = 1; // 1%

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  /**
   * Find matching bank transaction for a PayPal transaction
   * Matches based on: amount (±1%), date (±3 days), type, and "paypal" in description
   */
  async findMatchingBankTransaction(
    paypalTransaction: Transaction,
    userId: number,
  ): Promise<Transaction | null> {
    if (!paypalTransaction.executionDate) {
      return null;
    }

    // Calculate date range
    const startDate = new Date(paypalTransaction.executionDate);
    startDate.setDate(startDate.getDate() - this.DATE_TOLERANCE_DAYS);

    const endDate = new Date(paypalTransaction.executionDate);
    endDate.setDate(endDate.getDate() + this.DATE_TOLERANCE_DAYS);

    // Calculate amount tolerance
    const tolerance = paypalTransaction.amount * (this.AMOUNT_TOLERANCE_PERCENT / 100);
    const minAmount = paypalTransaction.amount - tolerance;
    const maxAmount = paypalTransaction.amount + tolerance;

    try {
      const bankTransaction = await this.transactionRepository
        .createQueryBuilder('transaction')
        .innerJoin('transaction.user', 'user')
        .leftJoin('transaction.bankAccount', 'bankAccount')
        .where('user.id = :userId', { userId })
        .andWhere('transaction.type = :type', { type: paypalTransaction.type })
        .andWhere('transaction.executionDate BETWEEN :startDate AND :endDate', {
          startDate,
          endDate,
        })
        .andWhere('transaction.amount BETWEEN :minAmount AND :maxAmount', {
          minAmount,
          maxAmount,
        })
        .andWhere('LOWER(transaction.description) LIKE :paypal', { paypal: '%paypal%' })
        .andWhere('transaction.reconciliationStatus = :status', { status: 'not_reconciled' })
        .andWhere('transaction.id != :paypalTransactionId', {
          paypalTransactionId: paypalTransaction.id,
        })
        .orderBy('ABS(transaction.amount - :exactAmount)', 'ASC')
        .addOrderBy('ABS(EXTRACT(EPOCH FROM (transaction.executionDate - :exactDate)))', 'ASC')
        .setParameters({
          exactAmount: paypalTransaction.amount,
          exactDate: paypalTransaction.executionDate,
        })
        .getOne();

      return bankTransaction;
    } catch (error) {
      this.logger.error(
        `Error finding matching bank transaction for PayPal transaction ${paypalTransaction.id}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Enrich bank transaction description with PayPal merchant name
   */
  enrichBankTransactionDescription(
    bankDescription: string,
    paypalMerchantName: string | null,
  ): string {
    if (!paypalMerchantName) {
      return bankDescription;
    }

    // Check if merchant name already in description
    if (bankDescription.includes(paypalMerchantName)) {
      return bankDescription;
    }

    return `${bankDescription} (${paypalMerchantName})`;
  }

  /**
   * Reconcile a PayPal transaction with matching bank transaction
   */
  async reconcilePaypalTransaction(
    paypalTransaction: Transaction,
    userId: number,
  ): Promise<Transaction | null> {
    try {
      // Skip if already reconciled
      if (paypalTransaction.reconciliationStatus !== 'not_reconciled') {
        this.logger.debug(
          `PayPal transaction ${paypalTransaction.id} is already reconciled, skipping`,
        );
        return null;
      }

      // Find matching bank transaction
      const bankTransaction = await this.findMatchingBankTransaction(
        paypalTransaction,
        userId,
      );

      if (!bankTransaction) {
        this.logger.debug(
          `No matching bank transaction found for PayPal transaction ${paypalTransaction.id}`,
        );
        return null;
      }

      // Enrich bank transaction description
      bankTransaction.description = this.enrichBankTransactionDescription(
        bankTransaction.description,
        paypalTransaction.merchantName,
      );
      bankTransaction.reconciliationStatus = 'reconciled_as_primary';

      // Mark PayPal transaction as reconciled
      paypalTransaction.reconciledWithTransactionId = bankTransaction.id;
      paypalTransaction.reconciliationStatus = 'reconciled_as_secondary';

      // Save both transactions
      await this.transactionRepository.save([bankTransaction, paypalTransaction]);

      this.logger.log(
        `Successfully reconciled PayPal transaction ${paypalTransaction.id} with bank transaction ${bankTransaction.id}`,
      );

      return bankTransaction;
    } catch (error) {
      this.logger.error(
        `Error reconciling PayPal transaction ${paypalTransaction.id}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Reconcile all unreconciled PayPal transactions for a user
   */
  async reconcileAllUnreconciledPaypalTransactions(
    userId: number,
  ): Promise<{
    totalProcessed: number;
    successfulReconciliations: number;
    failedReconciliations: number;
  }> {
    this.logger.log(`Starting reconciliation for user ${userId}`);

    // Find all unreconciled PayPal transactions
    const unreconciledTransactions = await this.transactionRepository.find({
      where: {
        user: { id: userId },
        source: 'gocardless',
        reconciliationStatus: 'not_reconciled',
        merchantName: Not(IsNull()), // Has merchant name (likely PayPal account transaction)
      },
      order: {
        executionDate: 'DESC',
      },
    });

    this.logger.log(
      `Found ${unreconciledTransactions.length} unreconciled PayPal transactions for user ${userId}`,
    );

    let successfulReconciliations = 0;
    let failedReconciliations = 0;

    for (const transaction of unreconciledTransactions) {
      try {
        const result = await this.reconcilePaypalTransaction(transaction, userId);
        if (result) {
          successfulReconciliations++;
        } else {
          failedReconciliations++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to reconcile transaction ${transaction.id}: ${error.message}`,
        );
        failedReconciliations++;
      }
    }

    this.logger.log(
      `Reconciliation complete for user ${userId}: ${successfulReconciliations} successful, ${failedReconciliations} failed`,
    );

    return {
      totalProcessed: unreconciledTransactions.length,
      successfulReconciliations,
      failedReconciliations,
    };
  }
}
```

---

## Phase 3: Integration with GoCardless Sync

### Update GocardlessSchedulerService

**File**: `src/gocardless/gocardless-scheduler.service.ts`

**Test Addition**:
```typescript
describe('GocardlessSchedulerService - Reconciliation', () => {
  it('should run PayPal reconciliation after syncing PayPal account', async () => {
    // Arrange
    const userId = 10;
    const paypalAccount = {
      id: 1,
      institutionId: 'PAYPAL_PSDES_PSP',
      iban: 'PP12345678',
    };

    jest.spyOn(reconciliationService, 'reconcileAllUnreconciledPaypalTransactions')
      .mockResolvedValue({
        totalProcessed: 5,
        successfulReconciliations: 4,
        failedReconciliations: 1,
      });

    // Act
    await service.syncAccount(userId, paypalAccount);

    // Assert
    expect(reconciliationService.reconcileAllUnreconciledPaypalTransactions)
      .toHaveBeenCalledWith(userId);
  });

  it('should not fail overall sync if reconciliation fails', async () => {
    // Arrange
    const userId = 10;
    const paypalAccount = {
      id: 1,
      institutionId: 'PAYPAL_PSDES_PSP',
      iban: 'PP12345678',
    };

    jest.spyOn(reconciliationService, 'reconcileAllUnreconciledPaypalTransactions')
      .mockRejectedValue(new Error('Reconciliation error'));

    // Act & Assert
    await expect(service.syncAccount(userId, paypalAccount)).resolves.not.toThrow();
  });
});
```

**Implementation**:
```typescript
async dailyBankSync(): Promise<void> {
  // ... existing sync logic ...

  // After syncing all accounts, run reconciliation for PayPal transactions
  for (const user of users) {
    try {
      const result = await this.paypalReconciliationService
        .reconcileAllUnreconciledPaypalTransactions(user.id);

      this.logger.log(
        `PayPal reconciliation for user ${user.id}: ` +
        `${result.successfulReconciliations}/${result.totalProcessed} successful`,
      );
    } catch (error) {
      this.logger.error(
        `PayPal reconciliation failed for user ${user.id}: ${error.message}`,
      );
      // Don't fail the overall sync if reconciliation fails
    }
  }
}
```

---

## Phase 4: Update Transaction Queries

### Filter Reconciled Transactions in Analytics

**File**: `src/dashboard/dashboard.service.ts`

**Test Cases**:
```typescript
describe('DashboardService - Exclude Reconciled Transactions', () => {
  it('should exclude reconciled_as_secondary transactions from total expenses', async () => {
    // Arrange
    const userId = 10;
    const transactions = [
      { amount: 50, reconciliationStatus: 'not_reconciled' },
      { amount: 30, reconciliationStatus: 'reconciled_as_primary' },
      { amount: 30, reconciliationStatus: 'reconciled_as_secondary' }, // Should be excluded
    ];

    transactionRepository.find = jest.fn().mockResolvedValue(transactions);

    // Act
    const result = await service.getTotalExpenses(userId);

    // Assert
    expect(result).toBe(80); // 50 + 30, not 110
  });

  it('should include both not_reconciled and reconciled_as_primary in analytics', async () => {
    // Arrange
    const userId = 10;

    // Act
    const result = await service.getExpenseTrends(userId);

    // Assert
    expect(transactionRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reconciliationStatus: In(['not_reconciled', 'reconciled_as_primary']),
        }),
      }),
    );
  });
});
```

**Implementation**:
```typescript
// Update all transaction queries to exclude reconciled_as_secondary
async getTotalExpenses(userId: number): Promise<number> {
  const result = await this.transactionRepository
    .createQueryBuilder('transaction')
    .select('SUM(transaction.amount)', 'total')
    .where('transaction.userId = :userId', { userId })
    .andWhere('transaction.type = :type', { type: 'expense' })
    .andWhere('transaction.reconciliationStatus IN (:...statuses)', {
      statuses: ['not_reconciled', 'reconciled_as_primary'],
    })
    .getRawOne();

  return parseFloat(result.total) || 0;
}
```

---

## Phase 5: Frontend Updates (Optional)

### Show Reconciliation Status in UI

**File**: `coffee-budget-frontend/src/components/transactions/TransactionList.tsx`

**Test**:
```typescript
describe('TransactionList - Reconciliation Display', () => {
  it('should show reconciliation badge for reconciled_as_primary transactions', () => {
    const transaction = {
      id: 1,
      description: 'PAYPAL *AMAZON (Amazon.it)',
      amount: 50,
      reconciliationStatus: 'reconciled_as_primary',
    };

    const { getByText } = render(<TransactionItem transaction={transaction} />);
    expect(getByText('Reconciled')).toBeInTheDocument();
  });

  it('should filter out reconciled_as_secondary by default', () => {
    const transactions = [
      { id: 1, reconciliationStatus: 'not_reconciled' },
      { id: 2, reconciliationStatus: 'reconciled_as_primary' },
      { id: 3, reconciliationStatus: 'reconciled_as_secondary' }, // Hidden by default
    ];

    const { queryAllByRole } = render(<TransactionList transactions={transactions} />);
    expect(queryAllByRole('row')).toHaveLength(2);
  });

  it('should show reconciled_as_secondary when "Show All" toggle is enabled', () => {
    const transactions = [
      { id: 1, reconciliationStatus: 'not_reconciled' },
      { id: 2, reconciliationStatus: 'reconciled_as_primary' },
      { id: 3, reconciliationStatus: 'reconciled_as_secondary' },
    ];

    const { queryAllByRole, getByRole } = render(<TransactionList transactions={transactions} />);

    const showAllToggle = getByRole('checkbox', { name: /show reconciled/i });
    fireEvent.click(showAllToggle);

    expect(queryAllByRole('row')).toHaveLength(3);
  });
});
```

---

## Testing Strategy

### Unit Tests (Required)
- ✅ Service methods (all functions)
- ✅ Entity relationships
- ✅ Query builders
- ✅ Error handling

### Integration Tests (Recommended)
- ✅ End-to-end reconciliation flow
- ✅ Database constraints
- ✅ Transaction rollback scenarios

### Manual Testing Checklist
- [ ] Import PayPal account via GoCardless
- [ ] Wait for daily sync or trigger manual sync
- [ ] Verify bank transactions are enriched with merchant names
- [ ] Verify PayPal transactions are marked as reconciled
- [ ] Verify analytics exclude reconciled PayPal transactions
- [ ] Verify totals are correct (no double counting)
- [ ] Test edge cases (same amount multiple times, different dates)

---

## Success Criteria

1. ✅ All unit tests passing (100% for new code)
2. ✅ Migration runs successfully without data loss
3. ✅ Reconciliation runs automatically during daily sync
4. ✅ Bank transactions show detailed merchant information
5. ✅ No duplicate counting in expense totals
6. ✅ PayPal transactions visible but marked as reconciled
7. ✅ Performance acceptable (reconciliation < 5 seconds per 100 transactions)

---

## Rollback Plan

If issues arise:
1. **Immediate**: Disable automatic reconciliation in GocardlessSchedulerService
2. **Short-term**: Migration rollback restores previous state
3. **Long-term**: Manual reconciliation via admin endpoint

---

## Monitoring & Logging

```typescript
// Add to GocardlessPaypalReconciliationService
this.logger.log(`Reconciliation started for user ${userId}`);
this.logger.log(`Found ${count} PayPal transactions to reconcile`);
this.logger.log(`Successfully reconciled ${successCount} transactions`);
this.logger.error(`Reconciliation failed: ${error.message}`);
```

---

## Timeline

**Day 1: Database & Service**
- Morning: Write migration and entity tests
- Afternoon: Implement migration and entity changes
- Evening: Write reconciliation service tests

**Day 2: Service & Integration**
- Morning: Implement reconciliation service
- Afternoon: Integrate with GoCardless scheduler
- Evening: Update dashboard queries

**Day 3: Testing & Deployment**
- Morning: Manual testing and edge case validation
- Afternoon: Code review and adjustments
- Evening: Deploy to staging, monitor

**Day 4: Production Deployment** (if needed)
- Gradual rollout with monitoring

---

## Open Questions

1. ❓ Should we show reconciled PayPal transactions in UI by default or hide them?
2. ❓ What happens if user manually deletes the bank transaction?
3. ❓ Should we support un-reconciliation if user disagrees?
4. ❓ How to handle partial refunds or split payments?

---

## Dependencies

- ✅ TypeORM 0.3.20
- ✅ NestJS 11+
- ✅ Existing duplicate detection infrastructure
- ✅ GoCardless sync scheduler

---

## Related Files

- `src/transactions/transaction.entity.ts` - Entity changes
- `src/gocardless/gocardless-scheduler.service.ts` - Sync integration
- `src/dashboard/dashboard.service.ts` - Analytics filtering
- `src/migrations/` - Database migrations
