import { BaseEventClass } from './base.event';

export class ExpensePlanDeletedEvent extends BaseEventClass {
  constructor(
    public readonly expensePlanId: number,
    userId: number,
  ) {
    super(userId);
  }
}

export class ExpensePlanCompletedEvent extends BaseEventClass {
  constructor(
    public readonly expensePlanId: number,
    userId: number,
    public readonly reason: string,
  ) {
    super(userId);
  }
}
