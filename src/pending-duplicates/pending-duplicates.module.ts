import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PendingDuplicatesService } from './pending-duplicates.service';
import { PendingDuplicatesController } from './pending-duplicates.controller';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { PendingDuplicate } from './entities/pending-duplicate.entity';
import { Transaction } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';
import { SharedModule } from '../shared/shared.module';
import { PreventedDuplicatesModule } from '../prevented-duplicates/prevented-duplicates.module';
import { TransactionEventHandler } from './event-handlers/transaction.event-handler';
import { BankAccountEventHandler } from './event-handlers/bank-account.event-handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([PendingDuplicate, Transaction, User]),
    SharedModule,
    PreventedDuplicatesModule,
  ],
  controllers: [PendingDuplicatesController],
  providers: [PendingDuplicatesService, DuplicateDetectionService, TransactionEventHandler, BankAccountEventHandler],
  exports: [PendingDuplicatesService, DuplicateDetectionService, TypeOrmModule],
})
export class PendingDuplicatesModule {}
