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
