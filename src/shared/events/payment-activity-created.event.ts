import { BaseEventClass } from './base.event';
import { PaymentActivity } from '../../payment-activities/payment-activity.entity';

export class PaymentActivityCreatedEvent extends BaseEventClass {
  constructor(
    public readonly paymentActivity: PaymentActivity,
    public readonly userId: number,
  ) {
    super(userId);
  }
}
