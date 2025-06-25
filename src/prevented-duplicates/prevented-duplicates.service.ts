import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PreventedDuplicate } from './entities/prevented-duplicate.entity';
import { Transaction } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';

@Injectable()
export class PreventedDuplicatesService {
  constructor(
    @InjectRepository(PreventedDuplicate)
    private preventedDuplicatesRepository: Repository<PreventedDuplicate>,
  ) {}

  async createPreventedDuplicate(
    existingTransaction: Transaction,
    blockedTransactionData: any,
    source: 'recurring' | 'csv_import' | 'api',
    sourceReference: string | null,
    similarityScore: number,
    reason: string,
    user: User,
  ): Promise<PreventedDuplicate> {
    const preventedDuplicate = this.preventedDuplicatesRepository.create({
      existingTransaction,
      blockedTransactionData,
      source,
      sourceReference,
      similarityScore,
      reason,
      user,
    });

    return await this.preventedDuplicatesRepository.save(preventedDuplicate);
  }

  async getPreventedDuplicatesByUser(
    userId: number,
  ): Promise<PreventedDuplicate[]> {
    return await this.preventedDuplicatesRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async getPreventedDuplicatesCount(userId: number): Promise<number> {
    return await this.preventedDuplicatesRepository.count({
      where: { user: { id: userId } },
    });
  }
}
