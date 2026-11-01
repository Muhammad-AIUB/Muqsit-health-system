import { Module } from '@nestjs/common';
import { PatientDrugSafetyController } from './patient-drug-safety.controller';
import { PatientDrugSafetyService } from './patient-drug-safety.service';
import { WorkstationsModule } from '../workstations/workstations.module';
import { PatientsModule } from '../patients/patients.module';

// WorkstationsModule is required: WorkstationGuard injects WorkstationsService
// and Nest resolves that at BOOT (server/CLAUDE.md, Rule 2c).
@Module({
  imports: [WorkstationsModule, PatientsModule],
  controllers: [PatientDrugSafetyController],
  providers: [PatientDrugSafetyService],
})
export class PatientDrugSafetyModule {}
