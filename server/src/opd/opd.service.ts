import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OpdDaySetting, OpdVisit, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ROW_LOCK_TX } from '../prisma/row-lock';
import { dhakaDayKey, dhakaDayStart, isDayKey } from './dhaka-day';
import {
  CreateOpdVisitDto,
  MoveOpdVisitDto,
  SaveOpdScheduleDto,
  SetOpdPresenceDto,
  SetRxStatusDto,
  UpdateOpdStatusDto,
} from './dto/opd.dto';
import { padStage, PadStage } from './pad-stage';
import { planMove, renumber } from './queue-order';
import { DEFAULT_OPD_SCHEDULE, OpdSchedule, scheduleProblem } from './schedule';

const NOT_A_DAY = 'That is not a day on the calendar.';
const PAST_DAY = 'A day that has passed cannot be changed.';
const TODAY_ONLY = "Only today's queue can be marked seen.";
const PRESENCE_TODAY_ONLY = "Only today's queue can be marked present.";

// A queue row as the doctor's screen reads it: the visit, the patient's picture,
// and how far the parked visit has got (never the draft itself).
export type OpdVisitRow = OpdVisit & { pictureUrl: string | null; padStage: PadStage };

// One day's queue in the order shown: by place, then arrival. A row an older
// build wrote with no place comes last, in the order it arrived.
const DISPLAY_ORDER: Prisma.OpdVisitOrderByWithRelationInput[] = [
  { position: { sort: 'asc', nulls: 'last' } },
  { createdAt: 'asc' },
];

export interface OpdScheduleAnswer extends OpdSchedule {
  day: string;
  // True when this day has settings of its own; false when it is showing the
  // latest earlier day's (or the pre-set values) and nothing is stored yet.
  saved: boolean;
}

@Injectable()
export class OpdService {
  private readonly log = new Logger(OpdService.name);
  // The missing-table message is said once per process, not on every list call.
  private supervisedDraftMissingLogged = false;

  constructor(private readonly prisma: PrismaService) {}

  // ⚕️ The day a visit belongs to. `queueDate` is the day it is booked for; a row
  // an older build wrote before `manual-opd-queue-date.sql` was applied (or in
  // the minutes between that SQL and the deploy) has none, and is the Dhaka day it
  // was created — so no patient drops out of a queue for want of a column.
  private visitDay(v: Pick<OpdVisit, 'queueDate' | 'createdAt'>): string {
    return v.queueDate ?? dhakaDayKey(v.createdAt);
  }

  private dayWhere(doctorId: string, day: string): Prisma.OpdVisitWhereInput {
    const start = dhakaDayStart(day);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return {
      doctorId,
      OR: [{ queueDate: day }, { queueDate: null, createdAt: { gte: start, lt: end } }],
    };
  }

  private requireDay(day: string): void {
    if (!isDayKey(day)) throw new BadRequestException(NOT_A_DAY);
  }

  // A day's queue for this doctor, in the order shown (default: today).
  async list(doctorId: string, day: string = dhakaDayKey()): Promise<OpdVisitRow[]> {
    this.requireDay(day);
    const rows = await this.prisma.opdVisit.findMany({ where: this.dayWhere(doctorId, day), orderBy: DISPLAY_ORDER });
    return this.decorate(doctorId, rows);
  }

