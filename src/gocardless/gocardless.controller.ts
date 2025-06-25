import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { GocardlessService } from './gocardless.service';
import { CurrentUser } from '../auth/user.decorator';
import { User } from '../users/user.entity';
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

@ApiTags('gocardless')
@ApiBearerAuth()
@Controller('gocardless')
@UseGuards(AuthGuard('jwt'))
export class GocardlessController {
  constructor(private readonly gocardlessService: GocardlessService) {}

  @Post('token')
  @ApiOperation({ summary: 'Create GoCardless access token' })
  @ApiResponse({
    status: 201,
    description: 'Token created successfully',
    type: AccessTokenResponseDto,
  })
  async createAccessToken(
    @Body() createTokenDto: CreateAccessTokenDto,
  ): Promise<AccessTokenResponseDto> {
    return this.gocardlessService.createAccessToken(createTokenDto);
  }

  @Get('institutions')
  @ApiOperation({ summary: 'Get list of banks for a country' })
  @ApiResponse({
    status: 200,
    description: 'List of institutions',
    type: [InstitutionDto],
  })
  async getInstitutions(
    @Query('country') country: string = 'IT',
  ): Promise<InstitutionDto[]> {
    return this.gocardlessService.getInstitutions(country);
  }

  @Get('institutions/italian-banks')
  @ApiOperation({ summary: 'Get list of Italian banks' })
  @ApiResponse({
    status: 200,
    description: 'List of Italian banks',
    type: [InstitutionDto],
  })
  async getItalianBanks(): Promise<InstitutionDto[]> {
    return this.gocardlessService.getItalianBanks();
  }

  @Post('agreements')
  @ApiOperation({ summary: 'Create end user agreement' })
  @ApiResponse({
    status: 201,
    description: 'Agreement created successfully',
    type: EndUserAgreementResponseDto,
  })
  async createEndUserAgreement(
    @Body() agreementDto: CreateEndUserAgreementDto,
  ): Promise<EndUserAgreementResponseDto> {
    return this.gocardlessService.createEndUserAgreement(agreementDto);
  }

  @Post('requisitions')
  @ApiOperation({
    summary: 'Create requisition and get bank authorization link',
  })
  @ApiResponse({
    status: 201,
    description: 'Requisition created successfully',
    type: RequisitionResponseDto,
  })
  async createRequisition(
    @Body() requisitionDto: CreateRequisitionDto,
  ): Promise<RequisitionResponseDto> {
    return this.gocardlessService.createRequisition(requisitionDto);
  }

  @Get('requisitions/:id')
  @ApiOperation({ summary: 'Get requisition details and linked accounts' })
  @ApiResponse({
    status: 200,
    description: 'Requisition details',
    type: RequisitionResponseDto,
  })
  async getRequisition(
    @Param('id') requisitionId: string,
  ): Promise<RequisitionResponseDto> {
    return this.gocardlessService.getRequisition(requisitionId);
  }

  @Get('requisitions/by-reference/:reference')
  @ApiOperation({ summary: 'Get requisition details by reference' })
  @ApiResponse({
    status: 200,
    description: 'Requisition details',
    type: RequisitionResponseDto,
  })
  async getRequisitionByReference(
    @Param('reference') reference: string,
  ): Promise<RequisitionResponseDto> {
    return this.gocardlessService.getRequisitionByReference(reference);
  }

  @Get('accounts/:id/details')
  @ApiOperation({ summary: 'Get account details' })
  @ApiResponse({
    status: 200,
    description: 'Account details',
    type: AccountDetailsDto,
  })
  async getAccountDetails(
    @Param('id') accountId: string,
  ): Promise<AccountDetailsDto> {
    return this.gocardlessService.getAccountDetails(accountId);
  }

  @Get('accounts/:id/balances')
  @ApiOperation({ summary: 'Get account balances' })
  @ApiResponse({
    status: 200,
    description: 'Account balances',
    type: AccountBalancesDto,
  })
  async getAccountBalances(
    @Param('id') accountId: string,
  ): Promise<AccountBalancesDto> {
    return this.gocardlessService.getAccountBalances(accountId);
  }

  @Get('accounts/:id/transactions')
  @ApiOperation({ summary: 'Get account transactions' })
  @ApiResponse({
    status: 200,
    description: 'Account transactions',
    type: TransactionsResponseDto,
  })
  async getAccountTransactions(
    @Param('id') accountId: string,
  ): Promise<TransactionsResponseDto> {
    return this.gocardlessService.getAccountTransactions(accountId);
  }

  @Post('flow/start')
  @ApiOperation({ summary: 'Start complete flow to connect bank account' })
  @ApiResponse({
    status: 201,
    description: 'Flow started, returns authorization URL',
  })
  async startTransactionsFlow(
    @Body()
    flowDto: { institutionId: string; redirectUrl: string; reference?: string },
    @CurrentUser() user: User,
  ): Promise<{ requisition: RequisitionResponseDto; authUrl: string }> {
    const reference = flowDto.reference || `user-${user.id}-${Date.now()}`;
    return this.gocardlessService.getTransactionsFlow(
      flowDto.institutionId,
      flowDto.redirectUrl,
      reference,
    );
  }

  @Post('import/all')
  @ApiOperation({
    summary: 'Import transactions from all connected GoCardless accounts',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk import completed successfully',
  })
  async importAllConnectedAccounts(@CurrentUser() user: User): Promise<{
    importResults: any[];
    summary: {
      totalAccounts: number;
      successfulImports: number;
      failedImports: number;
      totalNewTransactions: number;
      totalDuplicates: number;
    };
  }> {
    return this.gocardlessService.importAllConnectedAccounts(user.id);
  }

  @Get('connected-accounts')
  @ApiOperation({
    summary: 'Get all connected GoCardless accounts for the user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of connected accounts',
  })
  async getConnectedAccounts(@CurrentUser() user: User): Promise<{
    connectedAccounts: any[];
    totalAccounts: number;
  }> {
    return this.gocardlessService.getConnectedAccountsForUser(user.id);
  }

  @Post('sync-balances')
  @ApiOperation({
    summary:
      'Synchronize account balances with GoCardless without importing transactions',
  })
  @ApiResponse({
    status: 200,
    description: 'Balances synchronized successfully',
  })
  async syncBalances(@CurrentUser() user: User): Promise<{
    syncResults: any[];
    summary: {
      totalAccounts: number;
      successfulSyncs: number;
      failedSyncs: number;
    };
  }> {
    return this.gocardlessService.syncAccountBalances(user.id);
  }
}
