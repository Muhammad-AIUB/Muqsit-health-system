import { Injectable, NotFoundException } from '@nestjs/common';
import { OpdVisit, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ROW_LOCK_TX } from '../prisma/row-lock';
import { startOfDhakaDay } from './dhaka-day';
import {
  CreateOpdVisitDto,
  SetRxStatusDto,
  UpdateOpdStatusDto,
} from './dto/opd.dto';

@Injectable()
export class OpdService {
  constructor(private readonly prisma: PrismaService) {}

  // Today's queue for this doctor.
  list(doctorId: string): Promise<OpdVisit[]> {
    const startOfDay = startOfDhakaDay();
    return this.prisma.opdVisit.findMany({
      where: { doctorId, createdAt: { gte: startOfDay } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ⚕️ One write to a doctor's queue at a time (19/10/2026). Each of them reads
  // today's queue and then writes: two at once each saw the other missing — two
  // tokens for one patient, or one token for two. The lock is the
  // transaction's, and is let go when it ends.
  private lockQueue(tx: Prisma.TransactionClient, doctorId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`opd:${doctorId}`}))`;
  }

  // Allocate the next per-doctor-per-day token (T-NN) from the MAX existing
  // serial for today rather than a bare count(): a bare count reuses a number
  // after a mid-day visit is deleted (two rows would then share a token), and
  // reads the same value under concurrency. Deriving from the max suffix makes
  // the serial append-only, and running inside a transaction shrinks the race
  // window. (A DB unique index on (doctorId, day, token) is the full guard —
  // see prisma/manual-opd-token-unique.sql.)
  private async nextToken(
    tx: Prisma.TransactionClient,
    doctorId: string,
    startOfDay: Date,
  ): Promise<string> {
    const todays = await tx.opdVisit.findMany({
      where: { doctorId, createdAt: { gte: startOfDay } },
      select: { token: true },
    });
    let max = 0;
    for (const { token } of todays) {
      const m = /^T-(\d+)$/.exec(token ?? '');
      if (m) {
        const n = Number(m[1]);
        if (n > max) max = n;
      }
    }
    return `T-${String(max + 1).padStart(2, '0')}`;
  }

  async create(doctorId: string, dto: CreateOpdVisitDto): Promise<OpdVisit> {
    // Token: T-<serial of today>, per doctor.
    const startOfDay = startOfDhakaDay();
    return this.prisma.$transaction(async (tx) => {
      await this.lockQueue(tx, doctorId);
      // ⚕️ A patient still WAITING in today's queue, their prescription not yet
      // printed, keeps their place and token (19/10/2026): an add whose answer
      // was lost on the way back, pressed again, put the same patient in the
      // queue twice. Seen already today — Done pressed, or the prescription
      // printed (Save & print marks it complete and leaves it waiting) — they
      // are queued again: a second visit is a real one (review, 19/10/2026).
      if (dto.patientId) {
        const waiting = await tx.opdVisit.findFirst({
          where: {
            doctorId, patientId: dto.patientId, createdAt: { gte: startOfDay }, status: 'waiting',
            OR: [{ rxStatus: null }, { rxStatus: 'incomplete' }],
          },
          orderBy: { createdAt: 'desc' },
        });
        if (waiting) return waiting;
      }
      const token = await this.nextToken(tx, doctorId, startOfDay);
      return tx.opdVisit.create({
        data: { ...dto, type: dto.type ?? 'New', doctorId, token },
      });
    }, ROW_LOCK_TX);
  }

  async setStatus(doctorId: string, id: string, dto: UpdateOpdStatusDto): Promise<OpdVisit> {
    const visit = await this.prisma.opdVisit.findFirst({ where: { id, doctorId } });
    if (!visit) throw new NotFoundException('Visit not found');
    return this.prisma.opdVisit.update({ where: { id }, data: { status: dto.status } });
  }

  // Upsert today's queue entry for a patient and set its prescription status
  // (incomplete | complete). Reuses an existing same-day visit for the patient
  // so a queued or already-flagged patient isn't duplicated.
  async setRxStatusByPatient(doctorId: string, dto: SetRxStatusDto): Promise<OpdVisit> {
    const startOfDay = startOfDhakaDay();
    return this.prisma.$transaction(async (tx) => {
      await this.lockQueue(tx, doctorId);
      const existing = await tx.opdVisit.findFirst({
        where: { doctorId, patientId: dto.patientId, createdAt: { gte: startOfDay } },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return tx.opdVisit.update({
          where: { id: existing.id },
          data: { rxStatus: dto.rxStatus },
        });
      }
      const token = await this.nextToken(tx, doctorId, startOfDay);
      return tx.opdVisit.create({
        data: {
          doctorId,
          patientId: dto.patientId,
          name: dto.name ?? 'Patient',
          phone: dto.phone ?? null,
          age: dto.age ?? null,
          gender: dto.gender ?? null,
          type: 'Rx',
          rxStatus: dto.rxStatus,
          token,
        },
      });
    }, ROW_LOCK_TX);
  }
}
