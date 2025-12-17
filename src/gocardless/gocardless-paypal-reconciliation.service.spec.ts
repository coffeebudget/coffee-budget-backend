import { Test, TestingModule } from '@nestjs/testing';
import { GocardlessPaypalReconciliationService } from './gocardless-paypal-reconciliation.service';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';
import { Logger } from '@nestjs/common';

describe('GocardlessPaypalReconciliationService', () => {
  let service: GocardlessPaypalReconciliationService;
  let transactionRepository: Repository<Transaction>;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
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

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findPotentialPayPalMatch', () => {
    it('should find bank transaction matching PayPal transaction by amount and date', async () => {
      // Arrange
      const paypalTransaction: Transaction = {
        id: 1,
        description: 'Payment to Merchant via PayPal',
        amount: 50.0,
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_paypal',
        reconciliationStatus: 'not_reconciled',
      } as Transaction;

      const matchingBankTransaction: Transaction = {
        id: 2,
        description: 'PayPal *Merchant',
        amount: 50.0,
        type: 'expense',
        executionDate: new Date('2025-06-16'), // Within ±3 days
        source: 'gocardless_bank',
        reconciliationStatus: 'not_reconciled',
      } as Transaction;

      (transactionRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(matchingBankTransaction),
      });

      // Act
      const result = await service.findPotentialPayPalMatch(paypalTransaction, 1);

      // Assert
      expect(result).toEqual(matchingBankTransaction);
      expect(transactionRepository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should return null when no matching bank transaction found', async () => {
      // Arrange
      const paypalTransaction: Transaction = {
        id: 1,
        description: 'Payment to Merchant via PayPal',
        amount: 50.0,
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_paypal',
        reconciliationStatus: 'not_reconciled',
      } as Transaction;

      (transactionRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      // Act
      const result = await service.findPotentialPayPalMatch(paypalTransaction, 1);

      // Assert
      expect(result).toBeNull();
    });

    it('should match transactions within ±3 days window', async () => {
      // Arrange
      const paypalTransaction: Transaction = {
        id: 1,
        description: 'Payment via PayPal',
        amount: 75.5,
        type: 'expense',
        executionDate: new Date('2025-06-10'),
        source: 'gocardless_paypal',
        reconciliationStatus: 'not_reconciled',
      } as Transaction;

      const matchingBankTransaction: Transaction = {
        id: 2,
        description: 'PayPal Payment',
        amount: 75.5,
        type: 'expense',
        executionDate: new Date('2025-06-13'), // +3 days, still within window
        source: 'gocardless_bank',
        reconciliationStatus: 'not_reconciled',
      } as Transaction;

      (transactionRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(matchingBankTransaction),
      });

      // Act
      const result = await service.findPotentialPayPalMatch(paypalTransaction, 1);

      // Assert
      expect(result).toEqual(matchingBankTransaction);
    });

    it('should apply ±1% amount tolerance for matching', async () => {
      // Arrange
      const paypalTransaction: Transaction = {
        id: 1,
        description: 'Payment via PayPal',
        amount: 100.0,
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_paypal',
        reconciliationStatus: 'not_reconciled',
      } as Transaction;

      const matchingBankTransaction: Transaction = {
        id: 2,
        description: 'PayPal Payment',
        amount: 100.5, // Within ±1% tolerance (99-101)
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_bank',
        reconciliationStatus: 'not_reconciled',
      } as Transaction;

      (transactionRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(matchingBankTransaction),
      });

      // Act
      const result = await service.findPotentialPayPalMatch(paypalTransaction, 1);

      // Assert
      expect(result).toEqual(matchingBankTransaction);
    });

    it('should only match transactions containing "paypal" in description', async () => {
      // Arrange
      const paypalTransaction: Transaction = {
        id: 1,
        description: 'Payment via PayPal',
        amount: 50.0,
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_paypal',
        reconciliationStatus: 'not_reconciled',
      } as Transaction;

      const queryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };

      (transactionRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      // Act
      await service.findPotentialPayPalMatch(paypalTransaction, 1);

      // Assert
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('LOWER'),
        expect.objectContaining({ paypal: '%paypal%' }),
      );
    });
  });

  describe('reconcileTransactions', () => {
    it('should mark PayPal transaction as secondary and bank transaction as primary', async () => {
      // Arrange
      const bankTransaction: Transaction = {
        id: 2,
        description: 'PayPal Payment',
        amount: 50.0,
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_bank',
        reconciliationStatus: 'not_reconciled',
        reconciledWithTransaction: null,
      } as Transaction;

      const paypalTransaction: Transaction = {
        id: 1,
        description: 'Payment via PayPal',
        amount: 50.0,
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_paypal',
        reconciliationStatus: 'not_reconciled',
        reconciledWithTransaction: null,
      } as Transaction;

      (transactionRepository.save as jest.Mock).mockImplementation((transactions) =>
        Promise.resolve(transactions),
      );

      // Act
      const result = await service.reconcileTransactions(
        bankTransaction,
        paypalTransaction,
      );

      // Assert
      expect(result.bankTransaction.reconciliationStatus).toBe('reconciled_as_primary');
      expect(result.paypalTransaction.reconciliationStatus).toBe(
        'reconciled_as_secondary',
      );
      expect(result.paypalTransaction.reconciledWithTransaction).toEqual(bankTransaction);
      expect(transactionRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should enrich bank transaction description with PayPal merchant info', async () => {
      // Arrange
      const bankTransaction: Transaction = {
        id: 2,
        description: 'PayPal *Merchant',
        amount: 50.0,
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_bank',
        reconciliationStatus: 'not_reconciled',
        reconciledWithTransaction: null,
      } as Transaction;

      const originalDescription = bankTransaction.description;

      const paypalTransaction: Transaction = {
        id: 1,
        description: 'Payment to Detailed Merchant Name LLC',
        amount: 50.0,
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_paypal',
        reconciliationStatus: 'not_reconciled',
        reconciledWithTransaction: null,
        merchantName: 'Detailed Merchant Name LLC',
      } as Transaction;

      (transactionRepository.save as jest.Mock).mockImplementation((transactions) =>
        Promise.resolve(transactions),
      );

      // Act
      const result = await service.reconcileTransactions(
        bankTransaction,
        paypalTransaction,
      );

      // Assert
      expect(result.bankTransaction.description).toContain('Detailed Merchant Name LLC');
      expect(result.bankTransaction.description).not.toBe(originalDescription);
    });

    it('should log reconciliation action', async () => {
      // Arrange
      const bankTransaction: Transaction = {
        id: 2,
        description: 'PayPal Payment',
        amount: 50.0,
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_bank',
        reconciliationStatus: 'not_reconciled',
        reconciledWithTransaction: null,
      } as Transaction;

      const paypalTransaction: Transaction = {
        id: 1,
        description: 'Payment via PayPal',
        amount: 50.0,
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_paypal',
        reconciliationStatus: 'not_reconciled',
        reconciledWithTransaction: null,
      } as Transaction;

      (transactionRepository.save as jest.Mock).mockImplementation((transactions) =>
        Promise.resolve(transactions),
      );

      const loggerSpy = jest.spyOn(Logger.prototype, 'log');

      // Act
      await service.reconcileTransactions(bankTransaction, paypalTransaction);

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reconciled'),
      );

      loggerSpy.mockRestore();
    });
  });

  describe('processPayPalReconciliation', () => {
    it('should reconcile all unreconciled PayPal transactions for user', async () => {
      // Arrange
      const paypalTransaction: Transaction = {
        id: 1,
        description: 'Payment via PayPal',
        amount: 50.0,
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_paypal',
        reconciliationStatus: 'not_reconciled',
        reconciledWithTransaction: null,
      } as Transaction;

      const bankTransaction: Transaction = {
        id: 2,
        description: 'PayPal Payment',
        amount: 50.0,
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_bank',
        reconciliationStatus: 'not_reconciled',
        reconciledWithTransaction: null,
      } as Transaction;

      (transactionRepository.find as jest.Mock).mockResolvedValue([paypalTransaction]);

      jest
        .spyOn(service, 'findPotentialPayPalMatch')
        .mockResolvedValue(bankTransaction);

      jest.spyOn(service, 'reconcileTransactions').mockResolvedValue({
        bankTransaction: {
          ...bankTransaction,
          reconciliationStatus: 'reconciled_as_primary',
        },
        paypalTransaction: {
          ...paypalTransaction,
          reconciliationStatus: 'reconciled_as_secondary',
          reconciledWithTransaction: bankTransaction,
        },
      });

      // Act
      const result = await service.processPayPalReconciliation(1);

      // Assert
      expect(result.reconciledCount).toBe(1);
      expect(result.unreconciledCount).toBe(0);
      expect(service.findPotentialPayPalMatch).toHaveBeenCalledWith(
        paypalTransaction,
        1,
      );
      expect(service.reconcileTransactions).toHaveBeenCalledWith(
        bankTransaction,
        paypalTransaction,
      );
    });

    it('should track unreconciled PayPal transactions', async () => {
      // Arrange
      const paypalTransaction: Transaction = {
        id: 1,
        description: 'Payment via PayPal',
        amount: 50.0,
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_paypal',
        reconciliationStatus: 'not_reconciled',
        reconciledWithTransaction: null,
      } as Transaction;

      (transactionRepository.find as jest.Mock).mockResolvedValue([paypalTransaction]);

      jest.spyOn(service, 'findPotentialPayPalMatch').mockResolvedValue(null);

      // Act
      const result = await service.processPayPalReconciliation(1);

      // Assert
      expect(result.reconciledCount).toBe(0);
      expect(result.unreconciledCount).toBe(1);
      expect(result.unreconciledTransactions).toContainEqual(
        expect.objectContaining({
          id: 1,
          description: 'Payment via PayPal',
        }),
      );
    });

    it('should skip already reconciled PayPal transactions', async () => {
      // Arrange
      const reconciledPaypalTransaction: Transaction = {
        id: 1,
        description: 'Payment via PayPal',
        amount: 50.0,
        type: 'expense',
        executionDate: new Date('2025-06-15'),
        source: 'gocardless_paypal',
        reconciliationStatus: 'reconciled_as_secondary',
        reconciledWithTransaction: { id: 2 } as Transaction,
      } as Transaction;

      (transactionRepository.find as jest.Mock).mockResolvedValue([]);

      const findMatchSpy = jest.spyOn(service, 'findPotentialPayPalMatch');

      // Act
      const result = await service.processPayPalReconciliation(1);

      // Assert
      expect(result.reconciledCount).toBe(0);
      expect(result.unreconciledCount).toBe(0);
      expect(findMatchSpy).not.toHaveBeenCalled();
    });

    it('should return summary of reconciliation process', async () => {
      // Arrange
      (transactionRepository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.processPayPalReconciliation(1);

      // Assert
      expect(result).toHaveProperty('reconciledCount');
      expect(result).toHaveProperty('unreconciledCount');
      expect(result).toHaveProperty('unreconciledTransactions');
      expect(Array.isArray(result.unreconciledTransactions)).toBe(true);
    });
  });
});
