import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { CreateActivityDto } from './dto/activity.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { WorkstationDoctorId } from '../workstations/workstation.decorator';

// The activity feed is shared across a practice — keyed to the active
// workstation's doctor, but each entry attributed to the logged-in actor.
@Controller('activity')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(@WorkstationDoctorId() doctorId: string, @Query('limit') limit?: string) {
    return this.activity.list(doctorId, limit ? Number(limit) : undefined);
  }

  @Post()
  create(
    @WorkstationDoctorId() doctorId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateActivityDto,
  ) {
    const actorName = user.displayName?.trim() || user.name || 'Someone';
    return this.activity.create(doctorId, actorName, dto);
  }
}
