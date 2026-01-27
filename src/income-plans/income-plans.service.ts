import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { IncomePlan, MonthlyAmounts } from './entities/income-plan.entity';
import { IncomePlanEntry } from './entities/income-plan-entry.entity';
import { Transaction } from '../transactions/transaction.entity';
import { EventPublisherService } from '../shared/services/event-publisher.service';
import {
  IncomePlanCreatedEvent,
  IncomePlanUpdatedEvent,
  IncomePlanDeletedEvent,
} from '../shared/events/income-plan.events';
import { CreateIncomePlanDto } from './dto/create-income-plan.dto';
import { UpdateIncomePlanDto } from './dto/update-income-plan.dto';
import {
  IncomePlanSummaryDto,
  MonthlySummaryDto,
  AnnualSummaryDto,
} from './dto/income-plan-summary.dto';
import {
  CreateIncomePlanEntryDto,
  UpdateIncomePlanEntryDto,
  LinkTransactionToIncomePlanDto,
  IncomePlanEntryResponseDto,
  IncomePlanTrackingSummaryDto,
  MonthlyTrackingSummaryDto,
  AnnualTrackingSummaryDto,
  IncomePlanEntryStatus,
  TransactionSuggestionDto,
  TransactionSuggestionsResponseDto,
} from './dto/income-plan-entry.dto';

