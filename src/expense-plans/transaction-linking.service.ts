import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExpensePlan } from './entities/expense-plan.entity';
import { ExpensePlanPayment } from './entities/expense-plan-payment.entity';
import { Transaction } from '../transactions/transaction.entity';

/**
 * TransactionLinkingService handles linking transactions to expense plans.
 *
 * Responsibilities:
 * - Auto-linking transactions to plans with autoTrackCategory enabled
 * - Creating ExpensePlanPayment records
 * - Checking if transactions are already linked
 */
@Injectable()
export class TransactionLinkingService {
  private readonly logger = new Logger(TransactionLinkingService.name);

  constructor(
    @InjectRepository(ExpensePlanPayment)
    private readonly paymentRepository: Repository<ExpensePlanPayment>,
    @InjectRepository(ExpensePlan)
    private readonly expensePlanRepository: Repository<ExpensePlan>,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-LINK TRANSACTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Find expense plans with auto-track enabled that match the transaction's category
   */
  async findAutoTrackPlans(
    categoryId: number,
    userId: number,
  ): Promise<ExpensePlan[]> {
    return this.expensePlanRepository.find({
      where: {
        userId,
        categoryId,
        autoTrackCategory: true,
        status: 'active',
      },
    });
  }

  /**
   * Create an auto-linked payment for a transaction
   */
  async createAutoLinkedPayment(
    plan: ExpensePlan,
    transaction: Transaction,
  ): Promise<ExpensePlanPayment> {
    const paymentDate = transaction.executionDate || new Date();
    const year = paymentDate.getFullYear();
    const month = paymentDate.getMonth() + 1; // 1-indexed

    const payment = this.paymentRepository.create({
      expensePlanId: plan.id,
      transactionId: transaction.id,
      amount: Math.abs(Number(transaction.amount)), // Expenses are negative
      paymentDate,
      year,
      month,
      paymentType: 'auto_linked',
    });

    const saved = await this.paymentRepository.save(payment);

    this.logger.log('Created auto-linked payment', {
      paymentId: saved.id,
      expensePlanId: plan.id,
      transactionId: transaction.id,
      amount: saved.amount,
      period: saved.getPeriod(),
    });

    return saved;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MANUAL LINK
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Manually link a transaction to an expense plan
   */
  async linkTransaction(
    planId: number,
    transactionId: number,
    userId: number,
    notes?: string,
  ): Promise<ExpensePlanPayment> {
    // Verify plan exists and belongs to user
    const plan = await this.expensePlanRepository.findOne({
      where: { id: planId, userId },
    });

    if (!plan) {
      throw new NotFoundException(`Expense plan ${planId} not found`);
    }

    // Check if already linked
    const existing = await this.paymentRepository.findOne({
      where: { transactionId, expensePlanId: planId },
    });

    if (existing) {
      this.logger.debug('Transaction already linked to this plan', {
        transactionId,
        planId,
      });
      return existing;
    }

    // Load transaction and verify ownership
    const transaction = await this.paymentRepository.manager
      .getRepository(Transaction)
      .findOne({
        where: { id: transactionId },
        relations: ['user'],
      });

    if (!transaction || transaction.user?.id !== userId) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }

    const paymentDate = transaction.executionDate || new Date();
    const year = paymentDate.getFullYear();
    const month = paymentDate.getMonth() + 1;

    const payment = this.paymentRepository.create({
      expensePlanId: planId,
      transactionId,
      amount: Math.abs(Number(transaction.amount)),
      paymentDate,
      year,
      month,
      paymentType: 'manual',
      notes,
    });

    const saved = await this.paymentRepository.save(payment);

    this.logger.log('Created manual payment link', {
      paymentId: saved.id,
      expensePlanId: planId,
      transactionId,
    });

    return saved;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNLINK
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Unlink a transaction from an expense plan
   */
  async unlinkTransaction(
    paymentId: number,
    userId: number,
  ): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['expensePlan'],
    });

