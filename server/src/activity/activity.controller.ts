import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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

  // ?limit= (1–200, default 50) &patientId= &cursor=
  // The feed is a log: cursor-paged, newest first. The body stays a plain
  // array; `X-Next-Cursor` carries the id to pass as `cursor` for the next
  // page and is absent on the last one.
  @Get()
  async list(
    @WorkstationDoctorId() doctorId: string,
    @Res({ passthrough: true }) res: Response,
    @Query('limit') limit?: string,
    @Query('patientId') patientId?: string,
    @Query('cursor') cursor?: string,
  ) {
    const { items, nextCursor } = await this.activity.list(doctorId, {
      limit: limit ? Number(limit) : undefined,
      patientId: patientId || undefined,
      cursor: cursor || undefined,
    });
    if (nextCursor) res.setHeader('X-Next-Cursor', nextCursor);
    return items;
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
