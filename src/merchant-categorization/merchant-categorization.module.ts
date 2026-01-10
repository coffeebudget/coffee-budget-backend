import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantCategorizationService } from './merchant-categorization.service';
import { MerchantCategorization } from './entities';
import { Category } from '../categories/entities/category.entity';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MerchantCategorization, Category]),
    AIModule,
  ],
  providers: [MerchantCategorizationService],
  exports: [MerchantCategorizationService],
})
export class MerchantCategorizationModule {}
