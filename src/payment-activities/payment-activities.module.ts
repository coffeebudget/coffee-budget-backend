import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentActivity } from './payment-activity.entity';
import { PaymentActivitiesService } from './payment-activities.service';
import { PaymentActivitiesController } from './payment-activities.controller';
import { PaymentAccountImportService } from './payment-account-import.service';
import { PaymentActivityBusinessRulesService } from './payment-activity-business-rules.service';
import { SharedModule } from '../shared/shared.module';
import { PaymentAccount } from '../payment-accounts/payment-account.entity';
import { GocardlessModule } from '../gocardless/gocardless.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentActivity, PaymentAccount]),
    SharedModule,
    GocardlessModule,
  ],
  controllers: [PaymentActivitiesController],
  providers: [
    PaymentActivitiesService,
    PaymentAccountImportService,
    PaymentActivityBusinessRulesService,
  ],
  exports: [
    PaymentActivitiesService,
    PaymentAccountImportService,
    PaymentActivityBusinessRulesService,
  ],
})
export class PaymentActivitiesModule {}
