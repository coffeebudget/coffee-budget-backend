import { BaseEventClass } from './base.event';
import { Category } from '../../categories/entities/category.entity';

export class CategoryCreatedEvent extends BaseEventClass {
  constructor(public readonly category: Category, userId: number) {
    super(userId);
  }
}

export class CategoryUpdatedEvent extends BaseEventClass {
  constructor(public readonly category: Category, userId: number) {
    super(userId);
  }
}

export class CategoryDeletedEvent extends BaseEventClass {
  constructor(public readonly categoryId: number, userId: number) {
    super(userId);
  }
}

export class CategoryAssignedToTransactionEvent extends BaseEventClass {
  constructor(public readonly categoryId: number, public readonly transactionId: number, userId: number) {
    super(userId);
  }
}

export class CategoryRemovedFromTransactionEvent extends BaseEventClass {
  constructor(public readonly categoryId: number, public readonly transactionId: number, userId: number) {
    super(userId);
  }
}
