import { Module } from '@nestjs/common';
import { PatientFilesController } from './patient-files.controller';
import { PatientFilesService } from './patient-files.service';
import { WorkstationsModule } from '../workstations/workstations.module';
import { PatientsModule } from '../patients/patients.module';
import { UploadModule } from '../uploads/upload.module';

// WorkstationsModule is required: WorkstationGuard injects WorkstationsService
// and Nest resolves that at BOOT (server/CLAUDE.md, Rule 2c).
@Module({
  imports: [WorkstationsModule, PatientsModule, UploadModule],
  controllers: [PatientFilesController],
  providers: [PatientFilesService],
})
export class PatientFilesModule {}
