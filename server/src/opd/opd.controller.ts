import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OpdService } from './opd.service';
import {
  CreateOpdVisitDto,
  SetRxStatusDto,
  UpdateOpdStatusDto,
} from './dto/opd.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { WorkstationDoctorId } from '../workstations/workstation.decorator';

// The OPD queue belongs to the active workstation's doctor.
@Controller('opd')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class OpdController {
  constructor(private readonly opd: OpdService) {}

  @Get()
  list(@WorkstationDoctorId() doctorId: string) {
    return this.opd.list(doctorId);
  }

  @Post()
  create(@WorkstationDoctorId() doctorId: string, @Body() dto: CreateOpdVisitDto) {
    return this.opd.create(doctorId, dto);
  }

  // Flag a patient's queue entry incomplete / complete (upsert today's visit).
  @Post('rx-status')
  setRxStatus(@WorkstationDoctorId() doctorId: string, @Body() dto: SetRxStatusDto) {
    return this.opd.setRxStatusByPatient(doctorId, dto);
  }

  @Patch(':id/status')
  setStatus(
    @WorkstationDoctorId() doctorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOpdStatusDto,
  ) {
    return this.opd.setStatus(doctorId, id, dto);
  }
}
