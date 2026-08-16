import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { RxHabitsService } from './rx-habits.service';
import { UpdateRxHabitDto } from './dto/rx-habit.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { WorkstationDoctorId } from '../workstations/workstation.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

/**
 * Prescribing habit suggestions ("my usual dose") for the ℞ pad.
 *
 * ⚕️ P1 — SCOPE IS THE WORKSTATION DOCTOR. Every route takes its doctorId from
 * `@WorkstationDoctorId()`, never from `req.user.id`. An assistant working
 * inside Dr. X's workstation sees Dr. X's habits, because the prescription they
 * are writing will carry Dr. X's name. A supervising doctor acts in their OWN
 * workstation and so sees their own habits — correct, and needing no special
 * case. NO DOCTOR EVER SEES ANOTHER DOCTOR'S HABITS.
 */
@Controller('rx-habits')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class RxHabitsController {
  constructor(private readonly habits: RxHabitsService) {}

  // GET /api/rx-habits?q=napa
  @Get()
  list(@WorkstationDoctorId() doctorId: string, @Query('q') q?: string) {
    return this.habits.list(doctorId, q ?? '');
  }

  // PATCH /api/rx-habits/:id  { hidden?, pinned? }
  // No DELETE — P4: "deleting" a suggestion sets `hidden`, and the prescription
  // record it was learned from stays byte-identical.
  @Patch(':id')
  update(
    @WorkstationDoctorId() doctorId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRxHabitDto,
  ) {
    // Ownership is checked in the service (a foreign id → 404), exactly as
    // TemplatesService#owned does.
    const actorName = user.displayName || user.name || user.email;
    return this.habits.setFlags(doctorId, actorName, id, dto);
  }
}