    if (!payment || payment.expensePlan.userId !== userId) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    // Mark as unlinked (keep record for history)
    payment.paymentType = 'unlinked';
    payment.transactionId = null;
    await this.paymentRepository.save(payment);

    this.logger.log('Unlinked transaction from expense plan', {
      paymentId,
      expensePlanId: payment.expensePlanId,
    });
  }

  /**
   * Delete a payment record entirely
   */
  async deletePayment(paymentId: number, userId: number): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['expensePlan'],
    });

    if (!payment || payment.expensePlan.userId !== userId) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    await this.paymentRepository.remove(payment);

    this.logger.log('Deleted payment record', {
      paymentId,
      expensePlanId: payment.expensePlanId,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if a transaction is already linked to a specific plan
   */
  async isTransactionLinked(
    transactionId: number,
    planId: number,
  ): Promise<boolean> {
    const existing = await this.paymentRepository.findOne({
      where: {
        transactionId,
        expensePlanId: planId,
      },
    });

    return !!existing && existing.paymentType !== 'unlinked';
  }

  /**
   * Get all payments for an expense plan
   */
  async getPaymentsForPlan(
    planId: number,
    userId: number,
  ): Promise<ExpensePlanPayment[]> {
    const plan = await this.expensePlanRepository.findOne({
      where: { id: planId, userId },
    });

    if (!plan) {
      throw new NotFoundException(`Expense plan ${planId} not found`);
    }

    return this.paymentRepository.find({
      where: { expensePlanId: planId },
      relations: ['transaction'],
      order: { paymentDate: 'DESC' },
    });
  }

  /**
   * Get payments for a specific period
   */
  async getPaymentsForPeriod(
    planId: number,
    year: number,
    month: number,
    userId: number,
  ): Promise<ExpensePlanPayment[]> {
    const plan = await this.expensePlanRepository.findOne({
      where: { id: planId, userId },
    });

    if (!plan) {
      throw new NotFoundException(`Expense plan ${planId} not found`);
    }

    return this.paymentRepository.find({
      where: { expensePlanId: planId, year, month },
      relations: ['transaction'],
      order: { paymentDate: 'DESC' },
    });
  }

  /**
   * Get total amount spent for a plan in a period
   */
  async getTotalForPeriod(
    planId: number,
    year: number,
    month: number,
  ): Promise<number> {
    const result = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'total')
      .where('payment.expensePlanId = :planId', { planId })
      .andWhere('payment.year = :year', { year })
      .andWhere('payment.month = :month', { month })
      .andWhere('payment.paymentType != :unlinked', { unlinked: 'unlinked' })
      .getRawOne();

    return Number(result?.total || 0);
  }

  /**
   * Get linked expense plans for multiple transactions
   * Returns a map of transactionId -> linked expense plan info
   */
  async getLinkedPlansForTransactions(
    transactionIds: number[],
    userId: number,
  ): Promise<
    Map<
      number,
      { planId: number; planName: string; planIcon: string | null }[]
    >
  > {
    if (transactionIds.length === 0) {
      return new Map();
    }

    const payments = await this.paymentRepository
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.expensePlan', 'plan')
      .where('payment.transactionId IN (:...transactionIds)', { transactionIds })
      .andWhere('plan.userId = :userId', { userId })
      .andWhere('payment.paymentType != :unlinked', { unlinked: 'unlinked' })
      .getMany();

    const result = new Map<
      number,
      { planId: number; planName: string; planIcon: string | null }[]
    >();

    for (const payment of payments) {
      if (!payment.transactionId) continue;

      const existing = result.get(payment.transactionId) || [];
      existing.push({
        planId: payment.expensePlanId,
        planName: payment.expensePlan.name,
        planIcon: payment.expensePlan.icon,
      });
      result.set(payment.transactionId, existing);
    }

    return result;
  }
}
