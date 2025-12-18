import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { PaymentActivity } from './payment-activity.entity';
import { PaymentAccount } from '../payment-accounts/payment-account.entity';
import { EventPublisherService } from '../shared/services/event-publisher.service';
import { PaymentActivityCreatedEvent } from '../shared/events/payment-activity-created.event';
import { PaymentActivityBusinessRulesService } from './payment-activity-business-rules.service';

@Injectable()
export class PaymentActivitiesService {
  constructor(
    @InjectRepository(PaymentActivity)
    private readonly paymentActivityRepository: Repository<PaymentActivity>,
    @InjectRepository(PaymentAccount)
    private readonly paymentAccountRepository: Repository<PaymentAccount>,
    private readonly eventPublisher: EventPublisherService,
    private readonly businessRulesService: PaymentActivityBusinessRulesService,
  ) {}

  /**
   * Find all payment activities for a payment account
   */
  async findAllByPaymentAccount(
    paymentAccountId: number,
    userId: number,
  ): Promise<PaymentActivity[]> {
    return this.paymentActivityRepository.find({
      where: {
        paymentAccountId,
        paymentAccount: { userId },
      },
      relations: ['paymentAccount', 'reconciledTransaction'],
      order: { executionDate: 'DESC' },
    });
  }

  /**
   * Find a single payment activity by ID (with user isolation)
   */
  async findOne(
    id: number,
    userId: number,
  ): Promise<PaymentActivity> {
    const activity = await this.paymentActivityRepository.findOne({
      where: {
        id,
        paymentAccount: { userId },
      },
      relations: ['paymentAccount', 'reconciledTransaction'],
    });

    if (!activity) {
      throw new NotFoundException(
        `Payment activity with ID ${id} not found for user`,
      );
    }

    return activity;
  }

  /**
   * Create a new payment activity
   */
  async create(
    userId: number,
    data: {
      paymentAccountId: number;
      externalId: string;
      merchantName?: string;
      merchantCategory?: string;
      merchantCategoryCode?: string;
      amount: number;
      executionDate: Date;
      description?: string;
      rawData: Record<string, any>;
    },
  ): Promise<PaymentActivity> {
    // Verify payment account belongs to user
    const paymentAccount = await this.paymentAccountRepository.findOne({
      where: {
        id: data.paymentAccountId,
        userId,
      },
    });

    if (!paymentAccount) {
      throw new NotFoundException('Payment account not found for user');
    }

    // Create temporary activity object for business rules evaluation
    const tempActivity = {
      ...data,
      reconciliationStatus: 'pending',
    } as PaymentActivity;

    // Determine initial reconciliation status using business rules
    const initialStatus =
      this.businessRulesService.determineInitialReconciliationStatus(
        tempActivity,
      );

    const activity = this.paymentActivityRepository.create({
      ...data,
      reconciliationStatus: initialStatus,
    });

    const savedActivity = await this.paymentActivityRepository.save(activity);

    // Only publish event for activities that need reconciliation
    if (initialStatus === 'pending') {
      this.eventPublisher.publish(
        new PaymentActivityCreatedEvent(savedActivity, userId),
      );
    }

    return savedActivity;
  }

  /**
   * Find pending payment activities (not yet reconciled)
   */
  async findPending(userId: number): Promise<PaymentActivity[]> {
    return this.paymentActivityRepository.find({
      where: {
        reconciliationStatus: 'pending',
        paymentAccount: { userId },
      },
      relations: ['paymentAccount'],
      order: { executionDate: 'DESC' },
    });
  }

  /**
   * Find payment activities by date range for reconciliation matching
   * Used by reconciliation algorithm to find candidates within ±3 days
   */
  async findByDateRange(
    userId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<PaymentActivity[]> {
    return this.paymentActivityRepository.find({
      where: {
        executionDate: Between(startDate, endDate),
        reconciliationStatus: 'pending',
        paymentAccount: { userId },
      },
      relations: ['paymentAccount'],
      order: { executionDate: 'ASC' },
    });
  }

  /**
   * Update reconciliation status and link to transaction
   */
  async updateReconciliation(
    id: number,
    userId: number,
    data: {
      reconciledTransactionId: number;
      reconciliationStatus: 'reconciled' | 'failed' | 'manual';
      reconciliationConfidence?: number;
    },
  ): Promise<PaymentActivity> {
    const activity = await this.findOne(id, userId);

    Object.assign(activity, {
      ...data,
      reconciledAt: new Date(),
    });

    return this.paymentActivityRepository.save(activity);
  }

  /**
   * Mark reconciliation as failed for manual review
   */
  async markReconciliationFailed(
    id: number,
    userId: number,
  ): Promise<PaymentActivity> {
    const activity = await this.findOne(id, userId);

    activity.reconciliationStatus = 'failed';

    return this.paymentActivityRepository.save(activity);
  }

  /**
   * Find payment activity by external ID (for duplicate prevention)
   */
  async findByExternalId(
    externalId: string,
    userId: number,
  ): Promise<PaymentActivity | null> {
    return this.paymentActivityRepository.findOne({
      where: {
        externalId,
        paymentAccount: { userId },
      },
      relations: ['paymentAccount'],
    });
  }

  /**
   * Get reconciliation statistics for a user
   */
  async getReconciliationStats(userId: number): Promise<{
    total: number;
    pending: number;
    reconciled: number;
    failed: number;
    manual: number;
    notApplicable: number;
  }> {
    const [total, pending, reconciled, failed, manual, notApplicable] =
      await Promise.all([
        this.paymentActivityRepository.count({
          where: { paymentAccount: { userId } },
        }),
        this.paymentActivityRepository.count({
          where: {
            paymentAccount: { userId },
            reconciliationStatus: 'pending',
          },
        }),
        this.paymentActivityRepository.count({
          where: {
            paymentAccount: { userId },
            reconciliationStatus: 'reconciled',
          },
        }),
        this.paymentActivityRepository.count({
          where: { paymentAccount: { userId }, reconciliationStatus: 'failed' },
        }),
        this.paymentActivityRepository.count({
          where: { paymentAccount: { userId }, reconciliationStatus: 'manual' },
        }),
        this.paymentActivityRepository.count({
          where: {
            paymentAccount: { userId },
            reconciliationStatus: 'not_applicable',
          },
        }),
      ]);

    return { total, pending, reconciled, failed, manual, notApplicable };
  }
}
