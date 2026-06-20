import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/prescription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { WorkstationDoctorId } from '../workstations/workstation.decorator';

// Prescriptions belong to the active workstation's doctor.
@Controller('prescriptions')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  @Post()
  create(@WorkstationDoctorId() doctorId: string, @Body() dto: CreatePrescriptionDto) {
    return this.prescriptions.create(doctorId, dto);
  }

  @Get()
  listByPatient(
    @WorkstationDoctorId() doctorId: string,
    @Query('patientId') patientId: string,
  ) {
    return this.prescriptions.listByPatient(doctorId, patientId);
  }

  @Get(':id')
  get(@WorkstationDoctorId() doctorId: string, @Param('id') id: string) {
    return this.prescriptions.get(doctorId, id);
  }
}
