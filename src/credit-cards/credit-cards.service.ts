import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCreditCardDto } from './dto/create-credit-card.dto';
import { UpdateCreditCardDto } from './dto/update-credit-card.dto';
import { CreditCard } from './entities/credit-card.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { User } from '../users/user.entity';
import { TransactionOperationsService } from '../shared/transaction-operations.service';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';

@Injectable()
export class CreditCardsService {
  constructor(
    @InjectRepository(CreditCard)
    private creditCardsRepository: Repository<CreditCard>,
    @InjectRepository(BankAccount)
    private bankAccountsRepository: Repository<BankAccount>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(RecurringTransaction)
    private recurringTransactionRepository: Repository<RecurringTransaction>,
    private transactionOperationsService: TransactionOperationsService,
  ) {}

  async create(createCreditCardDto: CreateCreditCardDto, user: User): Promise<CreditCard> {
    const { bankAccountId, ...creditCardData } = createCreditCardDto;
    
    let bankAccount: BankAccount | null = null;
    if (bankAccountId) {
      // Ensure bankAccountId is an integer
      if (!Number.isInteger(bankAccountId)) {
        throw new BadRequestException('Bank Account ID must be an integer');
      }

      // Find the bank account and ensure it belongs to the user
      bankAccount = await this.bankAccountsRepository.findOne({
        where: { 
          id: bankAccountId,
          user: { id: user.id }
        }
      });

      if (!bankAccount) {
        throw new NotFoundException(`Bank account with ID ${bankAccountId} not found`);
      }
    }

    const creditCard = this.creditCardsRepository.create({
      ...creditCardData,
      user,
      bankAccount: bankAccount || undefined
    });

    return this.creditCardsRepository.save(creditCard);
  }

  async findAll(userId: number): Promise<CreditCard[]> {
    return this.creditCardsRepository.find({
      where: { user: { id: userId } },
      relations: ['user', 'bankAccount'],
    });
  }

  async findOne(id: number, userId: number): Promise<CreditCard> {
    if (!Number.isInteger(id)) {
      throw new BadRequestException('Credit Card ID must be an integer');
    }

    const creditCard = await this.creditCardsRepository.findOne({
      where: { id, user: { id: userId } },
      relations: ['user', 'bankAccount'],
    });
    
    if (!creditCard) {
      throw new NotFoundException(`Credit Card with ID ${id} not found`);
    }
    
    return creditCard;
  }

  async update(id: number, updateCreditCardDto: UpdateCreditCardDto, userId: number): Promise<CreditCard> {
    const { bankAccountId, ...updateData } = updateCreditCardDto;
    
    // First check if the credit card exists and belongs to the user
    const creditCard = await this.findOne(id, userId);

    // Validate numeric fields
    if (updateData.creditLimit !== undefined && updateData.creditLimit < 0) {
      throw new BadRequestException('Credit limit cannot be negative');
    }
    if (updateData.availableCredit !== undefined && updateData.availableCredit < 0) {
      throw new BadRequestException('Available credit cannot be negative');
    }
    if (updateData.currentBalance !== undefined && updateData.currentBalance < 0) {
      throw new BadRequestException('Current balance cannot be negative');
    }
    if (updateData.interestRate !== undefined && updateData.interestRate < 0) {
      throw new BadRequestException('Interest rate cannot be negative');
    }
    if (updateData.billingDay !== undefined) {
      if (!Number.isInteger(updateData.billingDay) || updateData.billingDay < 1 || updateData.billingDay > 31) {
        throw new BadRequestException('Billing day must be an integer between 1 and 31');
      }
    }

    let bankAccountToUpdate: BankAccount | null = null;
    // Handle bank account relationship
    if (bankAccountId !== undefined) {
      if (bankAccountId === null) {
        bankAccountToUpdate = null;
      } else {
        const bankAccount = await this.bankAccountsRepository.findOne({
          where: { id: bankAccountId, user: { id: userId } }
        });
        if (!bankAccount) {
          throw new NotFoundException(`Bank account with ID ${bankAccountId} not found`);
        }
        bankAccountToUpdate = bankAccount;
      }
    }

    // Update the credit card with validated data
    const updatedCreditCard = await this.creditCardsRepository.save({
      ...creditCard,
      ...updateData,
      bankAccount: bankAccountToUpdate || undefined
    });

    return this.findOne(id, userId);  
  }

  async remove(id: number, userId: number): Promise<void> {
    if (!Number.isInteger(id)) {
      throw new BadRequestException('Credit Card ID must be an integer');
    }

    const queryRunner = this.creditCardsRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check if credit card exists and belongs to user
      const creditCard = await this.findOne(id, userId);

      // Check if credit card is used in any transactions
      const transactionsWithCreditCard = await queryRunner.manager.find('Transaction', {
        where: { creditCard: { id }, user: { id: userId } }
      });

      if (transactionsWithCreditCard.length > 0) {
        throw new ConflictException(
          `Cannot delete credit card: it is used in ${transactionsWithCreditCard.length} transaction(s)`
        );
      }

      const result = await queryRunner.manager.delete('CreditCard', { id, user: { id: userId } });
      
      if (result.affected === 0) {
        throw new NotFoundException(`Credit Card with ID ${id} not found`);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
