import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaveDrugAdviceDto } from './dto/drug-advice.dto';
import { adviceKey, cleanLines } from './keys';

export interface DrugAdviceRow {
  id: string;
  scope: string;
  key: string;
  label: string;
  lines: string[];
  updatedAt: Date;
}

/**
 * The doctor's own special advice per medicine / per generic (the ℞ pad's •••
 * box). Every line is written by the doctor — nothing here is learned or
 * inferred — and it never touches a prescription: the client copies the lines
 * into the visit's Advice section, and `Prescription.advice` is what prints.
 *
 * Scope is ALWAYS the workstation doctor passed in by the controller; this
 * service never resolves a practice itself (server/CLAUDE.md, ActivityService).
 */
@Injectable()
export class DrugAdviceService implements OnModuleInit {
  private readonly log = new Logger(DrugAdviceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // The doctor sees an empty list either way, so the log is the only place a
  // missing table can announce itself. Never throws.
  async onModuleInit(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1 FROM "DoctorDrugAdvice" LIMIT 1`;
    } catch (e) {
      this.log.error(
        'DoctorDrugAdvice is unreadable — special drug advice is DEAD (the ℞ pad ' +
          'still works). Apply server/prisma/manual-drug-advice.sql through the ' +
          `tunnel. Cause: ${String(e)}`,
      );
    }
  }

  /** Every advice this doctor has written that still has lines. */
  async list(doctorId: string): Promise<DrugAdviceRow[]> {
    const rows = await this.prisma.doctorDrugAdvice.findMany({
      where: { doctorId },
      select: { id: true, scope: true, key: true, label: true, lines: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.filter((r) => r.lines.length > 0);
  }

  /** Replace the advice for one medicine / generic with the doctor's list. */
  async save(doctorId: string, dto: SaveDrugAdviceDto): Promise<DrugAdviceRow> {
    const label = dto.label.replace(/\s+/g, ' ').trim();
    const key = adviceKey(dto.scope, label);
    if (!key) throw new BadRequestException('Name the medicine or generic this advice is for.');
    const lines = cleanLines(dto.lines);
    return this.prisma.doctorDrugAdvice.upsert({
      where: { doctorId_scope_key: { doctorId, scope: dto.scope, key } },
      create: { doctorId, scope: dto.scope, key, label, lines },
      update: { label, lines },
      select: { id: true, scope: true, key: true, label: true, lines: true, updatedAt: true },
    });
  }
}
