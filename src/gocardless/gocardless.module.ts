import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GocardlessController } from './gocardless.controller';
import { GocardlessCronController } from './gocardless-cron.controller';
import { GocardlessService } from './gocardless.service';
import { GocardlessSchedulerService } from './gocardless-scheduler.service';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { SyncHistoryModule } from '../sync-history/sync-history.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([BankAccount, CreditCard, User, Transaction]),
    SyncHistoryModule,
  ],
  controllers: [GocardlessController, GocardlessCronController],
  providers: [
    GocardlessService,
    GocardlessSchedulerService,
  ],
  exports: [GocardlessService],
})
export class GocardlessModule {}
