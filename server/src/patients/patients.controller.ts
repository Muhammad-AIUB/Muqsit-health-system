import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import {
  AppendDrugHistoryDto,
  AppendOnExaminationDto,
  CreatePatientDto,
  HistoryEntryRefDto,
  LinkPatientDto,
  ReplaceDrugHistoryBlockDto,
  SupervisedDraftDto,
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
    // ── Health-monitoring duration overrides: OWNER ONLY ──────────────────
    // These are the owner doctor's clinical reading of the trend chart, not
    // data entry, so no assistant grant covers them. hmDrugDates used to sit in
    // RX_LIFECYCLE below, which allowed any assistant with a prescription grant
    // to write it — removed deliberately; don't put it back without a key.
    //
    // This check does NOT stop a supervising doctor: they act under their OWN
    // workstation, so ws.role is 'owner' here. They are stopped one layer down
    // by the `patient.doctorId !== doctorId` check in patients.service#update.
    // Both layers are load-bearing — removing either opens the boundary.
    //
    // PATCH /patients/:id is the only route that accepts UpdatePatientDto, and
    // these fields are declared on it alone (not on Create/Link), so
    // ValidationPipe({ whitelist: true }) strips them everywhere else. This is
    // the single door.
    const HM_OVERRIDE_KEYS = new Set(['hmDrugDates', 'hmSymptomDates']);
    if (ws.role !== 'owner' && Object.keys(dto).some((k) => HM_OVERRIDE_KEYS.has(k))) {
      throw new ForbiddenException('Only the owner doctor can edit health-monitoring durations');
    }

    // ── Assistant per-field gate ──────────────────────────────────────────
    // Server-side backstop mirroring PrescriptionsController. Gate per-field,
    // not per-request: genuine demographic edits need "pt.info", the family tree
    // needs "pt.family", but the prescription-lifecycle / records fields
    // (incompleteRx, drug/investigation/on-exam history) are part of the
    // prescribing flow — an assistant with any prescription grant may write
    // them, so we don't 403 those on pt.info (finding #3).
    if (ws.role === 'assistant') {
      const RX_LIFECYCLE = new Set([
        'incompleteRx', 'drugHistory', 'investigationSummary',
        'onExaminationSummary', 'hmSelectedDrugs',
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

  // ⚕️ A supervising practice parks its unprinted prescription for a patient it
  // supervises (19/10/2026) — what `incompleteRx` is for the owner's practice,
  // which a supervising doctor may never write. Gated for an assistant like
  // `incompleteRx` in PATCH above: any prescription key.
  @Put(':id/supervised-draft')
  setSupervisedDraft(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @Param('id') id: string,
    @Body() dto: SupervisedDraftDto,
  ) {
    if (ws.role === 'assistant' && !ws.permissions.some((p) => p.startsWith('rx.'))) {
      throw new ForbiddenException('You do not have permission to update prescriptions');
    }
    return this.patients.setSupervisedDraft(doctorId, id, dto.data);
  }

  // "+ Add medicine" after Save & print (19/10/2026): lines appended to the
  // stored drug history by the server — see the service. Gated for an assistant
  // as `drugHistory` is in PATCH above: any prescription key. A supervising
  // doctor is refused in the service, as for PATCH.
  @Post(':id/drug-history')
  appendDrugHistory(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @Param('id') id: string,
    @Body() dto: AppendDrugHistoryDto,
  ) {
    if (ws.role === 'assistant' && !ws.permissions.some((p) => p.startsWith('rx.'))) {
      throw new ForbiddenException('You do not have permission to update prescriptions');
    }
    return this.patients.appendDrugHistory(doctorId, id, dto.entries);
  }

  // ⚕️ One stored medicine's start date and duration put right (physician's
  // sheet, 07/11/2026): the block is replaced by its exact text under the row's
  // lock, and only a new date and new durations are accepted — see the service.
  // Gated as the append: an assistant needs any prescription key, a supervising
  // doctor is refused in the service.
  @Patch(':id/drug-history')
  replaceDrugHistoryBlock(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @Param('id') id: string,
    @Body() dto: ReplaceDrugHistoryBlockDto,
  ) {
    if (ws.role === 'assistant' && !ws.permissions.some((p) => p.startsWith('rx.'))) {
      throw new ForbiddenException('You do not have permission to update prescriptions');
    }
    return this.patients.replaceDrugHistoryBlock(doctorId, id, dto.replace, dto.replacement);
  }

  // ⚕️ On-examination findings of a saved visit, appended to the patient's
  // shared history (physician, 28/10 + 31/10/2026: every doctor of the patient
  // sees them). Unlike PATCH, a SUPERVISING doctor may append here — the
  // history is the patient's, not one practice's — but only append: nothing a
  // client sends can rewrite or remove an entry, and the author is stamped by
  // the server. An assistant needs any prescription key, as for PATCH.
  @Post(':id/on-examination')
  appendOnExamination(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @Param('id') id: string,
    @Body() dto: AppendOnExaminationDto,
  ) {
    if (ws.role === 'assistant' && !ws.permissions.some((p) => p.startsWith('rx.'))) {
      throw new ForbiddenException('You do not have permission to update prescriptions');
    }
    return this.patients.appendOnExamination(doctorId, id, dto.entries);
  }

  // ⚕️ A Disease / Surgical history entry of that shared history taken off —
  // SOFTLY: stamped removed, kept in the row, and put back by /restore (the
  // sidebar's Undo). Same reach as the append above: every practice that adds
  // to the patient's history (sheet 28/10/2026, item 7). Only entries written
  // `Disease Hx:` / `Surgical Hx:` can be named; an examination finding cannot.
  @Post(':id/on-examination/remove')
  @HttpCode(200)
  removeHistoryEntry(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @Param('id') id: string,
    @Body() dto: HistoryEntryRefDto,
  ) {
    if (ws.role === 'assistant' && !ws.permissions.some((p) => p.startsWith('rx.'))) {
      throw new ForbiddenException('You do not have permission to update prescriptions');
    }
    return this.patients.setHistoryEntryRemoved(doctorId, id, dto.kind, dto.text, true);
  }

  @Post(':id/on-examination/restore')
  @HttpCode(200)
  restoreHistoryEntry(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @Param('id') id: string,
    @Body() dto: HistoryEntryRefDto,
  ) {
    if (ws.role === 'assistant' && !ws.permissions.some((p) => p.startsWith('rx.'))) {
      throw new ForbiddenException('You do not have permission to update prescriptions');
    }
    return this.patients.setHistoryEntryRemoved(doctorId, id, dto.kind, dto.text, false);
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
