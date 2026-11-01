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
import { ChamberHeader } from '../chambers/chamber.decorator';
import { ChambersService } from '../chambers/chambers.service';

// The OPD queue belongs to the active workstation's doctor.
@Controller('opd')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class OpdController {
  constructor(
    private readonly opd: OpdService,
    private readonly chambers: ChambersService,
  ) {}

  // ⚕️ Multi-chamber (01/11/2026): the chamber a day-level call acts on is the
  // `X-Chamber` header RESOLVED for this practice — no header is the default
  // chamber, another practice's or a removed chamber is 404. Calls on one visit
  // (status, presence, move) act on that visit, wherever it is queued.
  private chamber(doctorId: string, raw: string | undefined) {
    return this.chambers.resolve(doctorId, raw);
  }

  // A day's queue, `?date=yyyy-mm-dd` (default today), in the order shown.
  @Get()
  async list(@WorkstationDoctorId() doctorId: string, @ChamberHeader() raw?: string, @Query('date') date?: string) {
    return this.opd.list(doctorId, date, await this.chamber(doctorId, raw));
  }

  @Post()
  async create(@WorkstationDoctorId() doctorId: string, @ChamberHeader() raw: string | undefined, @Body() dto: CreateOpdVisitDto) {
    return this.opd.create(doctorId, dto, await this.chamber(doctorId, raw));
  }

  // A day's chamber schedule (start, break, minutes per patient).
  @Get('schedule')
  async schedule(@WorkstationDoctorId() doctorId: string, @ChamberHeader() raw?: string, @Query('date') date?: string) {
    return this.opd.getSchedule(doctorId, date, await this.chamber(doctorId, raw));
  }

  @Put('schedule')
  async saveSchedule(@WorkstationDoctorId() doctorId: string, @ChamberHeader() raw: string | undefined, @Body() dto: SaveOpdScheduleDto) {
    return this.opd.saveSchedule(doctorId, dto, await this.chamber(doctorId, raw));
  }

  // Flag a patient's queue entry incomplete / complete (upsert today's visit).
  @Post('rx-status')
  async setRxStatus(@WorkstationDoctorId() doctorId: string, @ChamberHeader() raw: string | undefined, @Body() dto: SetRxStatusDto) {
    return this.opd.setRxStatusByPatient(doctorId, dto, await this.chamber(doctorId, raw));
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
