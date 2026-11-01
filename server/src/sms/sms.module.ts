import { Module } from '@nestjs/common';
import { OpdModule } from '../opd/opd.module';
import { WorkstationsModule } from '../workstations/workstations.module';
import { OpdSmsService } from './opd-sms.service';
import { PaymentRequestsService } from './payment-requests.service';
import {
  AdminPaymentRequestsController,
  OpdSmsController,
  SmsWalletController,
} from './sms.controller';
import { SmsService } from './sms.service';
import { SmsWalletService } from './sms-wallet.service';

// WorkstationsModule: WorkstationGuard needs WorkstationsService in THIS
// module's injector (a controller here uses the guard). OpdModule exports
// OpdService so the SMS reads the queue and its times exactly as the queue does.
@Module({
  imports: [WorkstationsModule, OpdModule],
  controllers: [
    OpdSmsController,
    SmsWalletController,
    AdminPaymentRequestsController,
  ],
  providers: [
    SmsService,
    SmsWalletService,
    OpdSmsService,
    PaymentRequestsService,
  ],
  exports: [SmsService, SmsWalletService],
})
export class SmsModule {}
