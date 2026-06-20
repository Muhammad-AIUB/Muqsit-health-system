import {
  Body,
  Controller,
  ForbiddenException,
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
import { WorkstationDoctorId, ActiveWorkstation } from '../workstations/workstation.decorator';
import type { Workstation } from '../workstations/workstations.service';

// Prescriptions belong to the active workstation's doctor.
@Controller('prescriptions')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  @Post()
  create(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @Body() dto: CreatePrescriptionDto,
  ) {
    // Server-side backstop: an assistant must hold the "Save and print" grant to
    // save a prescription, even if the UI lock were bypassed.
    if (ws.role === 'assistant' && !ws.permissions.includes('rx.savePrint')) {
      throw new ForbiddenException('You do not have permission to save prescriptions');
    }
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
