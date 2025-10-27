import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { EventPublisherService } from './services/event-publisher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      Category,
      Tag,
      BankAccount,
      CreditCard,
    ]),
    EventEmitterModule,
  ],
  providers: [EventPublisherService],
  exports: [TypeOrmModule, EventPublisherService],
})
export class SharedModule {}
