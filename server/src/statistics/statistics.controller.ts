import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { WorkstationDoctorId } from '../workstations/workstation.decorator';
import { ChambersService } from '../chambers/chambers.service';
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

  // ⚕️ `chamber` is a claim, decided where every chamber is decided: absent,
  // empty or `all` is every chamber of the practice ("All chamber total");
  // anything else goes through `ChambersService.resolve` — the default chamber's
  // own id is the default chamber, another live chamber of THIS practice is that
  // one, and another practice's, a removed one or a made-up id is 404, never a
  // quiet fall-back to the total.
  private async scope(doctorId: string, raw: unknown): Promise<ChamberScope> {
    if (raw === undefined || raw === '' || raw === 'all') return { kind: 'all' };
    if (typeof raw !== 'string') throw new BadRequestException('Choose one chamber, or all.');
    return { kind: 'one', chamberId: await this.chambers.resolve(doctorId, raw) };
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
