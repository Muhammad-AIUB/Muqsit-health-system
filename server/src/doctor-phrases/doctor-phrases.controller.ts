import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { DoctorPhrasesService } from './doctor-phrases.service';
import { UpdateDoctorPhraseDto } from './dto/doctor-phrase.dto';
import { isPhraseSource } from './normalise';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { WorkstationDoctorId } from '../workstations/workstation.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

/**
 * Phrases a doctor has written before — the ADVICE list and free-typed ℞ note
 * lines — offered back as they type.
 *
 * ⚕️ SCOPE IS THE WORKSTATION DOCTOR. Every route takes its doctorId from
 * `@WorkstationDoctorId()`, never from `req.user.id`. An assistant working
 * inside Dr. X's workstation sees Dr. X's phrases, because the prescription
 * they are writing will carry Dr. X's name. A supervising doctor acts in their
 * OWN workstation and so sees their own. NO DOCTOR EVER SEES ANOTHER'S.
 */
@Controller('doctor-phrases')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class DoctorPhrasesController {
  constructor(private readonly phrases: DoctorPhrasesService) {}

  // GET /api/doctor-phrases?source=advice&q=insu
  @Get()
  list(
    @WorkstationDoctorId() doctorId: string,
    @Query('source') source?: string,
    @Query('q') q?: string,
  ) {
    // An unknown surface returns nothing rather than 400: this feeds a dropdown
    // while the doctor types, and a red error there would be worse than silence.
    if (!isPhraseSource(source)) return [];
    return this.phrases.list(doctorId, source, q ?? '');
  }

  // PATCH /api/doctor-phrases/:id  { hidden }
  // No DELETE — "deleting" a suggestion sets `hidden`, and the prescription it
  // was learned from stays byte-identical.
  @Patch(':id')
  update(
    @WorkstationDoctorId() doctorId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDoctorPhraseDto,
  ) {
    const actorName = user.displayName || user.name || user.email;
    return this.phrases.setHidden(doctorId, actorName, id, dto.hidden);
  }
}
