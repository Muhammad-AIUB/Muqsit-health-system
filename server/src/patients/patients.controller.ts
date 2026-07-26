import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import {
  CreatePatientDto,
  LinkPatientDto,
  UpdatePatientDto,
} from './dto/patient.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { WorkstationDoctorId, ActiveWorkstation } from '../workstations/workstation.decorator';
import type { Workstation } from '../workstations/workstations.service';

// All patient data is scoped to the ACTIVE workstation's doctor (own account, or
// a doctor the user assists), not the raw logged-in user.
@Controller('patients')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  list(@WorkstationDoctorId() doctorId: string, @Query('search') search?: string) {
    return this.patients.list(doctorId, search);
  }

  @Get('watched')
  watched(@WorkstationDoctorId() doctorId: string) {
    return this.patients.listWatched(doctorId);
  }

  // Every patient on a given phone number (prescription mobile-lookup dropdown).
  // Declared before ':id' so the literal path isn't captured as an id.
  @Get('by-mobile')
  byMobile(@WorkstationDoctorId() doctorId: string, @Query('mobile') mobile = '') {
    return this.patients.findByMobile(doctorId, mobile);
  }

  // Family-tree members across the doctor's patients matching a number (info only).
  @Get('relatives-by-mobile')
  relativesByMobile(@WorkstationDoctorId() doctorId: string, @Query('mobile') mobile = '') {
    return this.patients.relativesByMobile(doctorId, mobile);
  }

  // Create a new patient related to an existing one, with reciprocal family links.
  @Post('link')
  link(@WorkstationDoctorId() doctorId: string, @Body() dto: LinkPatientDto) {
    return this.patients.linkNew(doctorId, dto);
  }

  @Get(':id')
  get(@WorkstationDoctorId() doctorId: string, @Param('id') id: string) {
    return this.patients.get(doctorId, id);
  }

  @Post()
  create(@WorkstationDoctorId() doctorId: string, @Body() dto: CreatePatientDto) {
    return this.patients.create(doctorId, dto);
  }

  @Patch(':id')
  update(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    // Server-side backstop mirroring PrescriptionsController. Gate per-field, not
    // per-request: genuine demographic edits need "pt.info", the family tree
    // needs "pt.family", but the prescription-lifecycle / records fields
    // (incompleteRx, drug/investigation/on-exam history, HM dates) are part of
    // the prescribing flow — an assistant with any prescription grant may write
    // them, so we don't 403 those on pt.info (finding #3).
    if (ws.role === 'assistant') {
      const RX_LIFECYCLE = new Set([
        'incompleteRx', 'drugHistory', 'investigationSummary',
        'onExaminationSummary', 'hmDrugDates', 'hmSelectedDrugs',
      ]);
      const keys = Object.keys(dto);
      const touchesInfo = keys.some((k) => k !== 'familyMembers' && !RX_LIFECYCLE.has(k));
      const touchesFamily = keys.includes('familyMembers');
      const touchesRx = keys.some((k) => RX_LIFECYCLE.has(k));
      const has = (p: string) => ws.permissions.includes(p);
      if (touchesInfo && !has('pt.info')) {
        throw new ForbiddenException('You do not have permission to edit patient information');
      }
      if (touchesFamily && !has('pt.family')) {
        throw new ForbiddenException('You do not have permission to edit the family tree');
      }
      if (touchesRx && !touchesInfo && !touchesFamily && !ws.permissions.some((p) => p.startsWith('rx.'))) {
        throw new ForbiddenException('You do not have permission to update prescriptions');
      }
    }
    return this.patients.update(doctorId, id, dto);
  }

  @Delete(':id')
  remove(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @Param('id') id: string,
  ) {
    // Deletion is irreversible and there is no "delete" permission key — restrict
    // it to the practice owner (never an assistant, never a supervising doctor).
    if (ws.role !== 'owner') {
      throw new ForbiddenException('Only the practice owner can delete a patient');
    }
    return this.patients.remove(doctorId, id);
  }
}
