import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ChambersService } from './chambers.service';
import { CreateChamberDto, UpdateChamberDto } from './dto/chamber.dto';
import { UpsertPrescriptionLayoutDto } from '../prescription-layout/dto/prescription-layout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { ActiveWorkstation, WorkstationDoctorId } from '../workstations/workstation.decorator';
import type { Workstation } from '../workstations/workstations.service';

// The practice's OPD chambers (multi-chamber, 01/11/2026). Scoped to the
// workstation doctor like every practice table; reading is open to the
// practice's assistants (they choose the chamber they work in), changing is
// the owner's (the service refuses an assistant).
@Controller('chambers')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class ChambersController {
  constructor(private readonly chambers: ChambersService) {}

  @Get()
  list(@WorkstationDoctorId() doctorId: string) {
    return this.chambers.list(doctorId);
  }

  @Post()
  create(@WorkstationDoctorId() doctorId: string, @ActiveWorkstation() ws: Workstation, @Body() dto: CreateChamberDto) {
    return this.chambers.create(doctorId, ws, dto.name, dto.address);
  }

  @Patch(':id')
  update(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @Param('id') id: string,
    @Body() dto: UpdateChamberDto,
  ) {
    return this.chambers.update(doctorId, ws, id, dto);
  }

  // Soft removal (the row and its visits stay).
  @Delete(':id')
  remove(@WorkstationDoctorId() doctorId: string, @ActiveWorkstation() ws: Workstation, @Param('id') id: string) {
    return this.chambers.remove(doctorId, ws, id);
  }

  // The chamber's own prescription print settings (OPD only); `layout: null` =
  // the doctor's own settings print.
  @Get(':id/layout')
  getLayout(@WorkstationDoctorId() doctorId: string, @Param('id') id: string) {
    return this.chambers.getLayout(doctorId, id);
  }

  @Put(':id/layout')
  saveLayout(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @Param('id') id: string,
    @Body() dto: UpsertPrescriptionLayoutDto,
  ) {
    return this.chambers.saveLayout(doctorId, ws, id, dto);
  }

  @Delete(':id/layout')
  clearLayout(@WorkstationDoctorId() doctorId: string, @ActiveWorkstation() ws: Workstation, @Param('id') id: string) {
    return this.chambers.clearLayout(doctorId, ws, id);
  }
}
