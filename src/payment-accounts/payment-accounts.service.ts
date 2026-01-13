import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentAccount } from './payment-account.entity';
import { GocardlessService } from '../gocardless/gocardless.service';
import { GocardlessConnectionService } from '../gocardless/gocardless-connection.service';

@Injectable()
export class PaymentAccountsService {
  private readonly logger = new Logger(PaymentAccountsService.name);

  constructor(
    @InjectRepository(PaymentAccount)
    private readonly paymentAccountRepository: Repository<PaymentAccount>,
    @Inject(forwardRef(() => GocardlessService))
    private readonly gocardlessService: GocardlessService,
    @Inject(forwardRef(() => GocardlessConnectionService))
    private readonly connectionService: GocardlessConnectionService,
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
    this.logger.log(
      `Completing GoCardless connection for user ${userId}, payment account ${paymentAccountId}`,
    );

    try {
      // Verify payment account belongs to user
      const paymentAccount = await this.findOne(paymentAccountId, userId);
      this.logger.log(`Payment account found: ${paymentAccount.id}`);

      // Get requisition details from GoCardless
      const requisition =
        await this.gocardlessService.getRequisition(requisitionId);
      this.logger.log(
        `Requisition fetched: ${requisition.id}, institution: ${requisition.institution_id}, accounts: ${requisition.accounts?.length || 0}`,
      );

      if (!requisition.accounts || requisition.accounts.length === 0) {
        this.logger.error('No accounts in requisition');
        throw new NotFoundException(
          'No accounts found in requisition. OAuth flow may not have completed.',
        );
      }

      // Get the first account ID (payment providers typically have one account)
      const gocardlessAccountId = requisition.accounts[0];

      // Update payment account with GoCardless details
      const connectedAt = new Date();
      const updatedProviderConfig = {
        ...(paymentAccount.providerConfig || {}),
        gocardlessAccountId,
        gocardlessInstitutionId: requisition.institution_id,
        requisitionId: requisition.id,
        connectedAt: connectedAt.toISOString(),
      };

      paymentAccount.providerConfig = updatedProviderConfig;
      const result = await this.paymentAccountRepository.save(paymentAccount);
      this.logger.log('Payment account updated successfully');

      // Create GocardlessConnection record for expiration tracking
      try {
        // Fetch institution details for name and logo
        const institution = await this.gocardlessService.getInstitutionById(
          requisition.institution_id,
        );

        await this.connectionService.createConnection({
          userId,
          requisitionId: requisition.id,
          euaId: requisition.agreement || null,
          institutionId: requisition.institution_id,
          institutionName: institution?.name || null,
          institutionLogo: institution?.logo || null,
          connectedAt,
          accessValidForDays: 90, // Default GoCardless EUA validity
          linkedAccountIds: requisition.accounts,
        });

        this.logger.log(
          `Created GocardlessConnection record for requisition ${requisition.id}`,
        );
      } catch (connectionError) {
        // Log but don't fail the main flow - connection tracking is secondary
        this.logger.warn(
          `Failed to create GocardlessConnection record: ${connectionError.message}`,
        );
      }

      return result;
    } catch (error) {
      this.logger.error(`Error in completeGocardlessConnection: ${error.message}`);
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
