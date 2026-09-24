import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { PatientNotesService } from './patient-notes.service';
import { SavePatientNoteDto } from './dto/patient-note.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { WorkstationDoctorId } from '../workstations/workstation.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

/**
 * ⚕️ Private per-user notes about a patient. The note is keyed by
 * `@CurrentUser().id` — the person signed in — and NEVER by
 * `@WorkstationDoctorId()`, which is used only to prove the patient is
 * reachable. See PatientNotesService. No permission key: every user has their
 * own, and nobody can reach anyone else's.
 */
@Controller('patient-notes')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class PatientNotesController {
  constructor(private readonly notes: PatientNotesService) {}

  // GET /api/patient-notes/:patientId → { note } — the caller's own, or null.
  // Wrapped: a bare null is an empty 200 body, which the client cannot parse.
  @Get(':patientId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @WorkstationDoctorId() doctorId: string,
    @Param('patientId') patientId: string,
  ) {
    return { note: await this.notes.get(user.id, doctorId, patientId) };
  }

  // PUT /api/patient-notes/:patientId { html, patientInfo }
  @Put(':patientId')
  save(
    @CurrentUser() user: AuthenticatedUser,
    @WorkstationDoctorId() doctorId: string,
    @Param('patientId') patientId: string,
    @Body() dto: SavePatientNoteDto,
  ) {
    return this.notes.save(user.id, doctorId, patientId, dto);
  }
}
