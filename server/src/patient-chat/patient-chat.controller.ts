import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PatientChatService } from './patient-chat.service';
import { AddSupervisorDto, SendChatDto } from './dto/chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { WorkstationDoctorId } from '../workstations/workstation.decorator';

const nameOf = (u: AuthenticatedUser) =>
  u.displayName?.trim() || u.name || 'Someone';

// Per-patient team chat + supervising-doctor assignment. Access is resolved per
// request inside the service (owner / assistant / assigned supervisor).
@Controller('patients')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class PatientChatController {
  constructor(private readonly chat: PatientChatService) {}

  @Get(':id/chat')
  list(
    @Param('id') patientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @WorkstationDoctorId() doctorId: string,
  ) {
    return this.chat.listMessages(patientId, user.id, doctorId);
  }

  @Post(':id/chat')
  send(
    @Param('id') patientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @WorkstationDoctorId() doctorId: string,
    @Body() dto: SendChatDto,
  ) {
    return this.chat.sendMessage(patientId, user.id, nameOf(user), doctorId, dto);
  }

  @Get(':id/supervisors')
  supervisors(
    @Param('id') patientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @WorkstationDoctorId() doctorId: string,
  ) {
    return this.chat.listSupervisors(patientId, user.id, doctorId);
  }

  @Post(':id/supervisors')
  addSupervisor(
    @Param('id') patientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddSupervisorDto,
  ) {
    return this.chat.addSupervisor(patientId, user.id, dto.identifier);
  }

  @Delete(':id/supervisors/:doctorId')
  removeSupervisor(
    @Param('id') patientId: string,
    @Param('doctorId') doctorId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chat.removeSupervisor(patientId, user.id, doctorId);
  }
}

// The signed-in user's "Supervised patients" list — patients other doctors have
// assigned them to supervise. Own account context (no workstation needed).
@Controller('supervised')
@UseGuards(JwtAuthGuard)
export class SupervisedController {
  constructor(private readonly chat: PatientChatService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.listSupervisedPatients(user.id);
  }
}
