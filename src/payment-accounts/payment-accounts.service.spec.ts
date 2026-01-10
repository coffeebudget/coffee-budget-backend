import { Test, TestingModule } from '@nestjs/testing';
import { PaymentAccountsService } from './payment-accounts.service';
import { PaymentAccount } from './payment-account.entity';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { RepositoryMockFactory } from '../test/test-utils/repository-mocks';
import { GocardlessService } from '../gocardless/gocardless.service';

describe('PaymentAccountsService', () => {
  let service: PaymentAccountsService;
  let repository: Repository<PaymentAccount>;
  let module: TestingModule;

  const mockUser = {
    id: 1,
    auth0Id: 'auth0|123456',
    email: 'test@example.com',
    isDemoUser: false,
    demoExpiryDate: new Date('2024-12-31'),
    demoActivatedAt: new Date('2024-01-01'),
    bankAccounts: [],
    creditCards: [],
    transactions: [],
    tags: [],
    categories: [],
    recurringTransactions: [],
    paymentAccounts: [],
  };

  const mockBankAccount = {
    id: 1,
    name: 'Main Account',
    balance: 1000,
    type: 'CHECKING',
    gocardlessAccountId: 'test-gocardless-id',
    user: mockUser,
    currency: 'USD',
    transactions: [],
    creditCards: [],
    recurringTransactions: [],
  };

  const mockPaymentAccount = {
    id: 1,
    userId: 1,
    provider: 'paypal',
    displayName: 'My PayPal',
    providerConfig: { clientId: 'test-client-id' },
    linkedBankAccountId: 1,
    linkedBankAccount: mockBankAccount,
    isActive: true,
    user: mockUser,
    paymentActivities: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  } as PaymentAccount;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        PaymentAccountsService,
        RepositoryMockFactory.createRepositoryProvider(PaymentAccount),
        {
          provide: GocardlessService,
          useValue: {
            createRequisition: jest.fn(),
            getRequisition: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentAccountsService>(PaymentAccountsService);
    repository = module.get(getRepositoryToken(PaymentAccount));
  });

  afterEach(async () => {
    await module.close();
  });

  describe('findAllByUser', () => {
    it('should return all payment accounts for a user', async () => {
      // Arrange
      const userId = 1;
      const mockAccounts = [mockPaymentAccount];
      (repository.find as jest.Mock).mockResolvedValue(mockAccounts);

      // Act
      const result = await service.findAllByUser(userId);

      // Assert
      expect(result).toEqual(mockAccounts);
      expect(repository.find).toHaveBeenCalledWith({
        where: { userId },
        relations: ['linkedBankAccount'],
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array when user has no payment accounts', async () => {
      // Arrange
      const userId = 1;
      (repository.find as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.findAllByUser(userId);

      // Assert
      expect(result).toEqual([]);
      expect(repository.find).toHaveBeenCalledWith({
        where: { userId },
        relations: ['linkedBankAccount'],
        order: { createdAt: 'DESC' },
      });
    });

    it('should order results by createdAt DESC', async () => {
      // Arrange
      const userId = 1;
      const account1 = {
        ...mockPaymentAccount,
        id: 1,
        createdAt: new Date('2024-01-01'),
      };
      const account2 = {
        ...mockPaymentAccount,
        id: 2,
        createdAt: new Date('2024-01-02'),
      };
      (repository.find as jest.Mock).mockResolvedValue([account2, account1]);

      // Act
      const result = await service.findAllByUser(userId);

      // Assert
      expect(result[0].id).toBe(2); // Newer first
      expect(result[1].id).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return a payment account when found', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentAccount);

      // Act
      const result = await service.findOne(id, userId);

      // Assert
      expect(result).toEqual(mockPaymentAccount);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id, userId },
        relations: ['linkedBankAccount'],
      });
    });

    it('should throw NotFoundException when payment account not found', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(id, userId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne(id, userId)).rejects.toThrow(
        `Payment account with ID ${id} not found for user`,
      );
    });

    it('should not return payment account belonging to different user', async () => {
      // Arrange
      const id = 1;
      const userId = 2; // Different user
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(id, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include linkedBankAccount relation', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentAccount);

      // Act
      await service.findOne(id, userId);

      // Assert
      expect(repository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['linkedBankAccount'],
        }),
      );
    });
  });

  describe('create', () => {
    it('should create a new payment account with all fields', async () => {
      // Arrange
      const userId = 1;
      const createData = {
        provider: 'paypal',
        displayName: 'My PayPal',
        providerConfig: { clientId: 'test-id' },
        linkedBankAccountId: 1,
      };
      (repository.create as jest.Mock).mockReturnValue(mockPaymentAccount);
      (repository.save as jest.Mock).mockResolvedValue(mockPaymentAccount);

      // Act
      const result = await service.create(userId, createData);

      // Assert
      expect(repository.create).toHaveBeenCalledWith({
        ...createData,
        userId,
        isActive: true,
      });
      expect(repository.save).toHaveBeenCalledWith(mockPaymentAccount);
      expect(result).toEqual(mockPaymentAccount);
    });

    it('should create payment account without optional fields', async () => {
      // Arrange
      const userId = 1;
      const minimalData = {
        provider: 'klarna',
      };
      const minimalAccount = {
        ...mockPaymentAccount,
        provider: 'klarna',
        displayName: null,
        providerConfig: null,
        linkedBankAccountId: null,
      };
      (repository.create as jest.Mock).mockReturnValue(minimalAccount);
      (repository.save as jest.Mock).mockResolvedValue(minimalAccount);

      // Act
      const result = await service.create(userId, minimalData);

      // Assert
      expect(repository.create).toHaveBeenCalledWith({
        provider: 'klarna',
        userId,
        isActive: true,
      });
      expect(result.provider).toBe('klarna');
    });

    it('should set isActive to true by default', async () => {
      // Arrange
      const userId = 1;
      const createData = { provider: 'paypal' };
      (repository.create as jest.Mock).mockReturnValue(mockPaymentAccount);
      (repository.save as jest.Mock).mockResolvedValue(mockPaymentAccount);

      // Act
      await service.create(userId, createData);

      // Assert
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('should include userId in created account', async () => {
      // Arrange
      const userId = 42;
      const createData = { provider: 'satispay' };
      (repository.create as jest.Mock).mockReturnValue(mockPaymentAccount);
      (repository.save as jest.Mock).mockResolvedValue(mockPaymentAccount);

      // Act
      await service.create(userId, createData);

      // Assert
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 42 }),
      );
    });
  });

  describe('update', () => {
    it('should update payment account with provided fields', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const updateData = {
        displayName: 'Updated PayPal',
        isActive: false,
      };
      const updatedAccount = { ...mockPaymentAccount, ...updateData };
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentAccount);
      (repository.save as jest.Mock).mockResolvedValue(updatedAccount);

      // Act
      const result = await service.update(id, userId, updateData);

      // Assert
      expect(result.displayName).toBe('Updated PayPal');
      expect(result.isActive).toBe(false);
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining(updateData),
      );
    });

    it('should throw NotFoundException if account does not exist', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      const updateData = { displayName: 'New Name' };
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.update(id, userId, updateData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not update account belonging to different user', async () => {
      // Arrange
      const id = 1;
      const userId = 2; // Different user
      const updateData = { displayName: 'Hacked' };
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.update(id, userId, updateData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update providerConfig', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const updateData = {
        providerConfig: { apiKey: 'new-key', secret: 'new-secret' },
      };
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentAccount);
      (repository.save as jest.Mock).mockResolvedValue({
        ...mockPaymentAccount,
        ...updateData,
      });

      // Act
      const result = await service.update(id, userId, updateData);

      // Assert
      expect(result.providerConfig).toEqual(updateData.providerConfig);
    });

    it('should update linkedBankAccountId', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const updateData = { linkedBankAccountId: 2 };
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentAccount);
      (repository.save as jest.Mock).mockResolvedValue({
        ...mockPaymentAccount,
        ...updateData,
      });

      // Act
      const result = await service.update(id, userId, updateData);

      // Assert
      expect(result.linkedBankAccountId).toBe(2);
    });

    it('should handle partial updates', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      const updateData = { displayName: 'Only Name Updated' };
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentAccount);
      (repository.save as jest.Mock).mockResolvedValue({
        ...mockPaymentAccount,
        displayName: 'Only Name Updated',
      });

      // Act
      const result = await service.update(id, userId, updateData);

      // Assert
      expect(result.displayName).toBe('Only Name Updated');
      expect(result.provider).toBe(mockPaymentAccount.provider); // Unchanged
      expect(result.isActive).toBe(mockPaymentAccount.isActive); // Unchanged
    });
  });

  describe('delete', () => {
    it('should delete payment account', async () => {
      // Arrange
      const id = 1;
      const userId = 1;
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentAccount);
      (repository.remove as jest.Mock).mockResolvedValue(mockPaymentAccount);

      // Act
      await service.delete(id, userId);

      // Assert
      expect(repository.remove).toHaveBeenCalledWith(mockPaymentAccount);
    });

    it('should throw NotFoundException if account does not exist', async () => {
      // Arrange
      const id = 999;
      const userId = 1;
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(id, userId)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('should not delete account belonging to different user', async () => {
      // Arrange
      const id = 1;
      const userId = 2; // Different user
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(id, userId)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });

  describe('findByProvider', () => {
    it('should find payment account by provider', async () => {
      // Arrange
      const userId = 1;
      const provider = 'paypal';
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentAccount);

      // Act
      const result = await service.findByProvider(userId, provider);

      // Assert
      expect(result).toEqual(mockPaymentAccount);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userId, provider },
        relations: ['linkedBankAccount'],
      });
    });

    it('should return null when provider not found', async () => {
      // Arrange
      const userId = 1;
      const provider = 'klarna';
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await service.findByProvider(userId, provider);

      // Assert
      expect(result).toBeNull();
    });

    it('should only find accounts for specified user', async () => {
      // Arrange
      const userId = 1;
      const provider = 'paypal';
      (repository.findOne as jest.Mock).mockImplementation(({ where }) => {
        if (where.userId === 1 && where.provider === 'paypal') {
          return Promise.resolve(mockPaymentAccount);
        }
        return Promise.resolve(null);
      });

      // Act
      const result = await service.findByProvider(userId, provider);

      // Assert
      expect(result).toEqual(mockPaymentAccount);
    });

    it('should include linkedBankAccount relation', async () => {
      // Arrange
      const userId = 1;
      const provider = 'paypal';
      (repository.findOne as jest.Mock).mockResolvedValue(mockPaymentAccount);

      // Act
      await service.findByProvider(userId, provider);

      // Assert
      expect(repository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['linkedBankAccount'],
        }),
      );
    });
  });
});
