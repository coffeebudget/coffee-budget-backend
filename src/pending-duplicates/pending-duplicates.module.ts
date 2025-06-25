import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PendingDuplicatesService } from './pending-duplicates.service';
import { PendingDuplicatesController } from './pending-duplicates.controller';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { PendingDuplicate } from './entities/pending-duplicate.entity';
import { Transaction } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';
import { SharedModule } from '../shared/shared.module';
import { PreventedDuplicatesModule } from '../prevented-duplicates/prevented-duplicates.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PendingDuplicate, Transaction, User]),
    SharedModule,
    PreventedDuplicatesModule,
    forwardRef(() => TransactionsModule),
  ],
  controllers: [PendingDuplicatesController],
  providers: [PendingDuplicatesService, DuplicateDetectionService],
  exports: [PendingDuplicatesService, DuplicateDetectionService, TypeOrmModule],
})
export class PendingDuplicatesModule {}
