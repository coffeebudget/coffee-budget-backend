import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PendingDuplicatesService } from './pending-duplicates.service';
import { PendingDuplicatesController } from './pending-duplicates.controller';
import { PendingDuplicate } from './entities/pending-duplicate.entity';
import { Transaction } from '../transactions/transaction.entity';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PendingDuplicate, Transaction]),
    SharedModule,
  ],
  controllers: [PendingDuplicatesController],
  providers: [PendingDuplicatesService],
  exports: [PendingDuplicatesService, TypeOrmModule],
})
export class PendingDuplicatesModule {}
