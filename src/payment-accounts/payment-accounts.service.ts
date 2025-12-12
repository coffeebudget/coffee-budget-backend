import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentAccount } from './payment-account.entity';

@Injectable()
export class PaymentAccountsService {
  constructor(
    @InjectRepository(PaymentAccount)
    private readonly paymentAccountRepository: Repository<PaymentAccount>,
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
}
