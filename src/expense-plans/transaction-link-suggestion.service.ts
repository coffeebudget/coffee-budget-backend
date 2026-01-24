import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  TransactionLinkSuggestion,
  SuggestedTransactionType,
} from './entities/transaction-link-suggestion.entity';
import { ExpensePlan } from './entities/expense-plan.entity';
import { Transaction } from '../transactions/transaction.entity';
import { ExpensePlansService } from './expense-plans.service';
import {
  TransactionLinkSuggestionResponseDto,
  SuggestionCountsDto,
  ApprovalResultDto,
  BulkApprovalResultDto,
  BulkRejectionResultDto,
} from './dto/transaction-link-suggestion.dto';

@Injectable()
export class TransactionLinkSuggestionService {
  private readonly logger = new Logger(TransactionLinkSuggestionService.name);

  constructor(
    @InjectRepository(TransactionLinkSuggestion)
    private readonly suggestionRepository: Repository<TransactionLinkSuggestion>,
    @InjectRepository(ExpensePlan)
    private readonly expensePlanRepository: Repository<ExpensePlan>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly expensePlansService: ExpensePlansService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND PENDING
  // ═══════════════════════════════════════════════════════════════════════════

  async findPending(
    userId: number,
  ): Promise<TransactionLinkSuggestionResponseDto[]> {
    const suggestions = await this.suggestionRepository.find({
      where: { userId, status: 'pending' },
      relations: ['expensePlan'],
      order: { createdAt: 'DESC' },
    });

    return suggestions.map((s) => this.toResponseDto(s));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET COUNTS
  // ═══════════════════════════════════════════════════════════════════════════

  async getCounts(userId: number): Promise<SuggestionCountsDto> {
    const [pending, total] = await Promise.all([
      this.suggestionRepository.count({
        where: { userId, status: 'pending' },
      }),
      this.suggestionRepository.count({
        where: { userId },
      }),
    ]);

    return { pending, total };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND BY ID
  // ═══════════════════════════════════════════════════════════════════════════

  async findById(id: number, userId: number): Promise<TransactionLinkSuggestion> {
    const suggestion = await this.suggestionRepository.findOne({
      where: { id, userId },
      relations: ['expensePlan', 'transaction'],
    });

    if (!suggestion) {
      throw new NotFoundException(`Suggestion with ID ${id} not found`);
    }

    return suggestion;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE SUGGESTION
  // ═══════════════════════════════════════════════════════════════════════════

  async createSuggestion(
    transaction: Transaction,
    plan: ExpensePlan,
    userId: number,
  ): Promise<TransactionLinkSuggestion> {
    // Determine suggested type based on transaction type
    // Expense transactions → withdrawal from plan
    // Income transactions → contribution to plan
    const suggestedType: SuggestedTransactionType =
      transaction.type === 'expense' ? 'withdrawal' : 'contribution';

    const suggestion = this.suggestionRepository.create({
      userId,
      transactionId: transaction.id,
      expensePlanId: plan.id,
      transactionAmount: Number(transaction.amount),
      transactionDescription: transaction.description,
      transactionDate: transaction.executionDate || transaction.createdAt,
      suggestedType,
      status: 'pending',
    });

    const saved = await this.suggestionRepository.save(suggestion);

    this.logger.log('Created transaction link suggestion', {
      suggestionId: saved.id,
      transactionId: transaction.id,
      expensePlanId: plan.id,
      suggestedType,
    });

    return saved;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPROVE
  // ═══════════════════════════════════════════════════════════════════════════

  async approve(
    id: number,
    userId: number,
    customAmount?: number,
  ): Promise<ApprovalResultDto> {
    const suggestion = await this.findById(id, userId);

    if (suggestion.status !== 'pending') {
      throw new BadRequestException(
        `Suggestion is already ${suggestion.status}`,
      );
    }

    // Use custom amount or the absolute value of transaction amount
    const amount = customAmount ?? Math.abs(Number(suggestion.transactionAmount));

    let planTransaction;

    if (suggestion.suggestedType === 'withdrawal') {
      // Create a withdrawal from the expense plan
      planTransaction = await this.expensePlansService.withdraw(
        suggestion.expensePlanId,
        userId,
        amount,
        `Collegato: ${suggestion.transactionDescription}`,
        suggestion.transactionId,
        false, // Not automatic - user approved it
      );
    } else {
      // Create a contribution to the expense plan
      planTransaction = await this.expensePlansService.contribute(
        suggestion.expensePlanId,
        userId,
        amount,
        `Collegato: ${suggestion.transactionDescription}`,
        suggestion.transactionId,
        false,
      );
    }

    // Update suggestion status
    suggestion.status = 'approved';
    suggestion.expensePlanTransactionId = planTransaction.id;
    suggestion.reviewedAt = new Date();
    await this.suggestionRepository.save(suggestion);

    this.logger.log('Approved transaction link suggestion', {
      suggestionId: id,
      planTransactionId: planTransaction.id,
      newBalance: planTransaction.balanceAfter,
    });

    return {
      success: true,
      planTransactionId: planTransaction.id,
      newBalance: Number(planTransaction.balanceAfter),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REJECT
  // ═══════════════════════════════════════════════════════════════════════════

  async reject(
    id: number,
    userId: number,
    reason?: string,
    neverAskForPlan?: boolean,
  ): Promise<void> {
    const suggestion = await this.findById(id, userId);

    if (suggestion.status !== 'pending') {
      throw new BadRequestException(
        `Suggestion is already ${suggestion.status}`,
      );
    }

    suggestion.status = 'rejected';
    suggestion.rejectionReason = reason || null;
    suggestion.reviewedAt = new Date();
    await this.suggestionRepository.save(suggestion);

    // If neverAskForPlan is true, we could store this preference
    // For now, we just log it for future implementation
    if (neverAskForPlan) {
      this.logger.log('User requested to never ask for this plan', {
        suggestionId: id,
        expensePlanId: suggestion.expensePlanId,
        userId,
      });
      // TODO: Store user preference to not suggest this plan for similar transactions
    }

    this.logger.log('Rejected transaction link suggestion', {
      suggestionId: id,
      reason,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BULK APPROVE
  // ═══════════════════════════════════════════════════════════════════════════

  async bulkApprove(ids: number[], userId: number): Promise<BulkApprovalResultDto> {
    const results: BulkApprovalResultDto = {
      approvedCount: 0,
      failedCount: 0,
      failedIds: [],
    };

    for (const id of ids) {
      try {
        await this.approve(id, userId);
        results.approvedCount++;
      } catch (error) {
        this.logger.warn('Failed to approve suggestion in bulk', {
          suggestionId: id,
          error: error.message,
        });
        results.failedCount++;
        results.failedIds.push(id);
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BULK REJECT
  // ═══════════════════════════════════════════════════════════════════════════

  async bulkReject(
    ids: number[],
    userId: number,
    reason?: string,
  ): Promise<BulkRejectionResultDto> {
    const results: BulkRejectionResultDto = {
      rejectedCount: 0,
      failedCount: 0,
      failedIds: [],
    };

    for (const id of ids) {
      try {
        await this.reject(id, userId, reason);
        results.rejectedCount++;
      } catch (error) {
        this.logger.warn('Failed to reject suggestion in bulk', {
          suggestionId: id,
          error: error.message,
        });
        results.failedCount++;
        results.failedIds.push(id);
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVALIDATE FOR TRANSACTION
  // ═══════════════════════════════════════════════════════════════════════════

  async invalidateForTransaction(transactionId: number): Promise<void> {
    const result = await this.suggestionRepository.update(
      { transactionId, status: 'pending' },
      { status: 'invalidated', reviewedAt: new Date() },
    );

    if (result.affected && result.affected > 0) {
      this.logger.log('Invalidated suggestions for deleted transaction', {
        transactionId,
        count: result.affected,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK EXISTS
  // ═══════════════════════════════════════════════════════════════════════════

  async checkSuggestionExists(
    transactionId: number,
    expensePlanId: number,
  ): Promise<boolean> {
    const existing = await this.suggestionRepository.findOne({
      where: {
        transactionId,
        expensePlanId,
        status: In(['pending', 'approved']),
      },
    });

    return !!existing;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK TRANSACTION ALREADY LINKED
  // ═══════════════════════════════════════════════════════════════════════════

  async isTransactionLinkedToPlan(
    transactionId: number,
    expensePlanId: number,
  ): Promise<boolean> {
    // Check if there's an approved suggestion for this combination
    const approved = await this.suggestionRepository.findOne({
      where: {
        transactionId,
        expensePlanId,
        status: 'approved',
      },
    });

    return !!approved;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND MATCHING PLANS
  // ═══════════════════════════════════════════════════════════════════════════

  async findMatchingPlans(
    categoryId: number,
    userId: number,
  ): Promise<ExpensePlan[]> {
    return this.expensePlanRepository.find({
      where: {
        userId,
        categoryId,
        purpose: 'sinking_fund',
        status: 'active',
        autoTrackCategory: false, // Skip auto-track plans
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private toResponseDto(
    suggestion: TransactionLinkSuggestion,
  ): TransactionLinkSuggestionResponseDto {
    return {
      id: suggestion.id,
      transactionId: suggestion.transactionId,
      transactionDescription: suggestion.transactionDescription,
      transactionAmount: Number(suggestion.transactionAmount),
      transactionDate: suggestion.transactionDate.toISOString(),
      expensePlanId: suggestion.expensePlanId,
      expensePlanName: suggestion.expensePlan?.name ?? 'Unknown',
      expensePlanIcon: suggestion.expensePlan?.icon ?? null,
      suggestedType: suggestion.suggestedType,
      status: suggestion.status,
      createdAt: suggestion.createdAt.toISOString(),
    };
  }
}
