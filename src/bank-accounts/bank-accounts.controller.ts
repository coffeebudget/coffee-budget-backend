import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { BankAccountsService } from './bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { BankAccount } from './entities/bank-account.entity';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/user.decorator';
import { User } from '../users/user.entity';

@ApiTags('bank-accounts')
@ApiBearerAuth()
@Controller('bank-accounts')
@UseGuards(AuthGuard('jwt'))
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Get()
  @ApiResponse({ status: 200, description: 'Retrieve all bank accounts.' })
  findAll(@CurrentUser() user: User): Promise<BankAccount[]> {
    return this.bankAccountsService.findAll(user.id);
  }

  @Post()
  @ApiResponse({ status: 201, description: 'Create a new bank account.' })
  create(
    @Body() createBankAccountDto: CreateBankAccountDto,
    @CurrentUser() user: User,
  ): Promise<BankAccount> {
    return this.bankAccountsService.create(createBankAccountDto, user);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Retrieve a bank account by ID.' })
  findOne(
    @Param('id') id: number,
    @CurrentUser() user: User,
  ): Promise<BankAccount> {
    return this.bankAccountsService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, description: 'Update a bank account.' })
  update(
    @Param('id') id: number,
    @Body() updateBankAccountDto: UpdateBankAccountDto,
    @CurrentUser() user: User,
  ): Promise<BankAccount> {
    return this.bankAccountsService.update(id, updateBankAccountDto, user.id);
  }

  @Delete(':id')
  @ApiResponse({ status: 204, description: 'Delete a bank account.' })
  remove(@Param('id') id: number, @CurrentUser() user: User): Promise<void> {
    return this.bankAccountsService.remove(id, user.id);
  }
}
