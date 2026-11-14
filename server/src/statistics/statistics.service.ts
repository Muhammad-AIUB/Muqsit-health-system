import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { dhakaDayKey } from '../opd/dhaka-day';
import {
  DayCount,
  DiagnosisCount,
  fillDays,
  fillMonths,
  isMonthKey,
  isYearKey,
  monthOf,
  MonthCount,
  Overall,
  overallFigures,
  previousMonth,
  rankDiagnoses,
} from './visit-stats';

// Which chamber's queue the numbers are about: every one of the practice
// (`all`, "All chamber total"), or ONE — `chamberId` null is the DEFAULT
// chamber, whose visits are stored with no chamber (`OpdVisit.chamberId`). The
// controller resolves it through `ChambersService.resolve`, the one place that
// decides a chamber; a client's value is only ever a claim.
export type ChamberScope = { kind: 'all' } | { kind: 'one'; chamberId: string | null };

const BAD_MONTH = 'Choose a month written like 2026-11.';
const BAD_YEAR = 'Choose a year written like 2026.';

// ⚕️ "Seen" is what the OPD queue calls Completed: Done pressed, OR the
// prescription saved and printed (`rxStatus = 'complete'`, which Save & print sets
// without Done). One copy of that rule on the server, beside
// `client/src/lib/opdPresence.ts#isCompleted` — the Completed card and this
// number must never disagree about who has been seen (physician, 11/11/2026).
const SEEN_SQL = Prisma.sql`("status" = 'done' OR COALESCE("rxStatus", '') = 'complete')`;

// A visit's day is `queueDate`, never `createdAt` (a patient can be booked for a
// later day). A row an older build wrote has none, and reads as the Dhaka day it
// was created: Bangladesh is a fixed UTC+6, so `+ 6 hours` is exact (the same
// reading `OpdService.dayWhere` gives it).
const DAY_SQL = Prisma.sql`COALESCE("queueDate", to_char("createdAt" + interval '6 hours', 'YYYY-MM-DD'))`;

// Settings → Statistics (physician's sheet, 11/11/2026). Read-only: it counts
// the practice's OPD queue rows and its saved prescriptions, writes nothing, and
// needs no migration. Every query is the WORKSTATION doctor's (server/CLAUDE.md,
// Rule 1) — a supervising doctor's prescriptions are stored under their own id,
// so each practice reads its own.
@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  private chamberSql(scope: ChamberScope): Prisma.Sql {
    if (scope.kind === 'all') return Prisma.empty;
    return scope.chamberId === null
      ? Prisma.sql`AND "chamberId" IS NULL`
      : Prisma.sql`AND "chamberId" = ${scope.chamberId}`;
  }

  // The practice's visits as (day, seen) rows — the base every figure reads.
  private visits(doctorId: string, scope: ChamberScope): Prisma.Sql {
    return Prisma.sql`SELECT ${DAY_SQL} AS day, ${SEEN_SQL} AS seen FROM "OpdVisit" WHERE "doctorId" = ${doctorId} ${this.chamberSql(scope)}`;
  }

  // Total serial (every queue row of the day) and seen, for each day of a month
  // — every day of the month, a day with no visit as 0 and 0.
  async visitsByDay(
    doctorId: string,
    scope: ChamberScope,
    month: string | undefined,
    now: Date = new Date(),
  ): Promise<{ month: string; days: DayCount[] }> {
    const wanted = month ?? monthOf(dhakaDayKey(now));
    if (!isMonthKey(wanted)) throw new BadRequestException(BAD_MONTH);
    const rows = await this.prisma.$queryRaw<DayCount[]>(
      Prisma.sql`SELECT day, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE seen)::int AS seen
        FROM (${this.visits(doctorId, scope)}) v
        WHERE day >= ${`${wanted}-01`} AND day <= ${`${wanted}-31`}
        GROUP BY day`,
    );
    return { month: wanted, days: fillDays(wanted, rows) };
  }

  // The same, for each month of a year.
  async visitsByMonth(
    doctorId: string,
    scope: ChamberScope,
    year: string | undefined,
    now: Date = new Date(),
  ): Promise<{ year: string; months: MonthCount[] }> {
    const wanted = year ?? dhakaDayKey(now).slice(0, 4);
    if (!isYearKey(wanted)) throw new BadRequestException(BAD_YEAR);
    const rows = await this.prisma.$queryRaw<MonthCount[]>(
      Prisma.sql`SELECT substr(day, 1, 7) AS month, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE seen)::int AS seen
        FROM (${this.visits(doctorId, scope)}) v
        WHERE day >= ${`${wanted}-01-01`} AND day <= ${`${wanted}-12-31`}
        GROUP BY substr(day, 1, 7)`,
    );
    return { year: wanted, months: fillMonths(wanted, rows) };
  }

  // Total visit, this month's and the previous month's seen visits, and the
  // calendar averages (visit-stats.ts#overallFigures).
  async overall(doctorId: string, scope: ChamberScope, now: Date = new Date()): Promise<Overall> {
    const today = dhakaDayKey(now);
    const thisStart = `${monthOf(today)}-01`;
    const prevStart = `${previousMonth(monthOf(today))}-01`;
    const [row] = await this.prisma.$queryRaw<
      { seenTotal: number; firstSeenDay: string | null; thisMonth: number; previousMonth: number }[]
    >(
      Prisma.sql`SELECT
          COUNT(*) FILTER (WHERE seen)::int AS "seenTotal",
          MIN(day) FILTER (WHERE seen) AS "firstSeenDay",
          COUNT(*) FILTER (WHERE seen AND day >= ${thisStart} AND day <= ${today})::int AS "thisMonth",
          COUNT(*) FILTER (WHERE seen AND day >= ${prevStart} AND day < ${thisStart})::int AS "previousMonth"
        FROM (${this.visits(doctorId, scope)}) v`,
    );
    return overallFigures(
      {
        seenTotal: row?.seenTotal ?? 0,
        firstSeenDay: row?.firstSeenDay ?? null,
        thisMonth: row?.thisMonth ?? 0,
        previousMonth: row?.previousMonth ?? 0,
      },
      today,
    );
  }

  // Every final diagnosis written on this practice's prescriptions, with the
  // number of different patients who have it. A prescription is not tied to a
  // chamber, so this is the whole practice's. (`GROUP BY` keeps one row per
  // patient and written line, with its newest date, so a doctor's years of
  // repeat visits do not travel one by one.)
  async diseases(doctorId: string): Promise<{ diagnoses: DiagnosisCount[] }> {
    const rows = await this.prisma.$queryRaw<{ patientId: string; name: string; createdAt: Date }[]>(
      Prisma.sql`SELECT p."patientId" AS "patientId", d AS name, MAX(p."createdAt") AS "createdAt"
        FROM "Prescription" p, unnest(p."finalDiagnosis") AS d
        WHERE p."doctorId" = ${doctorId}
        GROUP BY p."patientId", d`,
    );
    return { diagnoses: rankDiagnoses(rows) };
  }
}
