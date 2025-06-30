import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import axios from 'axios';
import {
  CreateAccessTokenDto,
  AccessTokenResponseDto,
  InstitutionDto,
  CreateEndUserAgreementDto,
  EndUserAgreementResponseDto,
  CreateRequisitionDto,
  RequisitionResponseDto,
  TransactionsResponseDto,
  AccountDetailsDto,
  AccountBalancesDto,
} from './dto/gocardless.dto';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';

interface ConnectedAccount {
  type: 'bank_account' | 'credit_card';
  localId: number;
  localName: string;
  gocardlessAccountId: string;
  details: AccountDetailsDto;
  balances: AccountBalancesDto;
}

interface ImportResult {
  accountType: 'bank_account' | 'credit_card';
  accountName: string;
  gocardlessAccountId: string;
  transactions?: any[];
  importLogId?: number;
  status?: string;
  duplicatesCount?: number;
  newTransactionsCount?: number;
  pendingDuplicatesCreated?: number;
  error?: string;
}

@Injectable()
export class GocardlessService {
  private readonly logger = new Logger(GocardlessService.name);
  private readonly httpClient: ReturnType<typeof axios.create>;
  private readonly baseUrl = 'https://bankaccountdata.gocardless.com/api/v2';
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    private configService: ConfigService,
    @InjectRepository(BankAccount)
    private bankAccountsRepository: Repository<BankAccount>,
    @InjectRepository(CreditCard)
    private creditCardsRepository: Repository<CreditCard>,
    private moduleRef: ModuleRef,
  ) {
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
    });

    // Add request interceptor to automatically add auth token
    this.httpClient.interceptors.request.use((config) => {
      if (config.url !== '/token/new/' && this.accessToken) {
        if (!config.headers) {
          config.headers = {};
        }
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,

      (error: any) => {
        const errorMessage =
          error &&
          typeof error === 'object' &&
          error.response &&
          error.response.data
            ? error.response.data
            : error && typeof error === 'object' && error.message
              ? error.message
              : 'Unknown error';

        const errorStatus =
          error &&
          typeof error === 'object' &&
          error.response &&
          error.response.status
            ? error.response.status
            : HttpStatus.INTERNAL_SERVER_ERROR;

        this.logger.error('GoCardless API Error:', errorMessage);

        throw new HttpException(
          error &&
          typeof error === 'object' &&
          error.response &&
          error.response.data
            ? error.response.data
            : 'GoCardless API Error',
          errorStatus,
        );
      },
    );
  }

  /**
   * Step 1: Get Access Token
   * Creates an access token using secret_id and secret_key
   */
  async createAccessToken(
    createTokenDto: CreateAccessTokenDto,
  ): Promise<AccessTokenResponseDto> {
    try {
      this.logger.log('Creating access token...');

      const response = await this.httpClient.post<AccessTokenResponseDto>(
        '/token/new/',
        createTokenDto,
      );

      // Store token and expiry
      this.accessToken = response.data.access;
      this.tokenExpiry = new Date(
        Date.now() + response.data.access_expires * 1000,
      );

      this.logger.log('Access token created successfully');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create access token:', error);
      throw error;
    }
  }

  /**
   * Step 2: Get list of institutions (banks) for a country
   */
  async getInstitutions(countryCode: string): Promise<InstitutionDto[]> {
    try {
      await this.ensureValidToken();

      this.logger.log(`Fetching institutions for country: ${countryCode}`);

      const response = await this.httpClient.get<InstitutionDto[]>(
        `/institutions/?country=${countryCode.toLowerCase()}`,
      );

      this.logger.log(`Found ${response.data.length} institutions`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch institutions:', error);
      throw error;
    }
  }

  /**
   * Step 3: Create End User Agreement (optional)
   */
  async createEndUserAgreement(
    agreementDto: CreateEndUserAgreementDto,
  ): Promise<EndUserAgreementResponseDto> {
    try {
      await this.ensureValidToken();

      this.logger.log('Creating end user agreement...');

      const response = await this.httpClient.post<EndUserAgreementResponseDto>(
        '/agreements/enduser/',
        agreementDto,
      );

      this.logger.log('End user agreement created successfully');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create end user agreement:', error);
      throw error;
    }
  }

  /**
   * Step 4: Create Requisition (Build a Link)
   */
  async createRequisition(
    requisitionDto: CreateRequisitionDto,
  ): Promise<RequisitionResponseDto> {
    try {
      await this.ensureValidToken();

      this.logger.log('Creating requisition...');

      const response = await this.httpClient.post<RequisitionResponseDto>(
        '/requisitions/',
        requisitionDto,
      );

      this.logger.log('Requisition created successfully');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create requisition:', error);
      throw error;
    }
  }

  /**
   * Step 5: Get Requisition details and accounts
   */
  async getRequisition(requisitionId: string): Promise<RequisitionResponseDto> {
    try {
      await this.ensureValidToken();

      this.logger.log(`Fetching requisition: ${requisitionId}`);

      const response = await this.httpClient.get<RequisitionResponseDto>(
        `/requisitions/${requisitionId}/`,
      );

      this.logger.log('Requisition fetched successfully');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch requisition:', error);
      throw error;
    }
  }

  /**
   * Get Requisition details by reference
   */
  async getRequisitionByReference(
    reference: string,
  ): Promise<RequisitionResponseDto> {
    try {
      await this.ensureValidToken();

      this.logger.log(`Fetching requisitions to find reference: ${reference}`);

      // GoCardless doesn't have a direct API to get by reference, so we need to
      // list all requisitions and find the one with matching reference
      const response = await this.httpClient.get<{
        results: RequisitionResponseDto[];
      }>('/requisitions/');

      const requisition = response.data.results.find(
        (req) => req.reference === reference,
      );

      if (!requisition) {
        throw new HttpException(
          `Requisition not found for reference: ${reference}`,
          HttpStatus.NOT_FOUND,
        );
      }

      this.logger.log(
        `Found requisition ${requisition.id} for reference ${reference}`,
      );
      return requisition;
    } catch (error) {
      this.logger.error('Failed to fetch requisition by reference:', error);
      throw error;
    }
  }

  /**
   * Step 6a: Get Account Details
   */
  async getAccountDetails(accountId: string): Promise<AccountDetailsDto> {
    try {
      await this.ensureValidToken();

      this.logger.log(`Fetching account details: ${accountId}`);

      const response = await this.httpClient.get<AccountDetailsDto>(
        `/accounts/${accountId}/details/`,
      );

      this.logger.log('Account details fetched successfully');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch account details:', error);
      throw error;
    }
  }

  /**
   * Step 6b: Get Account Balances
   */
  async getAccountBalances(accountId: string): Promise<AccountBalancesDto> {
    try {
      await this.ensureValidToken();

      this.logger.log(`Fetching account balances: ${accountId}`);

      const response = await this.httpClient.get<AccountBalancesDto>(
        `/accounts/${accountId}/balances/`,
      );

      this.logger.log('Account balances fetched successfully');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch account balances:', error);
      throw error;
    }
  }

  /**
   * Step 6c: Get Account Transactions
   */
  async getAccountTransactions(
    accountId: string,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<TransactionsResponseDto> {
    try {
      await this.ensureValidToken();

      this.logger.log(`Fetching account transactions: ${accountId}`);

      // Build query parameters for date range
      const queryParams = new URLSearchParams();
      
      if (dateFrom) {
        queryParams.append('date_from', dateFrom.toISOString().split('T')[0]);
      }
      
      if (dateTo) {
        queryParams.append('date_to', dateTo.toISOString().split('T')[0]);
      }

      const queryString = queryParams.toString();
      const url = `/accounts/${accountId}/transactions/${queryString ? `?${queryString}` : ''}`;

      this.logger.log(`Fetching transactions with URL: ${url}`);

      const response = await this.httpClient.get<TransactionsResponseDto>(url);

      this.logger.log(
        `Fetched ${response.data.transactions.booked.length} booked transactions and ${response.data.transactions.pending.length} pending transactions`,
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch account transactions:', error);
      throw error;
    }
  }

  /**
   * Helper method to ensure we have a valid access token
   */
  private async ensureValidToken(): Promise<void> {
    if (
      !this.accessToken ||
      !this.tokenExpiry ||
      new Date() >= this.tokenExpiry
    ) {
      // Try to get credentials from environment
      const secretId = this.configService.get<string>('GOCARDLESS_SECRET_ID');
      const secretKey = this.configService.get<string>('GOCARDLESS_SECRET_KEY');

      if (!secretId || !secretKey) {
        throw new HttpException(
          'GoCardless credentials not configured. Please set GOCARDLESS_SECRET_ID and GOCARDLESS_SECRET_KEY environment variables.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      await this.createAccessToken({
        secret_id: secretId,
        secret_key: secretKey,
      });
    }
  }

  /**
   * Utility method to get Italian banks
   */
  async getItalianBanks(): Promise<InstitutionDto[]> {
    return this.getInstitutions('IT');
  }

  /**
   * Helper method to extract current balance amount from GoCardless balance data
   */
  private getCurrentBalanceAmount(balances: AccountBalancesDto): number {
    if (!balances?.balances?.length) {
      return 0;
    }

    // Find the current balance (usually "expected" or "interimAvailable")
    const currentBalance =
      balances.balances.find(
        (balance) =>
          balance.balanceType === 'expected' ||
          balance.balanceType === 'interimAvailable',
      ) || balances.balances[0];

    if (currentBalance?.balanceAmount?.amount) {
      return parseFloat(currentBalance.balanceAmount.amount);
    }

    return 0;
  }

  /**
   * Synchronize account balances with GoCardless without importing transactions
   */
  async syncAccountBalances(userId: number) {
    try {
      const connectedAccounts = await this.getConnectedAccountsForUser(userId);
      const syncResults: any[] = [];

      for (const account of connectedAccounts.connectedAccounts) {
        try {
          this.logger.log(
            `Syncing balance for ${account.type} ${account.localName} (${account.gocardlessAccountId})`,
          );

          const currentBalance = this.getCurrentBalanceAmount(account.balances);

          if (account.type === 'bank_account') {
            await this.bankAccountsRepository.update(account.localId, {
              balance: currentBalance,
            });
          } else if (account.type === 'credit_card') {
            await this.creditCardsRepository.update(account.localId, {
              currentBalance: currentBalance,
            });
          }

          syncResults.push({
            accountType: account.type,
            accountName: account.localName,
            gocardlessAccountId: account.gocardlessAccountId,
            newBalance: currentBalance,
            status: 'success',
          });

          this.logger.log(
            `Updated ${account.type} ${account.localName} balance to ${currentBalance}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to sync balance for account ${account.gocardlessAccountId}: ${error.message}`,
          );
          syncResults.push({
            accountType: account.type,
            accountName: account.localName,
            gocardlessAccountId: account.gocardlessAccountId,
            error: error.message,
            status: 'failed',
          });
        }
      }

      return {
        syncResults,
        summary: {
          totalAccounts: connectedAccounts.totalAccounts,
          successfulSyncs: syncResults.filter((r) => r.status === 'success')
            .length,
          failedSyncs: syncResults.filter((r) => r.status === 'failed').length,
        },
      };
    } catch (error) {
      this.logger.error('Failed to sync account balances:', error);
      throw error;
    }
  }

  /**
   * Complete flow to get transactions from a bank account
   */
  async getTransactionsFlow(
    institutionId: string,
    redirectUrl: string,
    reference?: string,
  ): Promise<{ requisition: RequisitionResponseDto; authUrl: string }> {
    try {
      // Create requisition with default agreement (90 days history, 90 days access)
      const requisition = await this.createRequisition({
        institution_id: institutionId,
        redirect: redirectUrl,
        reference: reference || `coffee-budget-${Date.now()}`,
        user_language: 'EN',
      });

      return {
        requisition,
        authUrl: requisition.link,
      };
    } catch (error) {
      this.logger.error('Failed to create transactions flow:', error);
      throw error;
    }
  }

  /**
   * Get all connected GoCardless accounts for a user
   */
  async getConnectedAccountsForUser(userId: number) {
    try {
      // Get bank accounts with GoCardless integration
      const bankAccounts = await this.bankAccountsRepository.find({
        where: {
          user: { id: userId },
          gocardlessAccountId: Not(IsNull()),
        },
        select: [
          'id',
          'name',
          'gocardlessAccountId',
          'balance',
          'currency',
          'type',
        ],
      });

      // Get credit cards with GoCardless integration
      const creditCards = await this.creditCardsRepository.find({
        where: {
          user: { id: userId },
          gocardlessAccountId: Not(IsNull()),
        },
        select: [
          'id',
          'name',
          'gocardlessAccountId',
          'currentBalance',
          'creditLimit',
        ],
      });

      // Get account details from GoCardless for each connected account
      const connectedAccounts: ConnectedAccount[] = [];

      for (const bankAccount of bankAccounts) {
        try {
          const accountDetails = await this.getAccountDetails(
            bankAccount.gocardlessAccountId,
          );
          const accountBalances = await this.getAccountBalances(
            bankAccount.gocardlessAccountId,
          );

          connectedAccounts.push({
            type: 'bank_account',
            localId: bankAccount.id,
            localName: bankAccount.name,
            gocardlessAccountId: bankAccount.gocardlessAccountId,
            details: accountDetails,
            balances: accountBalances,
          });
        } catch (error) {
          this.logger.warn(
            `Failed to get details for bank account ${bankAccount.id}: ${error.message}`,
          );
        }
      }

      for (const creditCard of creditCards) {
        try {
          const accountDetails = await this.getAccountDetails(
            creditCard.gocardlessAccountId,
          );
          const accountBalances = await this.getAccountBalances(
            creditCard.gocardlessAccountId,
          );

          connectedAccounts.push({
            type: 'credit_card',
            localId: creditCard.id,
            localName: creditCard.name,
            gocardlessAccountId: creditCard.gocardlessAccountId,
            details: accountDetails,
            balances: accountBalances,
          });
        } catch (error) {
          this.logger.warn(
            `Failed to get details for credit card ${creditCard.id}: ${error.message}`,
          );
        }
      }

      return {
        connectedAccounts,
        totalAccounts: connectedAccounts.length,
      };
    } catch (error) {
      this.logger.error('Failed to get connected accounts:', error);
      throw error;
    }
  }

  /**
   * Import transactions from all connected GoCardless accounts
   */
  async importAllConnectedAccounts(
    userId: number,
    options: {
      skipDuplicateCheck?: boolean;
      createPendingForDuplicates?: boolean;
      dateFrom?: Date;
      dateTo?: Date;
    } = {},
  ) {
    try {
      const connectedAccounts = await this.getConnectedAccountsForUser(userId);
      const importResults: ImportResult[] = [];

      // Get TransactionsService dynamically to avoid circular dependency
      const { TransactionsService } = await import(
        '../transactions/transactions.service'
      );
      const transactionsService = this.moduleRef.get(TransactionsService, {
        strict: false,
      });

      if (!transactionsService) {
        throw new Error('TransactionsService not available in current context');
      }

      for (const account of connectedAccounts.connectedAccounts) {
        try {
          this.logger.log(
            `Importing transactions for ${account.type} ${account.localName} (${account.gocardlessAccountId})`,
          );

          const importOptions =
            account.type === 'bank_account'
              ? { 
                  bankAccountId: account.localId,
                  skipDuplicateCheck: options.skipDuplicateCheck || false,
                  createPendingForDuplicates: options.createPendingForDuplicates !== false,
                  dateFrom: options.dateFrom,
                  dateTo: options.dateTo,
                }
              : { 
                  creditCardId: account.localId,
                  skipDuplicateCheck: options.skipDuplicateCheck || false,
                  createPendingForDuplicates: options.createPendingForDuplicates !== false,
                  dateFrom: options.dateFrom,
                  dateTo: options.dateTo,
                };

          const result = await transactionsService.importFromGoCardless(
            account.gocardlessAccountId,
            userId,
            importOptions,
          );

          // Update local account balance to match GoCardless balance after import
          try {
            const currentBalance = this.getCurrentBalanceAmount(
              account.balances,
            );

            if (account.type === 'bank_account') {
              await this.bankAccountsRepository.update(account.localId, {
                balance: currentBalance,
              });
            } else if (account.type === 'credit_card') {
              await this.creditCardsRepository.update(account.localId, {
                currentBalance: currentBalance,
              });
            }

            this.logger.log(
              `Updated ${account.type} ${account.localName} balance to ${currentBalance}`,
            );
          } catch (balanceError) {
            this.logger.warn(
              `Failed to update balance for ${account.type} ${account.localName}: ${balanceError.message}`,
            );
          }

          importResults.push({
            accountType: account.type,
            accountName: account.localName,
            gocardlessAccountId: account.gocardlessAccountId,
            ...result,
          });
        } catch (error) {
          this.logger.error(
            `Failed to import transactions for account ${account.gocardlessAccountId}: ${error.message}`,
          );
          importResults.push({
            accountType: account.type,
            accountName: account.localName,
            gocardlessAccountId: account.gocardlessAccountId,
            error: error.message,
            status: 'failed',
          });
        }
      }

      const totalNewTransactions = importResults
        .filter((r) => !r.error)
        .reduce((sum, r) => sum + (r.newTransactionsCount || 0), 0);

      const totalDuplicates = importResults
        .filter((r) => !r.error)
        .reduce((sum, r) => sum + (r.duplicatesCount || 0), 0);

      const totalPendingDuplicates = importResults
        .filter((r) => !r.error)
        .reduce((sum, r) => sum + (r.pendingDuplicatesCreated || 0), 0);

      return {
        importResults,
        summary: {
          totalAccounts: connectedAccounts.totalAccounts,
          successfulImports: importResults.filter((r) => !r.error).length,
          failedImports: importResults.filter((r) => r.error).length,
          totalNewTransactions,
          totalDuplicates,
          totalPendingDuplicates,
          balancesSynchronized: importResults.filter((r) => !r.error).length,
        },
      };
    } catch (error) {
      this.logger.error('Failed to import from all connected accounts:', error);
      throw error;
    }
  }
}