  // ⚕️ The patient's picture and how far THIS practice's parked visit has got.
  // The draft read is this practice's own: the owner's `incompleteRx` when the
  // patient is theirs, else this doctor's own `SupervisedDraft` — never another
  // practice's (server/CLAUDE.md, Rule 2). A missing SupervisedDraft table costs
  // only the stage, never the queue.
  // A row of a day other than today carries no stage: the parked visit is
  // today's, and a visit booked for tomorrow (or left unseen on yesterday's
  // queue) must not read "History taken" from it.
  private async decorate(doctorId: string, rows: OpdVisit[]): Promise<OpdVisitRow[]> {
    const ids = [...new Set(rows.map((r) => r.patientId).filter((id): id is string => !!id))];
    if (ids.length === 0) return rows.map((r) => ({ ...r, pictureUrl: null, padStage: null }));
    const patients = await this.prisma.patient.findMany({
      // ⚕️ Scoped like PatientsService.accessibleWhere: create() takes any patientId,
      // so an id outside this practice (own or supervised) must not hand back its picture.
      where: { id: { in: ids }, OR: [{ doctorId }, { supervisors: { some: { doctorId } } }] },
      select: { id: true, doctorId: true, pictureUrl: true, incompleteRx: true },
    });
    let supervised: { patientId: string; data: Prisma.JsonValue }[] = [];
    try {
      supervised = await this.prisma.supervisedDraft.findMany({
        where: { doctorId, patientId: { in: ids } },
        select: { patientId: true, data: true },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021')) throw e;
      if (!this.supervisedDraftMissingLogged) {
        this.supervisedDraftMissingLogged = true;
        this.log.error('SupervisedDraft does not exist — apply prisma/manual-supervised-draft.sql. The pad stage of a supervised patient shows as none until it is.');
      }
    }
    const byId = new Map(patients.map((p) => [p.id, p]));
    const draftOf = new Map(supervised.map((s) => [s.patientId, s.data]));
    const today = dhakaDayKey();
    return rows.map((r) => {
      const p = r.patientId ? byId.get(r.patientId) : undefined;
      const draft = p ? (p.doctorId === doctorId ? p.incompleteRx : draftOf.get(p.id)) : null;
      return { ...r, pictureUrl: p?.pictureUrl ?? null, padStage: this.visitDay(r) === today ? padStage(draft, today) : null };
    });
  }

  private dayRows(tx: Prisma.TransactionClient, doctorId: string, day: string): Promise<OpdVisit[]> {
    return tx.opdVisit.findMany({ where: this.dayWhere(doctorId, day), orderBy: DISPLAY_ORDER });
  }

  // ⚕️ One write to a doctor's queue at a time (19/10/2026). Each of them reads
  // the queue and then writes: two at once each saw the other missing — two
  // tokens for one patient, or one token for two. The lock is the
  // transaction's, and is let go when it ends.
  private lockQueue(tx: Prisma.TransactionClient, doctorId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`opd:${doctorId}`}))`;
  }

  // Allocate the next per-doctor-per-day token (T-NN) from the MAX existing
  // serial of that day rather than a bare count(): a bare count reuses a number
  // after a mid-day visit is deleted (two rows would then share a token), and
  // reads the same value under concurrency. Deriving from the max suffix makes
  // the serial append-only, and running inside a transaction shrinks the race
  // window. (A DB unique index on (doctorId, queueDate, token) is the full guard —
  // see prisma/manual-opd-queue-date.sql.)
  private nextToken(rows: Pick<OpdVisit, 'token'>[]): string {
    let max = 0;
    for (const { token } of rows) {
      const m = /^T-(\d+)$/.exec(token ?? '');
      if (m) {
        const n = Number(m[1]);
        if (n > max) max = n;
      }
    }
    return `T-${String(max + 1).padStart(2, '0')}`;
  }

  // The schedule a day takes when it has none of its own: the latest earlier
  // day's, else the pre-set values.
  private async inheritedSchedule(
    db: Pick<Prisma.TransactionClient, 'opdDaySetting'>,
    doctorId: string,
    day: string,
  ): Promise<OpdDaySetting | null> {
    return db.opdDaySetting.findFirst({
      where: { doctorId, day: { lt: day } },
      orderBy: { day: 'desc' },
    });
  }

  // ⚕️ The times a patient is told come from the day's schedule. The first visit
  // added to a day saves the schedule that day took from an earlier one, so
  // changing the earlier day afterwards does not move times already given out.
  private async freezeSchedule(tx: Prisma.TransactionClient, doctorId: string, day: string): Promise<void> {
    const own = await tx.opdDaySetting.findUnique({ where: { doctorId_day: { doctorId, day } } });
    if (own) return;
    const inherited = await this.inheritedSchedule(tx, doctorId, day);
    if (!inherited) return;
    await tx.opdDaySetting.create({
      data: {
        doctorId,
        day,
        startTime: inherited.startTime,
        breakStart: inherited.breakStart,
        breakEnd: inherited.breakEnd,
        minutesPerPatient: inherited.minutesPerPatient,
      },
    });
  }

  // Add a visit at the end of a day's queue. The caller holds the queue's lock.
  private async append(
    tx: Prisma.TransactionClient,
    doctorId: string,
    day: string,
    data: Omit<Prisma.OpdVisitUncheckedCreateInput, 'doctorId' | 'token' | 'queueDate' | 'position'>,
  ): Promise<OpdVisit> {
    const rows = await this.dayRows(tx, doctorId, day);
    // Rows an older build wrote have no place: number them in the order shown
    // first, or the new one (which has a place) would be listed before them.
    for (const u of renumber(rows)) {
      await tx.opdVisit.update({ where: { id: u.id }, data: { position: u.position } });
    }
    await this.freezeSchedule(tx, doctorId, day);
    return tx.opdVisit.create({
      data: { ...data, doctorId, token: this.nextToken(rows), queueDate: day, position: rows.length + 1 },
    });
  }

  async create(doctorId: string, dto: CreateOpdVisitDto): Promise<OpdVisit> {
    const today = dhakaDayKey();
    const day = dto.date ?? today;
    this.requireDay(day);
    // ⚕️ A day that has passed is a record: nothing is added to it.
    if (day < today) throw new BadRequestException(PAST_DAY);
    const { date: _date, ...fields } = dto;
    void _date;

    return this.prisma.$transaction(async (tx) => {
      await this.lockQueue(tx, doctorId);
      // ⚕️ A patient still WAITING in that day's queue, their prescription not yet
      // printed, keeps their place and token (19/10/2026): an add whose answer was
      // lost on the way back, pressed again, put the same patient in the queue
      // twice. Seen already that day — Done pressed, or the prescription printed
      // (Save & print marks it complete and leaves it waiting) — they are queued
      // again: a second visit is a real one (review, 19/10/2026).
      if (dto.patientId) {
        const waiting = await tx.opdVisit.findFirst({
          where: {
            AND: [
              this.dayWhere(doctorId, day),
              { patientId: dto.patientId, status: 'waiting' },
              { OR: [{ rxStatus: null }, { rxStatus: 'incomplete' }] },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });
        if (waiting) return waiting;
      }
      return this.append(tx, doctorId, day, { ...fields, type: dto.type ?? 'New' });
    }, ROW_LOCK_TX);
  }

  // ⚕️ Done is for the patient in front of the doctor: today's queue only. A
  // later day's patient has not been seen, and a day that has passed keeps what it
  // holds.
  async setStatus(doctorId: string, id: string, dto: UpdateOpdStatusDto): Promise<OpdVisit> {
    const visit = await this.prisma.opdVisit.findFirst({ where: { id, doctorId } });
    if (!visit) throw new NotFoundException('Visit not found');
    if (this.visitDay(visit) !== dhakaDayKey()) throw new BadRequestException(TODAY_ONLY);
    return this.prisma.opdVisit.update({ where: { id }, data: { status: dto.status } });
  }

  // Move a patient one place up or down in their day, under the queue's lock.
  // Answers the day's queue as it now stands.
  async move(doctorId: string, id: string, dto: MoveOpdVisitDto): Promise<OpdVisitRow[]> {
    const visit = await this.prisma.opdVisit.findFirst({ where: { id, doctorId } });
    if (!visit) throw new NotFoundException('Visit not found');
    const day = this.visitDay(visit);
    if (day < dhakaDayKey()) throw new BadRequestException(PAST_DAY);

    const moved = await this.prisma.$transaction(async (tx) => {
      await this.lockQueue(tx, doctorId);
      const rows = await this.dayRows(tx, doctorId, day);
      const plan = planMove(rows, id, dto.direction);
      if (plan.ok === false) {
        if (plan.reason === 'not-found') throw new NotFoundException('Visit not found');
        if (plan.reason === 'done') throw new BadRequestException('A patient who has been seen cannot be moved.');
        return rows; // already first or last: nothing to do, and not an error
      }
      for (const u of plan.updates) {
        await tx.opdVisit.update({ where: { id: u.id }, data: { position: u.position } });
      }
      return this.dayRows(tx, doctorId, day);
    }, ROW_LOCK_TX);
    return this.decorate(doctorId, moved);
  }

  // ⚕️ Reception's marks. Today's queue only: a later day's patient has not
  // arrived, and a day that has passed keeps what it holds. Each field changes
  // only itself; `present` records the SERVER's time once (pressed again it keeps
  // the first time) and clears it when taken off.
  async setPresence(doctorId: string, id: string, dto: SetOpdPresenceDto): Promise<OpdVisit> {
    const visit = await this.prisma.opdVisit.findFirst({ where: { id, doctorId } });
    if (!visit) throw new NotFoundException('Visit not found');
    if (this.visitDay(visit) !== dhakaDayKey()) throw new BadRequestException(PRESENCE_TODAY_ONLY);
    const data: Prisma.OpdVisitUpdateInput = {};
    if (dto.present === true && !visit.presentAt) data.presentAt = new Date();
    if (dto.present === false) data.presentAt = null;
    if (dto.criticallyIll !== undefined) data.criticallyIll = dto.criticallyIll;
    if (dto.urgent !== undefined) data.urgent = dto.urgent;
    return this.prisma.opdVisit.update({ where: { id }, data });
  }

  // A day's schedule: its own if it has one, else the latest earlier day's, else
  // the pre-set values — with `saved` saying which.
  async getSchedule(doctorId: string, day: string = dhakaDayKey()): Promise<OpdScheduleAnswer> {
    this.requireDay(day);
    const own = await this.prisma.opdDaySetting.findUnique({ where: { doctorId_day: { doctorId, day } } });
    const row = own ?? (await this.inheritedSchedule(this.prisma, doctorId, day));
    const s: OpdSchedule = row
      ? { startTime: row.startTime, breakStart: row.breakStart, breakEnd: row.breakEnd, minutesPerPatient: row.minutesPerPatient }
      : DEFAULT_OPD_SCHEDULE;
    return { day, ...s, saved: own !== null };
  }

  // ⚕️ Today and later days only: the times of a day that has passed are what
  // was told to its patients.
  async saveSchedule(doctorId: string, dto: SaveOpdScheduleDto): Promise<OpdScheduleAnswer> {
    this.requireDay(dto.date);
    if (dto.date < dhakaDayKey()) throw new BadRequestException(PAST_DAY);
    const schedule: OpdSchedule = {
      startTime: dto.startTime,
      breakStart: dto.breakStart ?? null,
      breakEnd: dto.breakEnd ?? null,
      minutesPerPatient: dto.minutesPerPatient,
    };
    const problem = scheduleProblem(schedule);
    if (problem) throw new BadRequestException(problem);

    await this.prisma.opdDaySetting.upsert({
      where: { doctorId_day: { doctorId, day: dto.date } },
      create: { doctorId, day: dto.date, ...schedule },
      update: schedule,
    });
    return { day: dto.date, ...schedule, saved: true };
  }

  // Upsert today's queue entry for a patient and set its prescription status
  // (incomplete | complete). Reuses an existing same-day visit for the patient
  // so a queued or already-flagged patient isn't duplicated.
  async setRxStatusByPatient(doctorId: string, dto: SetRxStatusDto): Promise<OpdVisit> {
    // ⚕️ TODAY's queue — a patient booked for a later day is not the one being
    // prescribed for now, and must not be marked printed.
    const today = dhakaDayKey();
    return this.prisma.$transaction(async (tx) => {
      await this.lockQueue(tx, doctorId);
      const existing = await tx.opdVisit.findFirst({
        where: { AND: [this.dayWhere(doctorId, today), { patientId: dto.patientId }] },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return tx.opdVisit.update({
          where: { id: existing.id },
          data: { rxStatus: dto.rxStatus },
        });
      }
      return this.append(tx, doctorId, today, {
        patientId: dto.patientId,
        name: dto.name ?? 'Patient',
        phone: dto.phone ?? null,
        age: dto.age ?? null,
        gender: dto.gender ?? null,
        type: 'Rx',
        rxStatus: dto.rxStatus,
      });
    }, ROW_LOCK_TX);
  }
}
