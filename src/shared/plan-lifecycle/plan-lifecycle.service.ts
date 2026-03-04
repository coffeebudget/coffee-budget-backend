import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ExpensePlan } from '../../expense-plans/entities/expense-plan.entity';
import { IncomePlan } from '../../income-plans/entities/income-plan.entity';
import { EventPublisherService } from '../services/event-publisher.service';
import { ExpensePlanCompletedEvent } from '../events/expense-plan.events';
import { IncomePlanArchivedEvent } from '../events/income-plan.events';

@Injectable()
export class PlanLifecycleService implements OnModuleInit {
  private readonly logger = new Logger(PlanLifecycleService.name);

  constructor(
    @InjectRepository(ExpensePlan)
    private readonly expensePlanRepo: Repository<ExpensePlan>,
    @InjectRepository(IncomePlan)
    private readonly incomePlanRepo: Repository<IncomePlan>,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  async onModuleInit() {
    await this.autoCompleteExpiredPlans();
  }

  @Cron('0 1 * * *')
  async autoCompleteExpiredPlans(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiredExpensePlans = await this.expensePlanRepo.find({
      where: { status: 'active', endDate: LessThan(today) },
    });

    for (const plan of expiredExpensePlans) {
      plan.status = 'completed';
      await this.expensePlanRepo.save(plan);
      this.logger.log(
        `Auto-completed expense plan "${plan.name}" (id=${plan.id})`,
      );
      await this.eventPublisher.publish(
        new ExpensePlanCompletedEvent(plan.id, plan.userId, 'endDate_reached'),
      );
    }

    const expiredIncomePlans = await this.incomePlanRepo.find({
      where: { status: 'active', endDate: LessThan(today) },
    });

    for (const plan of expiredIncomePlans) {
      plan.status = 'archived';
      await this.incomePlanRepo.save(plan);
      this.logger.log(
        `Auto-archived income plan "${plan.name}" (id=${plan.id})`,
      );
      await this.eventPublisher.publish(
        new IncomePlanArchivedEvent(plan.id, plan.userId, 'endDate_reached'),
      );
    }
  }
}
