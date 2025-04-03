import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { BankAccount } from './entities/bank-account.entity';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';  
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { TransactionOperationsService } from '../shared/transaction-operations.service';

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectRepository(BankAccount)
    private bankAccountsRepository: Repository<BankAccount>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(RecurringTransaction)
    private recurringTransactionRepository: Repository<RecurringTransaction>,
    @InjectRepository(CreditCard)
    private creditCardRepository: Repository<CreditCard>,
    private transactionOperationsService: TransactionOperationsService,
  ) {}

  async create(createBankAccountDto: CreateBankAccountDto, user: User): Promise<BankAccount> {
    const bankAccount = this.bankAccountsRepository.create({
      ...createBankAccountDto,
      user,
    });
    return this.bankAccountsRepository.save(bankAccount);
  }

  async findAll(userId: number): Promise<BankAccount[]> {
    return this.bankAccountsRepository.find({
      where: { user: { id: userId } },
      relations: ['user'],
    });
  }

  async findOne(id: number, userId: number): Promise<BankAccount> {
    const bankAccount = await this.bankAccountsRepository.findOne({
      where: { id, user: { id: userId } },
      relations: ['user'],
    });
    
    if (!bankAccount) {
      throw new NotFoundException(`Bank Account with ID ${id} not found`);
    }
    
    return bankAccount;
  }

  async update(id: number, updateBankAccountDto: UpdateBankAccountDto, userId: number): Promise<BankAccount> {
    const bankAccount = await this.findOne(id, userId); 
    await this.bankAccountsRepository.update(id, updateBankAccountDto);
    return this.findOne(id, userId);
  }

  async remove(id: number, userId: number): Promise<void> {
    const bankAccount = await this.findOne(id, userId);
    
    // Check if the bank account is linked to any transactions
    const linkedTransactions = await this.transactionRepository.find({
        where: { bankAccount: { id } }
    });
    
    // Check if the bank account is linked to any recurring transactions
    const linkedRecurringTransactions = await this.recurringTransactionRepository.find({
        where: { bankAccount: { id } }
    });

    // Check if the bank account is linked to any credit cards
    const linkedCreditCards = await this.creditCardRepository.find({
        where: { bankAccount: { id } }
    });

    if (linkedTransactions.length > 0 || linkedRecurringTransactions.length > 0 || linkedCreditCards.length > 0) {
        throw new ForbiddenException('Cannot delete bank account linked to transactions, recurring transactions, or credit cards');
    }

    const result = await this.bankAccountsRepository.delete(id);
    if (result.affected === 0) {
        throw new NotFoundException(`Bank Account with ID ${id} not found`);
    }
  }
}
