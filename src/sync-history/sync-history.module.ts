import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncHistoryService } from './sync-history.service';
import { SyncHistoryController } from './sync-history.controller';
import { SyncReport } from './entities/sync-report.entity';
import { User } from '../users/user.entity';
import { ImportLog } from '../transactions/entities/import-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SyncReport, User, ImportLog])],
  providers: [SyncHistoryService],
  controllers: [SyncHistoryController],
  exports: [SyncHistoryService],
})
export class SyncHistoryModule {}
