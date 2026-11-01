import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';
import {
  ActiveWorkstation,
  WorkstationDoctorId,
} from '../workstations/workstation.decorator';
import type { Workstation } from '../workstations/workstations.service';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { Actor, PatientDrugSafetyService } from './patient-drug-safety.service';
import { AddDrugSafetyDto, UpdateDrugSafetyDto } from './dto/drug-safety.dto';

// ⚕️ The assistant's key for this list is the Drug history row's own,
// `rx.drugHistory` — the section sits under Drug history and the client locks it
// with the same key. Reading needs no key: an allergy is never hidden from
// anyone who can open the patient.
const WRITE_KEY = 'rx.drugHistory';

/**
 * "H/O drug hypersensitivity and High-Alert Medication" (physician's sheet,
 * 31/10/2026) — see PatientDrugSafetyService for who may do what.
 */
@Controller('patients/:id/drug-safety')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class PatientDrugSafetyController {
  constructor(private readonly svc: PatientDrugSafetyService) {}

  @Get()
  list(@WorkstationDoctorId() doctorId: string, @Param('id') id: string) {
    return this.svc.list(doctorId, id);
  }

  @Post()
  add(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddDrugSafetyDto,
  ) {
    this.assertMayWrite(ws);
    return this.svc.add(doctorId, actorOf(user), id, dto);
  }

  @Patch(':entryId')
  update(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpdateDrugSafetyDto,
  ) {
    this.assertMayWrite(ws);
    return this.svc.update(doctorId, actorOf(user), id, entryId, dto);
  }

  // A SOFT removal — the row is kept, with who removed it and when.
  @Delete(':entryId')
  remove(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
  ) {
    this.assertMayWrite(ws);
    return this.svc.remove(doctorId, actorOf(user), id, entryId);
  }

  @Post(':entryId/restore')
  restore(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
  ) {
    this.assertMayWrite(ws);
    return this.svc.restore(doctorId, actorOf(user), id, entryId);
  }

  private assertMayWrite(ws: Workstation): void {
    if (ws.role === 'assistant' && !ws.permissions.includes(WRITE_KEY)) {
      throw new ForbiddenException(
        'You do not have permission to edit the drug history',
      );
    }
  }
}

const actorOf = (user: AuthenticatedUser): Actor => ({
  userId: user.id,
  name: user.displayName?.trim() || user.name || 'Someone',
});