@Injectable()
export class IncomePlansService {
  constructor(
    @InjectRepository(IncomePlan)
    private readonly incomePlanRepository: Repository<IncomePlan>,
    @InjectRepository(IncomePlanEntry)
    private readonly entryRepository: Repository<IncomePlanEntry>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND ALL
  // ═══════════════════════════════════════════════════════════════════════════

  async findAllByUser(userId: number): Promise<IncomePlan[]> {
    return this.incomePlanRepository.find({
      where: { userId },
      relations: ['category', 'paymentAccount'],
      order: { name: 'ASC' },
    });
  }

  async findActiveByUser(userId: number): Promise<IncomePlan[]> {
    return this.incomePlanRepository.find({
      where: { userId, status: 'active' },
      relations: ['category', 'paymentAccount'],
      order: { name: 'ASC' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND ONE
  // ═══════════════════════════════════════════════════════════════════════════

  async findOne(id: number, userId: number): Promise<IncomePlan> {
    const plan = await this.incomePlanRepository.findOne({
      where: { id, userId },
      relations: ['category', 'paymentAccount'],
    });

    if (!plan) {
      throw new NotFoundException(`Income plan with ID ${id} not found`);
    }

    return plan;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE
  // ═══════════════════════════════════════════════════════════════════════════

  async create(
    userId: number,
    createDto: CreateIncomePlanDto,
  ): Promise<IncomePlan> {
    const plan = this.incomePlanRepository.create({
      userId,
      name: createDto.name,
      description: createDto.description ?? null,
      icon: createDto.icon ?? null,
      reliability: createDto.reliability ?? 'guaranteed',
      categoryId: createDto.categoryId ?? null,
      january: createDto.january ?? 0,
      february: createDto.february ?? 0,
      march: createDto.march ?? 0,
      april: createDto.april ?? 0,
      may: createDto.may ?? 0,
      june: createDto.june ?? 0,
      july: createDto.july ?? 0,
      august: createDto.august ?? 0,
      september: createDto.september ?? 0,
      october: createDto.october ?? 0,
      november: createDto.november ?? 0,
      december: createDto.december ?? 0,
      paymentAccountId: createDto.paymentAccountId ?? null,
      expectedDay: createDto.expectedDay ?? null,
      status: createDto.status ?? 'active',
    });

    const savedPlan = await this.incomePlanRepository.save(plan);

    this.eventPublisher.publish(new IncomePlanCreatedEvent(savedPlan, userId));

    return savedPlan;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  async update(
    id: number,
    userId: number,
    updateDto: UpdateIncomePlanDto,
  ): Promise<IncomePlan> {
    const plan = await this.findOne(id, userId);

    // Apply updates
    if (updateDto.name !== undefined) plan.name = updateDto.name;
    if (updateDto.description !== undefined)
      plan.description = updateDto.description;
    if (updateDto.icon !== undefined) plan.icon = updateDto.icon;
    if (updateDto.reliability !== undefined)
      plan.reliability = updateDto.reliability;
    if (updateDto.categoryId !== undefined)
      plan.categoryId = updateDto.categoryId;
    if (updateDto.january !== undefined) plan.january = updateDto.january;
    if (updateDto.february !== undefined) plan.february = updateDto.february;
    if (updateDto.march !== undefined) plan.march = updateDto.march;
    if (updateDto.april !== undefined) plan.april = updateDto.april;
    if (updateDto.may !== undefined) plan.may = updateDto.may;
    if (updateDto.june !== undefined) plan.june = updateDto.june;
    if (updateDto.july !== undefined) plan.july = updateDto.july;
    if (updateDto.august !== undefined) plan.august = updateDto.august;
    if (updateDto.september !== undefined) plan.september = updateDto.september;
    if (updateDto.october !== undefined) plan.october = updateDto.october;
    if (updateDto.november !== undefined) plan.november = updateDto.november;
    if (updateDto.december !== undefined) plan.december = updateDto.december;
    if (updateDto.paymentAccountId !== undefined)
      plan.paymentAccountId = updateDto.paymentAccountId;
    if (updateDto.expectedDay !== undefined)
      plan.expectedDay = updateDto.expectedDay;
    if (updateDto.status !== undefined) plan.status = updateDto.status;

    const savedPlan = await this.incomePlanRepository.save(plan);

    this.eventPublisher.publish(new IncomePlanUpdatedEvent(savedPlan, userId));

    return savedPlan;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════════════════════

  async delete(id: number, userId: number): Promise<void> {
    const plan = await this.findOne(id, userId);

    await this.incomePlanRepository.remove(plan);

    this.eventPublisher.publish(new IncomePlanDeletedEvent(id, userId));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY: MONTHLY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get monthly income summary for a specific month
   * Used for dashboard budget calculation
   */
  async getMonthlySummary(
    userId: number,
    year: number,
    month: number,
  ): Promise<MonthlySummaryDto> {
    const plans = await this.findActiveByUser(userId);
    const monthIndex = month - 1; // Convert 1-indexed to 0-indexed

    let guaranteedTotal = 0;
    let expectedTotal = 0;
    let uncertainTotal = 0;

    const planSummaries: IncomePlanSummaryDto[] = plans.map((plan) => {
      const currentMonthAmount = plan.getAmountForMonth(monthIndex);

      // Accumulate by reliability
      switch (plan.reliability) {
        case 'guaranteed':
          guaranteedTotal += currentMonthAmount;
          break;
        case 'expected':
          expectedTotal += currentMonthAmount;
          break;
        case 'uncertain':
          uncertainTotal += currentMonthAmount;
          break;
      }

      return {
        id: plan.id,
        name: plan.name,
        icon: plan.icon,
        reliability: plan.reliability,
        annualTotal: plan.getAnnualTotal(),
        monthlyAverage: plan.getMonthlyAverage(),
        currentMonthExpected: currentMonthAmount,
      };
    });

    return {
      year,
      month,
      guaranteedTotal,
      expectedTotal,
      uncertainTotal,
      totalIncome: guaranteedTotal + expectedTotal + uncertainTotal,
      budgetSafeIncome: guaranteedTotal,
      planCount: plans.length,
      plans: planSummaries,
    };
  }

  /**
   * Get monthly summary for current month (convenience method)
   */
  async getCurrentMonthlySummary(userId: number): Promise<MonthlySummaryDto> {
    const now = new Date();
    return this.getMonthlySummary(
      userId,
      now.getFullYear(),
      now.getMonth() + 1,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY: ANNUAL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get annual income summary for planning
   */
  async getAnnualSummary(
    userId: number,
    year: number,
  ): Promise<AnnualSummaryDto> {
    const plans = await this.findActiveByUser(userId);

    // Calculate monthly totals
    const monthlyBreakdown: MonthlyAmounts = {
      january: 0,
      february: 0,
      march: 0,
      april: 0,
      may: 0,
      june: 0,
      july: 0,
      august: 0,
      september: 0,
      october: 0,
      november: 0,
      december: 0,
    };

    const planSummaries: IncomePlanSummaryDto[] = plans.map((plan) => {
      const amounts = plan.getMonthlyAmounts();

      // Accumulate for total monthly breakdown
      monthlyBreakdown.january += amounts.january;
      monthlyBreakdown.february += amounts.february;
      monthlyBreakdown.march += amounts.march;
      monthlyBreakdown.april += amounts.april;
      monthlyBreakdown.may += amounts.may;
      monthlyBreakdown.june += amounts.june;
      monthlyBreakdown.july += amounts.july;
      monthlyBreakdown.august += amounts.august;
      monthlyBreakdown.september += amounts.september;
      monthlyBreakdown.october += amounts.october;
      monthlyBreakdown.november += amounts.november;
      monthlyBreakdown.december += amounts.december;

      return {
        id: plan.id,
        name: plan.name,
        icon: plan.icon,
        reliability: plan.reliability,
        annualTotal: plan.getAnnualTotal(),
        monthlyAverage: plan.getMonthlyAverage(),
        currentMonthExpected: plan.getAmountForMonth(new Date().getMonth()),
      };
    });

    // Calculate totals
    const monthValues = Object.values(monthlyBreakdown);
    const totalAnnualIncome = monthValues.reduce((sum, val) => sum + val, 0);
    const monthlyAverage = totalAnnualIncome / 12;
    const minimumMonth = Math.min(...monthValues);
    const maximumMonth = Math.max(...monthValues);

    return {
      year,
      totalAnnualIncome,
      monthlyAverage,
      monthlyBreakdown,
      minimumMonth,
      maximumMonth,
      planCount: plans.length,
      plans: planSummaries,
    };
  }

  /**
   * Get annual summary for current year (convenience method)
   */
  async getCurrentAnnualSummary(userId: number): Promise<AnnualSummaryDto> {
    return this.getAnnualSummary(userId, new Date().getFullYear());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS: BUDGET CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get guaranteed income total for a specific month
   * Used by dashboard for budget calculation
   */
  async getGuaranteedIncomeForMonth(
    userId: number,
    year: number,
    month: number,
  ): Promise<number> {
    const summary = await this.getMonthlySummary(userId, year, month);
    return summary.guaranteedTotal;
  }

  /**
   * Get all income totals for a specific month grouped by reliability
   */
  async getIncomeByReliabilityForMonth(
    userId: number,
    year: number,
    month: number,
  ): Promise<{ guaranteed: number; expected: number; uncertain: number }> {
    const summary = await this.getMonthlySummary(userId, year, month);
    return {
      guaranteed: summary.guaranteedTotal,
      expected: summary.expectedTotal,
      uncertain: summary.uncertainTotal,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACKING: ENTRY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create or update an income plan entry for a specific month
   */
  async createOrUpdateEntry(
    incomePlanId: number,
    userId: number,
    dto: CreateIncomePlanEntryDto,
  ): Promise<IncomePlanEntryResponseDto> {
    // Verify the income plan exists and belongs to user
    const plan = await this.findOne(incomePlanId, userId);

    // Get expected amount for this month
    const expectedAmount = plan.getAmountForMonth(dto.month - 1);

    // Check if entry already exists
    let entry = await this.entryRepository.findOne({
      where: {
        incomePlanId,
        year: dto.year,
        month: dto.month,
      },
    });

    if (entry) {
      // Update existing entry
      entry.actualAmount = dto.actualAmount;
      if (dto.transactionId !== undefined) {
        entry.transactionId = dto.transactionId;
      }
      if (dto.note !== undefined) {
        entry.note = dto.note;
      }
    } else {
      // Create new entry
      entry = this.entryRepository.create({
        incomePlanId,
        year: dto.year,
        month: dto.month,
        actualAmount: dto.actualAmount,
        expectedAmount,
        transactionId: dto.transactionId ?? null,
        note: dto.note ?? null,
        isAutomatic: false,
      });
    }

    const savedEntry = await this.entryRepository.save(entry);
    return this.mapEntryToResponse(savedEntry);
  }

  /**
   * Update an existing income plan entry
   */
  async updateEntry(
    entryId: number,
    incomePlanId: number,
    userId: number,
    dto: UpdateIncomePlanEntryDto,
  ): Promise<IncomePlanEntryResponseDto> {
    // Verify the income plan belongs to user
    await this.findOne(incomePlanId, userId);

    const entry = await this.entryRepository.findOne({
      where: { id: entryId, incomePlanId },
    });

    if (!entry) {
      throw new NotFoundException(`Entry with ID ${entryId} not found`);
    }

    if (dto.actualAmount !== undefined) {
      entry.actualAmount = dto.actualAmount;
    }
    if (dto.transactionId !== undefined) {
      entry.transactionId = dto.transactionId;
    }
    if (dto.note !== undefined) {
      entry.note = dto.note;
    }

    const savedEntry = await this.entryRepository.save(entry);
    return this.mapEntryToResponse(savedEntry);
  }

  /**
   * Delete an income plan entry
   */
  async deleteEntry(
    entryId: number,
    incomePlanId: number,
    userId: number,
  ): Promise<void> {
    // Verify the income plan belongs to user
    await this.findOne(incomePlanId, userId);

    const entry = await this.entryRepository.findOne({
      where: { id: entryId, incomePlanId },
    });

    if (!entry) {
      throw new NotFoundException(`Entry with ID ${entryId} not found`);
    }

    await this.entryRepository.remove(entry);
  }

  /**
   * Get all entries for an income plan
   */
  async getEntriesForPlan(
    incomePlanId: number,
    userId: number,
    year?: number,
  ): Promise<IncomePlanEntryResponseDto[]> {
    // Verify the income plan belongs to user
    await this.findOne(incomePlanId, userId);

    const whereClause: { incomePlanId: number; year?: number } = {
      incomePlanId,
    };
    if (year !== undefined) {
      whereClause.year = year;
    }

    const entries = await this.entryRepository.find({
      where: whereClause,
      order: { year: 'DESC', month: 'DESC' },
      relations: ['transaction'],
    });

    return entries.map((entry) => this.mapEntryToResponse(entry));
  }

  /**
   * Get entry for a specific month
   */
  async getEntryForMonth(
    incomePlanId: number,
    userId: number,
    year: number,
    month: number,
  ): Promise<IncomePlanEntryResponseDto | null> {
    // Verify the income plan belongs to user
    await this.findOne(incomePlanId, userId);

    const entry = await this.entryRepository.findOne({
      where: { incomePlanId, year, month },
      relations: ['transaction'],
    });

    return entry ? this.mapEntryToResponse(entry) : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACKING: LINK TRANSACTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Link a transaction to an income plan, creating or updating the entry
   */
  async linkTransaction(
    incomePlanId: number,
    userId: number,
    dto: LinkTransactionToIncomePlanDto,
  ): Promise<IncomePlanEntryResponseDto> {
    // Verify the income plan belongs to user
    const plan = await this.findOne(incomePlanId, userId);

    // Get expected amount for this month
    const expectedAmount = plan.getAmountForMonth(dto.month - 1);

    // Check if entry already exists
    let entry = await this.entryRepository.findOne({
      where: {
        incomePlanId,
        year: dto.year,
        month: dto.month,
      },
    });

    // We need to fetch the transaction amount - for now we'll allow linking
    // but the actual amount should be set separately or fetched from transaction
    // This is a simplified version - in production you might query the transaction

    if (entry) {
      // Update with transaction link
      entry.transactionId = dto.transactionId;
      if (dto.note !== undefined) {
        entry.note = dto.note;
      }
    } else {
      // Create new entry with transaction link
      // actualAmount will need to be updated separately or fetched from transaction
      entry = this.entryRepository.create({
        incomePlanId,
        year: dto.year,
        month: dto.month,
        actualAmount: 0, // Will be updated when actual amount is provided
        expectedAmount,
        transactionId: dto.transactionId,
        note: dto.note ?? null,
        isAutomatic: false,
      });
    }

    const savedEntry = await this.entryRepository.save(entry);
    return this.mapEntryToResponse(savedEntry);
  }

  /**
   * Unlink a transaction from an income plan entry
   */
  async unlinkTransaction(
    incomePlanId: number,
    userId: number,
    year: number,
    month: number,
  ): Promise<IncomePlanEntryResponseDto | null> {
    // Verify the income plan belongs to user
    await this.findOne(incomePlanId, userId);

    const entry = await this.entryRepository.findOne({
      where: { incomePlanId, year, month },
    });

    if (!entry) {
      return null;
    }

    entry.transactionId = null;
    const savedEntry = await this.entryRepository.save(entry);
    return this.mapEntryToResponse(savedEntry);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACKING: SUMMARIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get tracking summary for a specific income plan for a month
   */
  async getTrackingSummaryForPlan(
    incomePlanId: number,
    userId: number,
    year: number,
    month: number,
  ): Promise<IncomePlanTrackingSummaryDto> {
    const plan = await this.findOne(incomePlanId, userId);
    const expectedAmount = plan.getAmountForMonth(month - 1);

    const entry = await this.entryRepository.findOne({
      where: { incomePlanId, year, month },
    });

    let actualAmount = 0;
    let status: IncomePlanEntryStatus = 'pending';
    let hasEntry = false;
    let entryId: number | null = null;
    let transactionId: number | null = null;

    if (entry) {
      actualAmount = Number(entry.actualAmount);
      status = entry.getStatus();
      hasEntry = true;
      entryId = entry.id;
      transactionId = entry.transactionId;
    }

    const difference = actualAmount - expectedAmount;
    const percentageReceived =
      expectedAmount > 0 ? (actualAmount / expectedAmount) * 100 : 100;

    return {
      incomePlanId: plan.id,
      incomePlanName: plan.name,
      incomePlanIcon: plan.icon,
      reliability: plan.reliability,
      year,
      month,
      expectedAmount,
      actualAmount,
      status,
      difference,
      percentageReceived,
      hasEntry,
      entryId,
      transactionId,
    };
  }

  /**
   * Get tracking summary for all active income plans for a month
   */
  async getMonthlyTrackingSummary(
    userId: number,
    year: number,
    month: number,
  ): Promise<MonthlyTrackingSummaryDto> {
    const plans = await this.findActiveByUser(userId);

    let totalExpected = 0;
    let totalReceived = 0;
    let pendingCount = 0;
    let partialCount = 0;
    let receivedCount = 0;
    let exceededCount = 0;

    const planSummaries: IncomePlanTrackingSummaryDto[] = [];

    for (const plan of plans) {
      const summary = await this.getTrackingSummaryForPlan(
        plan.id,
        userId,
        year,
        month,
      );

      totalExpected += summary.expectedAmount;
      totalReceived += summary.actualAmount;

      switch (summary.status) {
        case 'pending':
          pendingCount++;
          break;
        case 'partial':
          partialCount++;
          break;
        case 'received':
          receivedCount++;
          break;
        case 'exceeded':
          exceededCount++;
          break;
      }

      planSummaries.push(summary);
    }

    const totalDifference = totalReceived - totalExpected;
    const overallPercentage =
      totalExpected > 0 ? (totalReceived / totalExpected) * 100 : 100;

    return {
      year,
      month,
      totalExpected,
      totalReceived,
      totalDifference,
      overallPercentage,
      pendingCount,
      partialCount,
      receivedCount,
      exceededCount,
      plans: planSummaries,
    };
  }

  /**
   * Get tracking summary for a full year
   */
  async getAnnualTrackingSummary(
    userId: number,
    year: number,
  ): Promise<AnnualTrackingSummaryDto> {
    const monthSummaries: MonthlyTrackingSummaryDto[] = [];

    let totalExpected = 0;
    let totalReceived = 0;

    for (let month = 1; month <= 12; month++) {
      const monthSummary = await this.getMonthlyTrackingSummary(
        userId,
        year,
        month,
      );
      monthSummaries.push(monthSummary);
      totalExpected += monthSummary.totalExpected;
      totalReceived += monthSummary.totalReceived;
    }

    const totalDifference = totalReceived - totalExpected;
    const overallPercentage =
      totalExpected > 0 ? (totalReceived / totalExpected) * 100 : 100;

    return {
      year,
      totalExpected,
      totalReceived,
      totalDifference,
      overallPercentage,
      months: monthSummaries,
    };
  }

  /**
   * Get current month tracking status for an income plan (for card badge)
   */
  async getCurrentMonthStatus(
    incomePlanId: number,
    userId: number,
  ): Promise<IncomePlanEntryStatus> {
    const now = new Date();
    const summary = await this.getTrackingSummaryForPlan(
      incomePlanId,
      userId,
      now.getFullYear(),
      now.getMonth() + 1,
    );
    return summary.status;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSACTION SUGGESTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Suggest matching transactions for an income plan entry
   * Matching criteria:
   * - Income transactions only (type = 'income')
   * - In the target month/year
   * - Category match (if plan has categoryId)
   * - Amount similarity (within 20% of expected)
   * - Near expected day (if plan has expectedDay)
   */
  async suggestTransactions(
    incomePlanId: number,
    userId: number,
    year: number,
    month: number,
  ): Promise<TransactionSuggestionsResponseDto> {
    const plan = await this.findOne(incomePlanId, userId);
    const expectedAmount = plan.getAmountForMonth(month - 1); // month is 1-indexed, getAmountForMonth is 0-indexed

    // Get existing entry to check if already linked
    const existingEntry = await this.entryRepository.findOne({
      where: { incomePlanId, year, month },
    });

    // Calculate date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Find income transactions in the target month
    const transactions = await this.transactionRepository
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.category', 'category')
      .where('t.user = :userId', { userId })
      .andWhere('t.type = :type', { type: 'income' })
      .andWhere('t.executionDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .orderBy('t.executionDate', 'DESC')
      .getMany();

    // Score and filter transactions
    const suggestions: TransactionSuggestionDto[] = [];

    for (const transaction of transactions) {
      const { confidence, reasons } = this.calculateMatchScore(
        transaction,
        plan,
        expectedAmount,
      );

      // Only include if confidence > 30%
      if (confidence >= 30) {
        suggestions.push({
          transactionId: transaction.id,
          description: transaction.description,
          amount: Number(transaction.amount),
          date: transaction.executionDate || transaction.createdAt,
          categoryId: transaction.category?.id || null,
          categoryName: transaction.category?.name || null,
          merchantName: transaction.merchantName || transaction.creditorName,
          confidence,
          matchReasons: reasons,
        });
      }
    }

    // Sort by confidence descending
    suggestions.sort((a, b) => b.confidence - a.confidence);

    return {
      incomePlanId,
      incomePlanName: plan.name,
      year,
      month,
      expectedAmount,
      suggestions,
      alreadyLinkedTransactionId: existingEntry?.transactionId || null,
    };
  }

  /**
   * Calculate match score for a transaction against an income plan
   */
  private calculateMatchScore(
    transaction: Transaction,
    plan: IncomePlan,
    expectedAmount: number,
  ): { confidence: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    // Category match (40 points)
    if (plan.categoryId && transaction.category?.id === plan.categoryId) {
      score += 40;
      reasons.push('Category matches');
    }

    // Amount similarity (35 points max)
    const amount = Math.abs(Number(transaction.amount));
    const amountDiff = Math.abs(amount - expectedAmount);
    const amountTolerance = expectedAmount * 0.2; // 20% tolerance

    if (amountDiff <= amountTolerance) {
      const amountScore = 35 * (1 - amountDiff / amountTolerance);
      score += amountScore;
      if (amountDiff === 0) {
        reasons.push('Exact amount match');
      } else if (amountDiff <= expectedAmount * 0.05) {
        reasons.push('Amount very close');
      } else {
        reasons.push('Amount similar');
      }
    }

    // Day proximity (25 points max)
    if (plan.expectedDay) {
      const transactionDay = (
        transaction.executionDate || transaction.createdAt
      ).getDate();
      const dayDiff = Math.abs(transactionDay - plan.expectedDay);

      if (dayDiff <= 5) {
        const dayScore = 25 * (1 - dayDiff / 5);
        score += dayScore;
        if (dayDiff === 0) {
          reasons.push('On expected day');
        } else {
          reasons.push('Near expected day');
        }
      }
    } else {
      // No expected day, give some base points
      score += 10;
    }

    return { confidence: Math.min(100, Math.round(score)), reasons };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private mapEntryToResponse(entry: IncomePlanEntry): IncomePlanEntryResponseDto {
    return {
      id: entry.id,
      incomePlanId: entry.incomePlanId,
      year: entry.year,
      month: entry.month,
      actualAmount: Number(entry.actualAmount),
      expectedAmount: Number(entry.expectedAmount),
      transactionId: entry.transactionId,
      note: entry.note,
      isAutomatic: entry.isAutomatic,
      createdAt: entry.createdAt,
      status: entry.getStatus(),
      difference: entry.getDifference(),
      percentageReceived: entry.getPercentageReceived(),
    };
  }
}
