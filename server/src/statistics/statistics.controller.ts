import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { WorkstationDoctorId } from '../workstations/workstation.decorator';
import { ChambersService } from '../chambers/chambers.service';
import { resolveChamberScope } from './chamber-scope';
import { ChamberScope, StatisticsService } from './statistics.service';

// Settings → Statistics (physician's sheet, 11/11/2026). Read only. The practice
// doctor from the workstation, as everywhere (Rule 1); open to the practice's
// assistants as well (physician, 11/11/2026), who see the practice's numbers.
@Controller('statistics')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class StatisticsController {
  constructor(
    private readonly stats: StatisticsService,
    private readonly chambers: ChambersService,
  ) {}

  // ⚕️ `chamber` is a claim — see `chamber-scope.ts`, the one copy of that rule.
  private scope(doctorId: string, raw: unknown): Promise<ChamberScope> {
    return resolveChamberScope(this.chambers, doctorId, raw);
  }

  @Get('visits/days')
  async days(@WorkstationDoctorId() doctorId: string, @Query('month') month?: unknown, @Query('chamber') chamber?: unknown) {
    return this.stats.visitsByDay(doctorId, await this.scope(doctorId, chamber), month as string | undefined);
  }

  @Get('visits/months')
  async months(@WorkstationDoctorId() doctorId: string, @Query('year') year?: unknown, @Query('chamber') chamber?: unknown) {
    return this.stats.visitsByMonth(doctorId, await this.scope(doctorId, chamber), year as string | undefined);
  }

  @Get('visits/overall')
  async overall(@WorkstationDoctorId() doctorId: string, @Query('chamber') chamber?: unknown) {
    return this.stats.overall(doctorId, await this.scope(doctorId, chamber));
  }

  // The practice's whole prescription record: a prescription holds no chamber.
  @Get('diseases')
  diseases(@WorkstationDoctorId() doctorId: string) {
    return this.stats.diseases(doctorId);
  }
}
