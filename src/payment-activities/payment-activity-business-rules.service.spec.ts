import { Test, TestingModule } from '@nestjs/testing';
import { PaymentActivityBusinessRulesService } from './payment-activity-business-rules.service';
import { PaymentActivity } from './payment-activity.entity';

describe('PaymentActivityBusinessRulesService', () => {
  let service: PaymentActivityBusinessRulesService;
  let module: TestingModule;

  const createMockActivity = (
    overrides: Partial<PaymentActivity> = {},
  ): Partial<PaymentActivity> => ({
    id: 1,
    paymentAccountId: 1,
    externalId: 'PAYPAL-TX-123',
    merchantName: 'Starbucks',
    merchantCategory: 'Coffee Shops',
    merchantCategoryCode: '5814',
    amount: -50.0,
    executionDate: new Date('2024-01-15'),
    description: 'Coffee purchase',
    rawData: {},
    ...overrides,
  });

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [PaymentActivityBusinessRulesService],
    }).compile();

    service = module.get<PaymentActivityBusinessRulesService>(
      PaymentActivityBusinessRulesService,
    );
  });

  afterEach(async () => {
    await module.close();
  });

  describe('determineInitialReconciliationStatus', () => {
    describe('should return "not_applicable" for non-reconcilable activities', () => {
      it('should classify PayPal Credit/Loan activities as not_applicable', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'PayPal Credit Payment',
          merchantCategory: 'Loan',
          rawData: { transaction_type: 'LOAN' },
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('not_applicable');
      });

      it('should classify activities with "loan" in description as not_applicable', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'PayPal Working Capital Loan Repayment',
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('not_applicable');
      });

      it('should classify activities with "credit" type in rawData as not_applicable', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Monthly Payment',
          rawData: { transaction_type: 'CREDIT_PAYMENT' },
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('not_applicable');
      });

      it('should classify PayPal fees as not_applicable', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'PayPal Fee',
          merchantCategory: 'Fee',
          rawData: { transaction_type: 'FEE' },
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('not_applicable');
      });

      it('should classify activities with "fee" in description as not_applicable', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Transaction Fee - Cross Border',
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('not_applicable');
      });

      it('should classify internal transfers as not_applicable', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Transfer to Bank Account',
          rawData: { transaction_type: 'TRANSFER' },
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('not_applicable');
      });

      it('should classify withdrawal activities as not_applicable', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Withdrawal to Bank',
          rawData: { transaction_type: 'WITHDRAWAL' },
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('not_applicable');
      });

      it('should classify currency conversion fees as not_applicable', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Currency Conversion',
          merchantCategory: 'Currency Exchange',
          rawData: { transaction_type: 'CURRENCY_CONVERSION' },
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('not_applicable');
      });

      it('should classify interest charges as not_applicable', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Interest Charge',
          rawData: { transaction_type: 'INTEREST' },
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('not_applicable');
      });

      it('should classify balance adjustments as not_applicable', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Balance Adjustment',
          rawData: { transaction_type: 'ADJUSTMENT' },
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('not_applicable');
      });
    });

    describe('should return "pending" for regular reconcilable activities', () => {
      it('should return pending for regular merchant purchase', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Purchase at Amazon',
          merchantName: 'Amazon',
          merchantCategory: 'Online Retail',
          rawData: { transaction_type: 'PAYMENT' },
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('pending');
      });

      it('should return pending for activities with empty rawData', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Purchase at Store',
          rawData: {},
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('pending');
      });

      it('should return pending for refund activities', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Refund from Amazon',
          amount: 25.0,
          rawData: { transaction_type: 'REFUND' },
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('pending');
      });

      it('should return pending for standard payment type', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Payment to Netflix',
          merchantName: 'Netflix',
          rawData: { transaction_type: 'PAYMENT' },
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('pending');
      });

      it('should return pending for activities without transaction_type', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Unknown transaction',
          rawData: { some_other_field: 'value' },
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('pending');
      });
    });

    describe('case insensitivity', () => {
      it('should handle uppercase keywords in description', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'PAYPAL FEE FOR TRANSACTION',
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('not_applicable');
      });

      it('should handle mixed case in rawData transaction_type', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Some payment',
          rawData: { transaction_type: 'Loan_Payment' },
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('not_applicable');
      });

      it('should handle lowercase in merchantCategory', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Some transaction',
          merchantCategory: 'loan services',
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('not_applicable');
      });
    });

    describe('edge cases', () => {
      it('should return pending when description is null', () => {
        // Arrange
        const activity = createMockActivity({
          description: null as unknown as string,
          rawData: {},
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('pending');
      });

      it('should return pending when rawData is null', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Purchase',
          rawData: null as unknown as Record<string, any>,
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('pending');
      });

      it('should return pending when merchantCategory is null', () => {
        // Arrange
        const activity = createMockActivity({
          description: 'Purchase',
          merchantCategory: null as unknown as string,
          rawData: {},
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('pending');
      });

      it('should handle "fee" being part of a word (e.g., "coffee") correctly', () => {
        // Arrange - "coffee" contains "fee" but should NOT trigger not_applicable
        const activity = createMockActivity({
          description: 'Coffee purchase at Starbucks',
          merchantCategory: 'Coffee Shops',
          rawData: {},
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('pending');
      });

      it('should handle "loan" being part of a word correctly', () => {
        // Arrange - "balloon" contains "loan" but should NOT trigger not_applicable
        const activity = createMockActivity({
          description: 'Balloon purchase for party',
          rawData: {},
        });

        // Act
        const result = service.determineInitialReconciliationStatus(
          activity as PaymentActivity,
        );

        // Assert
        expect(result).toBe('pending');
      });
    });
  });

  describe('isNonReconcilableActivityType', () => {
    it('should return true for loan activities', () => {
      // Act
      const result = service.isNonReconcilableActivityType('LOAN');

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for fee activities', () => {
      // Act
      const result = service.isNonReconcilableActivityType('FEE');

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for transfer activities', () => {
      // Act
      const result = service.isNonReconcilableActivityType('TRANSFER');

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for withdrawal activities', () => {
      // Act
      const result = service.isNonReconcilableActivityType('WITHDRAWAL');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for payment activities', () => {
      // Act
      const result = service.isNonReconcilableActivityType('PAYMENT');

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for refund activities', () => {
      // Act
      const result = service.isNonReconcilableActivityType('REFUND');

      // Assert
      expect(result).toBe(false);
    });

    it('should be case insensitive', () => {
      // Act & Assert
      expect(service.isNonReconcilableActivityType('loan')).toBe(true);
      expect(service.isNonReconcilableActivityType('Loan')).toBe(true);
      expect(service.isNonReconcilableActivityType('LOAN')).toBe(true);
    });
  });

  describe('getNonReconcilableKeywords', () => {
    it('should return an array of keywords', () => {
      // Act
      const keywords = service.getNonReconcilableKeywords();

      // Assert
      expect(Array.isArray(keywords)).toBe(true);
      expect(keywords.length).toBeGreaterThan(0);
    });

    it('should include common non-reconcilable keywords', () => {
      // Act
      const keywords = service.getNonReconcilableKeywords();

      // Assert
      expect(keywords).toContain('loan');
      expect(keywords).toContain('fee');
      expect(keywords).toContain('transfer');
      expect(keywords).toContain('withdrawal');
      expect(keywords).toContain('interest');
    });
  });
});
