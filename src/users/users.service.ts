import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { CategoriesService } from '../categories/categories.service';
import { DefaultCategoriesService } from '../categories/default-categories.service';
import { Transaction } from '../transactions/transaction.entity';
import { PendingDuplicate } from '../pending-duplicates/entities/pending-duplicate.entity';
import { PreventedDuplicate } from '../prevented-duplicates/entities/prevented-duplicate.entity';
import { DetectedPattern } from '../smart-recurrence/entities/detected-pattern.entity';
import { KeywordStats } from '../categories/entities/keyword-stats.entity';
import { MerchantCategorization } from '../merchant-categorization/entities/merchant-categorization.entity';
import { ImportLog } from '../transactions/entities/import-log.entity';
import { SyncReport } from '../sync-history/entities/sync-report.entity';
import { PaymentAccount } from '../payment-accounts/payment-account.entity';
import { ExpensePlanPayment } from '../expense-plans/entities/expense-plan-payment.entity';
import { TransactionLinkSuggestion } from '../expense-plans/entities/transaction-link-suggestion.entity';
import { ExpensePlanSuggestion } from '../smart-recurrence/entities/expense-plan-suggestion.entity';
import { IncomePlanEntry } from '../income-plans/entities/income-plan-entry.entity';
import { ExpensePlan } from '../expense-plans/entities/expense-plan.entity';
import { IncomePlan } from '../income-plans/entities/income-plan.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { GocardlessConnection } from '../gocardless/entities/gocardless-connection.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private categoriesService: CategoriesService,
    private readonly defaultCategoriesService: DefaultCategoriesService,
    private readonly dataSource: DataSource,
  ) {}

  async findByAuth0Id(auth0Id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { auth0Id } });
    if (!user) {
      throw new NotFoundException(`User with Auth0 ID ${auth0Id} not found`);
    }
    return user;
  }

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    // Check if user already exists
    const existingUser = await this.usersRepository.findOne({
      where: { auth0Id: createUserDto.auth0Id },
    });

    if (existingUser) {
      throw new BadRequestException(
        `User with Auth0 ID ${createUserDto.auth0Id} already exists`,
      );
    }

    const user = this.usersRepository.create(createUserDto);
    const savedUser = await this.usersRepository.save(user);

    // Create default categories for the new user
    await this.defaultCategoriesService.createDefaultCategoriesForUser(
      savedUser,
    );

    return savedUser;
  }

  async getAllActive(): Promise<User[]> {
    return this.usersRepository.find();
  }

  async deleteAccount(userId: number): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    await this.dataSource.transaction(async (manager) => {
      // 1. Delete transaction_tags_tag junction table entries (only if user has transactions)
      const userTransactions = await manager.find(Transaction, {
        where: { user: { id: userId } },
        select: ['id'],
      });

      if (userTransactions.length > 0) {
        const transactionIds = userTransactions.map((t) => t.id);
        await manager
          .createQueryBuilder()
          .delete()
          .from('transaction_tags_tag')
          .where('"transactionId" IN (:...transactionIds)', { transactionIds })
          .execute();
      }

      // 2-22. Delete entities in FK-safe order, User last
      const userFilter = { user: { id: userId } };

      // 2. pending_duplicates
      await manager.delete(PendingDuplicate, userFilter);
      // 3. prevented_duplicates
      await manager.delete(PreventedDuplicate, userFilter);
      // 4. detected_patterns
      await manager.delete(DetectedPattern, userFilter);
      // 5. keyword_stats
      await manager.delete(KeywordStats, userFilter);
      // 6. merchant_categorization
      await manager.delete(MerchantCategorization, userFilter);
      // 7. import_log
      await manager.delete(ImportLog, userFilter);
      // 8. sync_reports
      await manager.delete(SyncReport, userFilter);
      // 9. payment_activities (through paymentAccount -> user)
      await manager.delete(PaymentAccount, userFilter);
      // 10. expense_plan_payments (through expensePlan -> user)
      await manager.delete(ExpensePlanPayment, userFilter);
      // 11. transaction_link_suggestions
      await manager.delete(TransactionLinkSuggestion, userFilter);
      // 12. expense_plan_suggestions
      await manager.delete(ExpensePlanSuggestion, userFilter);
      // 13. income_plan_entries (through incomePlan -> user)
      await manager.delete(IncomePlanEntry, userFilter);
      // 14. transactions
      await manager.delete(Transaction, userFilter);
      // 15. expense_plans
      await manager.delete(ExpensePlan, userFilter);
      // 16. income_plans
      await manager.delete(IncomePlan, userFilter);
      // 17. credit_cards
      await manager.delete(CreditCard, userFilter);
      // 18. bank_accounts
      await manager.delete(BankAccount, userFilter);
      // 19. categories
      await manager.delete(Category, userFilter);
      // 20. tags
      await manager.delete(Tag, userFilter);
      // 21. gocardless_connections
      await manager.delete(GocardlessConnection, userFilter);
      // 22. payment_accounts
      // (already deleted above at step 9, but PaymentAccount was moved up)

      // 23. user (root entity - deleted last)
      await manager.delete(User, { id: userId });
    });
  }
}
