import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tag } from './entities/tag.entity';
import { TagsService } from './tags.service';
import { TagsController } from './tags.controller';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringTransaction } from '../recurring-transactions/entities/recurring-transaction.entity';
import { SharedModule } from '../shared/shared.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Tag, Transaction, RecurringTransaction]),
        SharedModule,
    ],
    providers: [TagsService],
    controllers: [TagsController],
    exports: [TagsService, TypeOrmModule], // Export the service and TypeOrmModule
})
export class TagsModule {}