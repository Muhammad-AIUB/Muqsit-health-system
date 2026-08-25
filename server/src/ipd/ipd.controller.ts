import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IpdService } from './ipd.service';
import {
  AddAnalogueSheetsDto,
  CreateAdmissionDto,
  CreateIpdEventDto,
  UpdateAdmissionDto,
  UpdateAdmissionStatusDto,
  UpdateAnalogueSheetDto,
} from './dto/ipd.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { WorkstationGuard } from '../workstations/workstation.guard';
import {
  ActiveWorkstation,
  WorkstationDoctorId,
} from '../workstations/workstation.decorator';
import type { Workstation } from '../workstations/workstations.service';
import type { Actor } from './ipd.service';

// IPD admissions belong to the active workstation's doctor. Events are recorded
// under that admission but attributed to the actual logged-in user (the actor).
@Controller('ipd')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class IpdController {
  constructor(private readonly ipd: IpdService) {}

  @Get()
  list(@WorkstationDoctorId() doctorId: string) {
    return this.ipd.list(doctorId);
  }

  @Post()
  create(@WorkstationDoctorId() doctorId: string, @Body() dto: CreateAdmissionDto) {
    return this.ipd.create(doctorId, dto);
  }

  @Patch(':id/status')
  setStatus(
    @WorkstationDoctorId() doctorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAdmissionStatusDto,
  ) {
    return this.ipd.setStatus(doctorId, id, dto);
  }

  @Patch(':id')
  update(
    @WorkstationDoctorId() doctorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAdmissionDto,
  ) {
    return this.ipd.update(doctorId, id, dto);
  }

  // ── Analogue (paper) order-sheet pages ──────────────────────────────────
  // Per-page operations on purpose. The whole-`clinical` PATCH above replaces
  // the object wholesale, so photographing a page through it would both carry
  // along the editor's half-typed fields and let two devices overwrite each
  // other's pages. See `ipd.service.ts`.

  @Post(':id/analogue')
  addAnalogue(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddAnalogueSheetsDto,
  ) {
    return this.ipd.addAnalogueSheets(doctorId, id, ws, actorOf(user, ws), dto);
  }

  @Patch(':id/analogue/:sheetId')
  updateAnalogue(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('sheetId') sheetId: string,
    @Body() dto: UpdateAnalogueSheetDto,
  ) {
    return this.ipd.updateAnalogueSheet(doctorId, id, sheetId, ws, actorOf(user, ws), dto);
  }

  @Delete(':id/analogue/:sheetId')
  removeAnalogue(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('sheetId') sheetId: string,
  ) {
    return this.ipd.removeAnalogueSheet(doctorId, id, sheetId, ws, actorOf(user, ws));
  }

  @Post(':id/analogue/:sheetId/restore')
  restoreAnalogue(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('sheetId') sheetId: string,
  ) {
    return this.ipd.restoreAnalogueSheet(doctorId, id, sheetId, ws, actorOf(user, ws));
  }

  @Get(':id/events')
  events(@WorkstationDoctorId() doctorId: string, @Param('id') id: string) {
    return this.ipd.listEvents(doctorId, id);
  }

  @Post(':id/events')
  addEvent(
    @WorkstationDoctorId() doctorId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateIpdEventDto,
  ) {
    return this.ipd.addEvent(doctorId, id, user.displayName?.trim() || user.name, dto);
  }
}

// The audit line names the person who acted, never the workstation's doctor —
// an assistant photographing a page must appear as themselves in the feed.
function actorOf(user: AuthenticatedUser, ws: Workstation): Actor {
  return {
    id: user.id,
    name: user.displayName?.trim() || user.name,
    role: ws.role === 'assistant' ? 'Assistant' : undefined,
  };
}
