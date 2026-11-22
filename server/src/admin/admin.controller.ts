import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminDoctorService } from './admin-doctor.service';
import { DoctorSettingsDto } from './dto/doctor-settings.dto';
import { RejectDto } from './dto/reject.dto';
import { TierDto } from './dto/tier.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly doctors: AdminDoctorService,
  ) {}

  @Get('registrations')
  list(@Query('status') status?: string) {
    return this.admin.listRegistrations(status);
  }

  @Get('registrations/:id')
  getOne(@Param('id') id: string) {
    return this.admin.getOne(id);
  }

  @Patch('registrations/:id/approve')
  approve(@Param('id') id: string) {
    return this.admin.approve(id);
  }

  @Patch('registrations/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto) {
    return this.admin.reject(id, dto.reason);
  }

  @Patch('registrations/:id/suspend')
  suspend(@Param('id') id: string) {
    return this.admin.suspend(id);
  }

  @Patch('registrations/:id/tier')
  setTier(@Param('id') id: string, @Body() dto: TierDto) {
    return this.admin.setTier(id, dto.tier);
  }

  // Soft-delete → Trash (recoverable).
  @Delete('registrations/:id')
  softDelete(@Param('id') id: string) {
    return this.admin.softDelete(id);
  }

  // Permanent delete from Trash. More specific path than :id, declared
  // separately so it doesn't collide with the soft-delete route above.
  @Delete('registrations/:id/permanent')
  hardDelete(@Param('id') id: string) {
    return this.admin.hardDelete(id);
  }

  // Force-revoke every live session for a user (e.g. suspected device
  // theft). Returns the number of refresh tokens revoked.
  @Post('users/:id/revoke-sessions')
  revokeSessions(@Param('id') id: string) {
    return this.admin.revokeSessions(id);
  }

  // ── Account → Profile settings (physician's sheet, 16/11/2026) ───────
  @Get('users/:id/settings')
  settings(@Param('id') id: string) {
    return this.doctors.getSettings(id);
  }

  @Patch('users/:id/settings')
  updateSettings(@Param('id') id: string, @Body() dto: DoctorSettingsDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.doctors.updateSettings(id, dto, admin.id);
  }

  @Get('users/:id/point-scores')
  pointScores(@Param('id') id: string) {
    return this.doctors.getPointScores(id);
  }

  // The scores are taken RAW (`@Body('scores')`, no DTO class): the global
  // ValidationPipe runs class-transformer over a DTO's nested object, and that
  // throws a TypeError (a 500) for an object with an own `constructor` key. The
  // service's `checkScores` is the one judge of the whole value instead.
  @Put('users/:id/point-scores')
  savePointScores(@Param('id') id: string, @Body('scores') scores: unknown, @CurrentUser() admin: AuthenticatedUser) {
    return this.doctors.savePointScores(id, scores, admin.id);
  }

  // ── Account → Dr's patient data: the doctor's Statistics, read only ──
  // Same numbers, same chamber rule as the doctor's own `/statistics/*`.
  @Get('users/:id/statistics/chambers')
  statChambers(@Param('id') id: string) {
    return this.doctors.chambersOf(id);
  }

  @Get('users/:id/statistics/visits/days')
  statDays(@Param('id') id: string, @Query('month') month?: string, @Query('chamber') chamber?: unknown) {
    return this.doctors.visitsByDay(id, chamber, month);
  }

  @Get('users/:id/statistics/visits/months')
  statMonths(@Param('id') id: string, @Query('year') year?: string, @Query('chamber') chamber?: unknown) {
    return this.doctors.visitsByMonth(id, chamber, year);
  }

  @Get('users/:id/statistics/visits/overall')
  statOverall(@Param('id') id: string, @Query('chamber') chamber?: unknown) {
    return this.doctors.overall(id, chamber);
  }

  @Get('users/:id/statistics/diseases')
  statDiseases(@Param('id') id: string) {
    return this.doctors.diseases(id);
  }
}
