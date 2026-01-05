import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesModule } from './categories/categories.module';
import { TagsModule } from './tags/tags.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { CreditCardsModule } from './credit-cards/credit-cards.module';
import { RecurringTransactionsModule } from './recurring-transactions/recurring-transactions.module';
import { PendingDuplicatesModule } from './pending-duplicates/pending-duplicates.module';
import { PreventedDuplicatesModule } from './prevented-duplicates/prevented-duplicates.module';
import { SharedModule } from './shared/shared.module';
import { ScheduleModule } from '@nestjs/schedule';
import { DashboardModule } from './dashboard/dashboard.module';
import { GocardlessModule } from './gocardless/gocardless.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MerchantCategorizationModule } from './merchant-categorization/merchant-categorization.module';
import { SyncHistoryModule } from './sync-history/sync-history.module';
import { PaymentAccountsModule } from './payment-accounts/payment-accounts.module';
import { PaymentActivitiesModule } from './payment-activities/payment-activities.module';
import { ExpensePlansModule } from './expense-plans/expense-plans.module';
import { SmartRecurrenceModule } from './smart-recurrence/smart-recurrence.module';

import databaseConfig from './config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get('database');
        if (!dbConfig) {
          throw new Error('Database configuration not found');
        }
        return dbConfig;
      },
    }),
    ScheduleModule.forRoot(),
    // 📡 EVENT SYSTEM: Event-driven architecture
    EventEmitterModule.forRoot({
      // Set this to `true` if you want to use the default settings
      wildcard: false,
      // The delimiter used to segment namespaces
      delimiter: '.',
      // Set this to `true` if you want to emit the newListener event
      newListener: false,
      // Set this to `true` if you want to emit the removeListener event
      removeListener: false,
      // The maximum amount of listeners that can be assigned to an event
      maxListeners: 10,
      // Show event name in memory leak message when more than maximum amount of listeners is assigned
      verboseMemoryLeak: false,
      // Disable throwing uncaughtException if an error event is emitted and it has no listeners
      ignoreErrors: false,
    }),
    // 🔒 SECURITY: Rate limiting (100 requests per minute)
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minute
      limit: 100, // max 100 requests per minute
    }]),
    UsersModule,
    AuthModule,
    TransactionsModule,
    CategoriesModule,
    TagsModule,
    BankAccountsModule,
    CreditCardsModule,
    RecurringTransactionsModule,
    PendingDuplicatesModule,
    PreventedDuplicatesModule,
    SharedModule,
    DashboardModule,
    GocardlessModule,
    MerchantCategorizationModule,
    SyncHistoryModule,
    PaymentAccountsModule,
    PaymentActivitiesModule,
    ExpensePlansModule,
    SmartRecurrenceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 🔒 SECURITY: Global rate limiting
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
