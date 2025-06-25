import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PreventedDuplicate } from './entities/prevented-duplicate.entity';
import { PreventedDuplicatesService } from './prevented-duplicates.service';

@Module({
  imports: [TypeOrmModule.forFeature([PreventedDuplicate])],
  providers: [PreventedDuplicatesService],
  exports: [PreventedDuplicatesService],
})
export class PreventedDuplicatesModule {}
