import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ChambersService } from '../chambers/chambers.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveChamberScope } from '../statistics/chamber-scope';
import { StatisticsService } from '../statistics/statistics.service';
import { DoctorSettingsDto } from './dto/doctor-settings.dto';
import { checkScores, POINT_CRITERIA, readStoredScores, type PointScores } from './point-system';

export interface DoctorSettings {
  isolated: boolean;
  hideMhsLogo: boolean;
}

export interface DoctorPointScores {
  criteria: { key: string; label: string }[];
  scores: PointScores;
  updatedAt: Date | null;
}

// What the admin console does for ONE doctor's account beyond registration
// (physician's sheet, 16/11/2026): the doctor's patient numbers as the doctor
// sees them, the two switches of Profile settings, and the Point system.
//
// Every route that reaches here is `@Roles('admin')`. The doctor is taken from
// the URL — here, and only here, that is right: the admin is not working inside a
// practice, they are looking at one account — and it must be a professional
// account (the same 404 the registration routes give), never another admin.
@Injectable()
export class AdminDoctorService {
  private readonly log = new Logger(AdminDoctorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: StatisticsService,
    private readonly chambers: ChambersService,
  ) {}

  private async doctor(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isolated: true, hideMhsLogo: true },
    });
    if (!user || user.role !== 'professional') throw new NotFoundException('Registration not found');
    return user;
  }

  // ── Profile settings: the two switches ───────────────────────────────
  async getSettings(id: string): Promise<DoctorSettings> {
    const u = await this.doctor(id);
    return { isolated: u.isolated, hideMhsLogo: u.hideMhsLogo };
  }

  async updateSettings(id: string, dto: DoctorSettingsDto, adminId: string): Promise<DoctorSettings> {
    await this.doctor(id);
    // `typeof … === 'boolean'`, not `!== undefined`: `@IsOptional()` lets a null
    // through validation, and a null written to a NOT NULL column is a 500.
    const data: Partial<DoctorSettings> = {};
    if (typeof dto.isolated === 'boolean') data.isolated = dto.isolated;
    if (typeof dto.hideMhsLogo === 'boolean') data.hideMhsLogo = dto.hideMhsLogo;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Send isolated, hideMhsLogo, or both.');
    }
    const u = await this.prisma.user.update({
      where: { id },
      data,
      select: { isolated: true, hideMhsLogo: true },
    });
    // Who changed what, for whoever asks later: these two switches decide whose
    // patients can be opened and what a prescription carries.
    this.log.log(`settings user=${id} by=${adminId} ${JSON.stringify(data)}`);
    return { isolated: u.isolated, hideMhsLogo: u.hideMhsLogo };
  }

  // ── Point system ─────────────────────────────────────────────────────
  async getPointScores(id: string): Promise<DoctorPointScores> {
    await this.doctor(id);
    const row = await this.prisma.doctorPointScore.findUnique({ where: { userId: id } });
    return {
      criteria: POINT_CRITERIA.map((c) => ({ key: c.key, label: c.label })),
      scores: readStoredScores(row?.scores),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  // The WHOLE set is saved (see `checkScores`): what the admin sees in the ten
  // boxes is what is kept, so there is nothing to merge and no read-modify-write
  // for two admins to race on — the last save wins, and says when.
  async savePointScores(id: string, input: unknown, adminId: string): Promise<DoctorPointScores> {
    await this.doctor(id);
    const verdict = checkScores(input);
    // (`in`, not `!verdict.ok`: this tsconfig is not strict, so `ok` does not narrow.)
    if ('problem' in verdict) throw new BadRequestException(verdict.problem);
    const scores = verdict.scores as Prisma.InputJsonObject;
    await this.prisma.doctorPointScore.upsert({
      where: { userId: id },
      create: { userId: id, scores },
      update: { scores },
    });
    this.log.log(`point scores user=${id} by=${adminId}`);
    return this.getPointScores(id);
  }

  // ── The doctor's patient data (Statistics, 11/11/2026) as the doctor sees it ──
  // The same service and the same chamber rule as the doctor's own page; only the
  // doctor comes from the URL. Numbers only — no patient is named or opened.

  // The doctor's live chambers for the dropdown, READ ONLY: the doctor's own list
  // (`ChambersService.list`) makes the default chamber on first read, and the
  // admin looking at an account must not write into it.
  async chambersOf(id: string) {
    await this.doctor(id);
    return this.prisma.opdChamber.findMany({
      where: { doctorId: id, removedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, isDefault: true },
    });
  }

  async visitsByDay(id: string, chamber: unknown, month?: string) {
    await this.doctor(id);
    return this.stats.visitsByDay(id, await resolveChamberScope(this.chambers, id, chamber), month);
  }

  async visitsByMonth(id: string, chamber: unknown, year?: string) {
    await this.doctor(id);
    return this.stats.visitsByMonth(id, await resolveChamberScope(this.chambers, id, chamber), year);
  }

  async overall(id: string, chamber: unknown) {
    await this.doctor(id);
    return this.stats.overall(id, await resolveChamberScope(this.chambers, id, chamber));
  }

  async diseases(id: string) {
    await this.doctor(id);
    return this.stats.diseases(id);
  }
}
