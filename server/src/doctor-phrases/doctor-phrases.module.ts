import { Module } from '@nestjs/common';
import { DoctorPhrasesController } from './doctor-phrases.controller';
import { DoctorPhrasesService } from './doctor-phrases.service';
import { WorkstationsModule } from '../workstations/workstations.module';

// WorkstationsModule is required, not optional: the controller is guarded by
// WorkstationGuard, which injects WorkstationsService. Nest resolves that at
// BOOT, not at compile time — `npx tsc --noEmit` is green without this import
// and the API then crash-loops on start. Same import as RxHabitsModule.
//
// DoctorPhrasesService is exported so PrescriptionsModule can learn from a
// prescription once it has been committed (prescriptions.service.ts#create).
@Module({
  imports: [WorkstationsModule],
  controllers: [DoctorPhrasesController],
  providers: [DoctorPhrasesService],
  exports: [DoctorPhrasesService],
})
export class DoctorPhrasesModule {}
