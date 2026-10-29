import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OpdService } from './opd.service';
import {
  CreateOpdVisitDto,
  MoveOpdVisitDto,
  SaveOpdScheduleDto,
  SetOpdPresenceDto,
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

  // A day's queue, `?date=yyyy-mm-dd` (default today), in the order shown.
  @Get()
  list(@WorkstationDoctorId() doctorId: string, @Query('date') date?: string) {
    return this.opd.list(doctorId, date);
  }

  @Post()
  create(@WorkstationDoctorId() doctorId: string, @Body() dto: CreateOpdVisitDto) {
    return this.opd.create(doctorId, dto);
  }

  // A day's chamber schedule (start, break, minutes per patient).
  @Get('schedule')
  schedule(@WorkstationDoctorId() doctorId: string, @Query('date') date?: string) {
    return this.opd.getSchedule(doctorId, date);
  }

  @Put('schedule')
  saveSchedule(@WorkstationDoctorId() doctorId: string, @Body() dto: SaveOpdScheduleDto) {
    return this.opd.saveSchedule(doctorId, dto);
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

  // Reception's marks: present (with the time), critically ill, urgent. Today only.
  @Patch(':id/presence')
  setPresence(
    @WorkstationDoctorId() doctorId: string,
    @Param('id') id: string,
    @Body() dto: SetOpdPresenceDto,
  ) {
    return this.opd.setPresence(doctorId, id, dto);
  }

  // Move a visit one place up or down within its day; answers that day's queue.
  @Patch(':id/move')
  move(
    @WorkstationDoctorId() doctorId: string,
    @Param('id') id: string,
    @Body() dto: MoveOpdVisitDto,
  ) {
    return this.opd.move(doctorId, id, dto);
  }
}
