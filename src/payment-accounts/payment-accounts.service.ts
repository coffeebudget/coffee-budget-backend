import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentAccount } from './payment-account.entity';
import { GocardlessService } from '../gocardless/gocardless.service';

@Injectable()
export class PaymentAccountsService {
  constructor(
    @InjectRepository(PaymentAccount)
    private readonly paymentAccountRepository: Repository<PaymentAccount>,
    @Inject(forwardRef(() => GocardlessService))
    private readonly gocardlessService: GocardlessService,
  ) {}

  /**
   * Find all payment accounts for a user
   */
  async findAllByUser(userId: number): Promise<PaymentAccount[]> {
    return this.paymentAccountRepository.find({
      where: { userId },
      relations: ['linkedBankAccount'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find a single payment account by ID (with user isolation)
   */
  async findOne(id: number, userId: number): Promise<PaymentAccount> {
    const account = await this.paymentAccountRepository.findOne({
      where: { id, userId },
      relations: ['linkedBankAccount'],
    });

    if (!account) {
      throw new NotFoundException(
        `Payment account with ID ${id} not found for user`,
      );
    }

    return account;
  }

  /**
   * Create a new payment account
   */
  async create(
    userId: number,
    data: {
      provider: string;
      displayName?: string;
      providerConfig?: Record<string, any>;
      linkedBankAccountId?: number;
    },
  ): Promise<PaymentAccount> {
    const account = this.paymentAccountRepository.create({
      ...data,
      userId,
      isActive: true,
    });

    return this.paymentAccountRepository.save(account);
  }

  /**
   * Update a payment account
   */
  async update(
    id: number,
    userId: number,
    data: Partial<{
      displayName: string;
      providerConfig: Record<string, any>;
      linkedBankAccountId: number;
      isActive: boolean;
    }>,
  ): Promise<PaymentAccount> {
    const account = await this.findOne(id, userId);

    Object.assign(account, data);

    return this.paymentAccountRepository.save(account);
  }

  /**
   * Delete a payment account
   */
  async delete(id: number, userId: number): Promise<void> {
    const account = await this.findOne(id, userId);

    await this.paymentAccountRepository.remove(account);
  }

  /**
   * Find payment account by provider
   */
  async findByProvider(
    userId: number,
    provider: string,
  ): Promise<PaymentAccount | null> {
    return this.paymentAccountRepository.findOne({
      where: { userId, provider },
      relations: ['linkedBankAccount'],
    });
  }

  /**
   * Initiate GoCardless connection for a payment account
   * Creates a requisition and returns the authorization URL for OAuth flow
   */
  async initiateGocardlessConnection(
    userId: number,
    paymentAccountId: number,
    institutionId: string,
    redirectUrl: string,
  ): Promise<{ authUrl: string; requisitionId: string }> {
    // Verify payment account belongs to user
    const paymentAccount = await this.findOne(paymentAccountId, userId);

    // Create requisition with GoCardless
    const requisition = await this.gocardlessService.createRequisition({
      redirect: redirectUrl,
      institution_id: institutionId,
      reference: `payment_account_${paymentAccountId}_${Date.now()}`,
      user_language: 'en',
    });

    return {
      authUrl: requisition.link,
      requisitionId: requisition.id,
    };
  }

  /**
   * Complete GoCardless connection after OAuth callback
   * Updates payment account with GoCardless account details
   */
  async completeGocardlessConnection(
    userId: number,
    paymentAccountId: number,
    requisitionId: string,
  ): Promise<PaymentAccount> {
    console.log('completeGocardlessConnection called:', {
      userId,
      paymentAccountId,
      requisitionId,
    });

    try {
      // Verify payment account belongs to user
      const paymentAccount = await this.findOne(paymentAccountId, userId);
      console.log('Payment account found:', {
        id: paymentAccount.id,
        provider: paymentAccount.provider,
      });

      // Get requisition details from GoCardless
      console.log('Fetching requisition from GoCardless...');
      const requisition = await this.gocardlessService.getRequisition(
        requisitionId,
      );
      console.log('Requisition fetched:', {
        id: requisition.id,
        institution_id: requisition.institution_id,
        accounts: requisition.accounts,
      });

      if (!requisition.accounts || requisition.accounts.length === 0) {
        console.error('No accounts in requisition');
        throw new NotFoundException(
          'No accounts found in requisition. OAuth flow may not have completed.',
        );
      }

      // Get the first account ID (payment providers typically have one account)
      const gocardlessAccountId = requisition.accounts[0];
      console.log('Using GoCardless account ID:', gocardlessAccountId);

      // Update payment account with GoCardless details
      const updatedProviderConfig = {
        ...(paymentAccount.providerConfig || {}),
        gocardlessAccountId,
        gocardlessInstitutionId: requisition.institution_id,
        requisitionId: requisition.id,
        connectedAt: new Date().toISOString(),
      };

      console.log('Updating payment account with config:', updatedProviderConfig);
      paymentAccount.providerConfig = updatedProviderConfig;

      const result = await this.paymentAccountRepository.save(paymentAccount);
      console.log('Payment account updated successfully');
      return result;
    } catch (error) {
      console.error('Error in completeGocardlessConnection:', error);
      throw error;
    }
  }

  /**
   * Disconnect GoCardless from payment account
   * Clears GoCardless connection details from payment account
   */
  async disconnectGocardless(
    paymentAccountId: number,
    userId: number,
  ): Promise<PaymentAccount> {
    // Verify payment account belongs to user
    const paymentAccount = await this.findOne(paymentAccountId, userId);

    // Clear GoCardless configuration
    const updatedProviderConfig = {
      ...(paymentAccount.providerConfig || {}),
    };

    delete updatedProviderConfig.gocardlessAccountId;
    delete updatedProviderConfig.gocardlessInstitutionId;
    delete updatedProviderConfig.requisitionId;
    delete updatedProviderConfig.connectedAt;

    paymentAccount.providerConfig = updatedProviderConfig;

    return this.paymentAccountRepository.save(paymentAccount);
  }
}
