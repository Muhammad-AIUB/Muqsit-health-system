import { Module } from '@nestjs/common';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';
import { WorkstationsModule } from '../workstations/workstations.module';
import { RxHabitsModule } from '../rx-habits/rx-habits.module';
import { DoctorPhrasesModule } from '../doctor-phrases/doctor-phrases.module';

@Module({
  imports: [WorkstationsModule, RxHabitsModule, DoctorPhrasesModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
})
export class PrescriptionsModule {}
