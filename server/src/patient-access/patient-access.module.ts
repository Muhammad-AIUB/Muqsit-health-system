import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { WorkstationsModule } from '../workstations/workstations.module';
import { PatientAccessController } from './patient-access.controller';
import { PatientAccessService } from './patient-access.service';

// WorkstationsModule: WorkstationGuard needs WorkstationsService in THIS module's
// injector (a controller here uses the guard). SmsModule exports the gateway
// the code goes out through.
@Module({
  imports: [WorkstationsModule, SmsModule],
  controllers: [PatientAccessController],
  providers: [PatientAccessService],
})
export class PatientAccessModule {}
