import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IpdService } from './ipd.service';
import {
  CreateAdmissionDto,
  CreateIpdEventDto,
  UpdateAdmissionDto,
  UpdateAdmissionStatusDto,
} from './dto/ipd.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { WorkstationDoctorId } from '../workstations/workstation.decorator';

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
