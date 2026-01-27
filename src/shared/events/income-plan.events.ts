import { BaseEventClass } from './base.event';
import { IncomePlan } from '../../income-plans/entities/income-plan.entity';

export class IncomePlanCreatedEvent extends BaseEventClass {
  constructor(
    public readonly incomePlan: IncomePlan,
    userId: number,
  ) {
    super(userId);
  }
}

export class IncomePlanUpdatedEvent extends BaseEventClass {
  constructor(
    public readonly incomePlan: IncomePlan,
    userId: number,
  ) {
    super(userId);
  }
}

export class IncomePlanDeletedEvent extends BaseEventClass {
  constructor(
    public readonly incomePlanId: number,
    userId: number,
  ) {
    super(userId);
  }
}
