import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IncomeDistributionRule,
  DistributionStrategy,
} from './entities/income-distribution-rule.entity';
import { ExpensePlan } from './entities/expense-plan.entity';
import { Transaction } from '../transactions/transaction.entity';

export interface DistributionItem {
  planId: number;
  amount: number;
}

export interface DistributionResult {
  distributed: DistributionItem[];
  totalDistributed: number;
  remaining: number;
  sourceTransactionId?: number;
}

export interface PendingDistribution {
  planId: number;
  planName: string;
  icon: string | null;
  priority: string;
  monthlyContribution: number;
  amountNeeded: number;
}

export interface CreateRuleDto {
  name: string;
  expectedAmount?: number;
  amountTolerance?: number;
  descriptionPattern?: string;
  categoryId?: number;
  bankAccountId?: number;
  autoDistribute?: boolean;
  distributionStrategy?: DistributionStrategy;
}

export interface UpdateRuleDto {
  name?: string;
  expectedAmount?: number | null;
  amountTolerance?: number;
  descriptionPattern?: string | null;
  categoryId?: number | null;
  bankAccountId?: number | null;
  autoDistribute?: boolean;
  distributionStrategy?: DistributionStrategy;
  isActive?: boolean;
}

@Injectable()
export class IncomeDistributionService {
  constructor(
    @InjectRepository(IncomeDistributionRule)
    private readonly ruleRepository: Repository<IncomeDistributionRule>,
    @InjectRepository(ExpensePlan)
    private readonly planRepository: Repository<ExpensePlan>,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CRUD OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async findAllRules(userId: number): Promise<IncomeDistributionRule[]> {
    return this.ruleRepository.find({
      where: { userId },
      relations: ['category', 'bankAccount'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOneRule(
    id: number,
    userId: number,
  ): Promise<IncomeDistributionRule> {
    const rule = await this.ruleRepository.findOne({
      where: { id, userId },
      relations: ['category', 'bankAccount'],
    });

    if (!rule) {
      throw new NotFoundException(`Income distribution rule #${id} not found`);
    }

    return rule;
  }

  async createRule(
    userId: number,
    dto: CreateRuleDto,
  ): Promise<IncomeDistributionRule> {
    const rule = this.ruleRepository.create({
      ...dto,
      userId,
    });
    return this.ruleRepository.save(rule);
  }

  async updateRule(
    id: number,
    userId: number,
    dto: UpdateRuleDto,
  ): Promise<IncomeDistributionRule> {
    const rule = await this.findOneRule(id, userId);
    Object.assign(rule, dto);
    return this.ruleRepository.save(rule);
  }

  async deleteRule(id: number, userId: number): Promise<void> {
    const rule = await this.findOneRule(id, userId);
    await this.ruleRepository.remove(rule);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RULE MATCHING
  // ═══════════════════════════════════════════════════════════════════════════

  async findMatchingRule(
    transaction: Transaction,
  ): Promise<IncomeDistributionRule | null> {
    // Get userId from transaction's user relation
    const userId = transaction.user?.id;
    if (!userId) return null;

    const rules = await this.ruleRepository.find({
      where: { userId, isActive: true },
    });

    for (const rule of rules) {
      if (this.matchesRule(transaction, rule)) {
        return rule;
      }
    }

    return null;
  }

  private matchesRule(
    transaction: Transaction,
    rule: IncomeDistributionRule,
  ): boolean {
    // Check amount tolerance
    if (rule.expectedAmount !== null) {
      const tolerance =
        (rule.amountTolerance / 100) * Number(rule.expectedAmount);
      const lowerBound = Number(rule.expectedAmount) - tolerance;
      const upperBound = Number(rule.expectedAmount) + tolerance;
      const amount = Math.abs(Number(transaction.amount));

      if (amount >= lowerBound && amount <= upperBound) {
        return true;
      }
    }

    // Check description pattern
    if (rule.descriptionPattern) {
      const patterns = rule.descriptionPattern.split('|');
      const description = transaction.description.toUpperCase();
      for (const pattern of patterns) {
        if (description.includes(pattern.trim().toUpperCase())) {
          return true;
        }
      }
    }

    // Check category match - access through relation
    const transactionCategoryId = transaction.category?.id;
    if (rule.categoryId && transactionCategoryId === rule.categoryId) {
      return true;
    }

    // Check bank account match - access through relation
    const transactionBankAccountId = transaction.bankAccount?.id;
    if (rule.bankAccountId && transactionBankAccountId === rule.bankAccountId) {
      return true;
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DISTRIBUTION STRATEGIES (for planning purposes only, no balance tracking)
  // ═══════════════════════════════════════════════════════════════════════════

  calculateDistribution(
    plans: ExpensePlan[],
    incomeAmount: number,
    strategy: DistributionStrategy,
  ): DistributionItem[] {
    const distributions: DistributionItem[] = [];
    let remainingAmount = incomeAmount;

    switch (strategy) {
      case 'priority':
        // Fund by priority: essential → important → discretionary
        for (const plan of plans) {
          const needed = Number(plan.monthlyContribution);
          const toAllocate = Math.min(needed, remainingAmount);

          if (toAllocate > 0) {
            distributions.push({ planId: plan.id, amount: toAllocate });
            remainingAmount -= toAllocate;
          }

          if (remainingAmount <= 0) break;
        }
        break;

      case 'proportional':
        // Distribute proportionally based on monthly contribution
        const totalNeeded = plans.reduce(
          (sum, p) => sum + Number(p.monthlyContribution),
          0,
        );

        if (totalNeeded === 0) break;

        for (const plan of plans) {
          const contribution = Number(plan.monthlyContribution);
          const proportion = contribution / totalNeeded;
          const calculated = incomeAmount * proportion;
          const toAllocate = Math.min(calculated, contribution);

          if (toAllocate > 0) {
            distributions.push({ planId: plan.id, amount: toAllocate });
          }
        }
        break;

      case 'fixed':
        // Allocate exact monthly contribution or available amount
        for (const plan of plans) {
          const needed = Number(plan.monthlyContribution);
          const toAllocate = Math.min(needed, remainingAmount);

          if (toAllocate > 0) {
            distributions.push({ planId: plan.id, amount: toAllocate });
            remainingAmount -= toAllocate;
          }

          if (remainingAmount <= 0) break;
        }
        break;
    }

    return distributions;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PENDING DISTRIBUTIONS (for UI display)
  // ═══════════════════════════════════════════════════════════════════════════

  async getPendingDistributions(
    userId: number,
  ): Promise<PendingDistribution[]> {
    const plans = await this.planRepository.find({
      where: { userId, status: 'active' },
      order: { priority: 'ASC' },
    });

    return plans.map((plan) => ({
      planId: plan.id,
      planName: plan.name,
      icon: plan.icon,
      priority: plan.priority,
      monthlyContribution: Number(plan.monthlyContribution),
      amountNeeded: Number(plan.monthlyContribution),
    }));
  }
}
