import { Module } from '@nestjs/common';
import { PatientNotesController } from './patient-notes.controller';
import { PatientNotesService } from './patient-notes.service';
import { WorkstationsModule } from '../workstations/workstations.module';
import { PatientsModule } from '../patients/patients.module';

// WorkstationsModule is required: WorkstationGuard injects WorkstationsService
// and Nest resolves that at BOOT (server/CLAUDE.md, Rule 2c).
@Module({
  imports: [WorkstationsModule, PatientsModule],
  controllers: [PatientNotesController],
  providers: [PatientNotesService],
})
export class PatientNotesModule {}
