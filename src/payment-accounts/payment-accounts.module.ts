import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentAccount } from './payment-account.entity';
import { PaymentAccountsService } from './payment-accounts.service';
import { PaymentAccountsController } from './payment-accounts.controller';
import { GocardlessModule } from '../gocardless/gocardless.module';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentAccount]), GocardlessModule],
  controllers: [PaymentAccountsController],
  providers: [PaymentAccountsService],
  exports: [PaymentAccountsService],
})
export class PaymentAccountsModule {}
