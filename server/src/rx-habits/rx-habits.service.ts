import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALGO_VERSION,
  HabitLine,
  blockKey,
  fmtMedicine,
  normaliseDrugKey,
  searchKeyOf,
  signatureOf,
} from './normalise';

// ⚕️ SAFETY RULES FOR THIS WHOLE FILE (design §8, non-negotiable):
//  1. Nothing here ever writes to Prescription / PrescriptionItem.
//  2. The instruction is echoed VERBATIM — dose, food, duration and every
//     continuation line are stored and replayed exactly as the doctor saved
//     them. Nothing is rephrased, merged across visits, or generated.
//  3. Two different strengths are never folded (see normalise.ts).
//  4. A doctor never sees another doctor's habits — every query below is
//     scoped by doctorId, which callers take from @WorkstationDoctorId().
//  5. Silence toward the doctor, noise toward the operator: a missing table or
//     a failed write is logged on the server and is invisible in the app.

/** One item row as it comes off a Prescription (or the create DTO). */
export interface RxItemLike {
  drug: string;
  dose: string;
  duration: string;
  instruction: string;
  order?: number | null;
  isNote?: boolean | null;
  /** Tapering continuation of the line above. `null`/absent on anything saved
   *  before 2026-08-17 — see `blocksFrom`. */
  isCont?: boolean | null;
}

/** One learnable instruction block: a head medicine plus its `>>>` lines. */
export interface HabitBlock {
  drugKey: string;
  searchKey: string;
  drugLabel: string;
  signature: string;
  dose: string;
  food: string;
  duration: string;
  contLines: HabitLine[];
}

export interface HabitItem {
  id: string;
  drugLabel: string;
  dose: string;
  food: string;
  duration: string;
  contLines: HabitLine[];
  patientCount: number;
  lastUsedAt: Date;
  pinned: boolean;
}

/**
 * One medicine's suggestions. The response is grouped rather than flat because
 * the product owner's rule is per-medicine ("max 3tar beshi suggestion thakbe
 * na"), and because a medicine whose habits are ALL hidden still has to offer a
 * way back — a flat list of visible rows cannot express that group at all.
 */
export interface HabitGroup {
  drugKey: string;
  drugLabel: string;
  /**
   * The medicine's GENERIC name, recovered from the `medicines` catalogue.
   *
   * ⚕️ THIS IS A SAFETY FIELD, NOT A LABEL. Prescribing-alert rules are written
   * against generics (`entecavir`), while a ℞ line carries the brand
   * ("Tablet. Barcavir 0.5 mg"); `RxItem.generic` is the only bridge, and a
   * habit learned from history cannot carry one of its own. Resolved here, on
   * the same response as the suggestion, so it CANNOT be lost to a slow or
   * failed medicines request on the client — a doctor clicking the fast path
   * must not quietly lose a contraindication warning.
   *
   * Absent when the medicine is not in the catalogue, which is exactly the
   * already-documented state of a hand-typed brand. Never guessed.
   */
  generic?: string;
  items: HabitItem[];
  /** Hidden rows for this medicine, so `N hidden — show` can restore them. */
  hidden: HabitItem[];
  hiddenCount: number;
}

const MAX_PER_MEDICINE = 3; // 5.docx: "1ta osudh er max 3tar beshi suggestion thakbe na"
const MAX_MEDICINES = 4; // eng review: ≤12 rows above a 10-row medicine list
const MAX_HIDDEN_PER_MEDICINE = 20; // bounded payload; hiddenCount is the true number
const MIN_QUERY = 2; // mirrors useMedicineSearch

/** Raw row shape returned by the windowed lookup. */
interface LookupRow {
  id: string;
  drugKey: string;
  drugLabel: string;
  dose: string;
  food: string;
  duration: string;
  contLines: unknown;
  patientCount: number;
  lastUsedAt: Date;
  pinned: boolean;
  hidden: boolean;
  hiddenCount: number;
}

/**
 * `contLines` comes out of a Json column, so it is UNKNOWN at this boundary —
 * a hand-edited row, an older shape, or a null are all possible.
 *
 * Returns null when the value cannot be read, and the caller drops the block
 * WHOLE. Half a tapering schedule delivered as if it were the whole instruction
 * is worse than no suggestion at all.
 */
export function sanitiseContLines(value: unknown): HabitLine[] | null {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const out: HabitLine[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const e = entry as Record<string, unknown>;
    const { dose, food, duration } = e;
    if (typeof dose !== 'string' || typeof food !== 'string' || typeof duration !== 'string') {
      return null;
    }
    out.push({ dose, food, duration });
  }
  return out;
}

/**
 * Walk a prescription's items in `order` and assemble learnable blocks.
 *
 *   isNote === true       → a free-typed note: skipped, and it TERMINATES the
 *                           block above it
 *   isCont === true       → a CONTINUATION (`>>>`) of the block above
 *   drug.trim() === ''    → a CONTINUATION (legacy rows and templates)
 *   otherwise             → the HEAD of a new block
 *
 * ⚠️ `isCont` IS CHECKED FIRST, AND THE BLANK-DRUG TEST IS NOT ENOUGH ON ITS
 * OWN. `savePrescription` fills the medicine's name back into every
 * continuation so the printed sheet is self-contained, so a stored taper has a
 * FILLED drug and only `isCont` distinguishes it. Rows written before
 * 2026-08-17 carry no flag at all and fall through to the blank-drug rule —
 * which on those rows means each line becomes its own habit. That is the
 * honest outcome: the record does not say they were one instruction, and
 * inventing a tapering schedule nobody prescribed would be worse.
 *
 * A continuation that arrives before any head is malformed data — it is
 * discarded, never guessed at.
 *
 * AN EMPTY BLOCK IS NOT A HABIT. A head whose dose, food and duration are all
 * blank and which carries no continuation line is an UNFINISHED line, not a
 * prescribing habit. Found in production: `Capsule. Tycil 500 mg` had been
 * saved blank twice while its real `1+1+1 · 7 days` was saved once — without
 * this rule the blank block would rank #1, a suggestion that fills nothing
 * sitting above the instruction the doctor actually wanted.
 *
 * A block with SOME fields blank is kept: it is what the record says, and
 * merging it with a fuller block would be guessing at intent.
 */
export function blocksFrom(items: RxItemLike[]): HabitBlock[] {
  const ordered = [...(items ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );

  interface Draft {
    drugLabel: string;
    head: HabitLine;
    contLines: HabitLine[];
  }
  const drafts: Draft[] = [];
  let open: Draft | null = null;

  for (const it of ordered) {
    if (!it) continue;
    const drug = (it.drug ?? '').trim();
    if (it.isNote) {
      open = null; // a note ends the block above it
      continue;
    }
    const line: HabitLine = {
      dose: it.dose ?? '',
      food: it.instruction ?? '',
      duration: it.duration ?? '',
    };
    const isContinuation = it.isCont === true || !drug;
    if (!isContinuation) {
      open = { drugLabel: drug, head: line, contLines: [] };
      drafts.push(open);
    } else if (open) {
      open.contLines.push(line);
    }
    // else: a continuation before any head — malformed, discarded.
  }

  const out: HabitBlock[] = [];
  const seen = new Set<string>();
  for (const d of drafts) {
    const filled = (l: HabitLine) =>
      Boolean(l.dose.trim() || l.food.trim() || l.duration.trim());
    if (!filled(d.head) && d.contLines.length === 0) continue; // empty block
    const drugKey = normaliseDrugKey(d.drugLabel);
    if (!drugKey) continue;
    const signature = signatureOf(d.head, d.contLines);
    // One prescription is ONE contribution: the same block written twice on the
    // same sheet must not count twice or collide in the upsert transaction.
    const dedupe = blockKey(drugKey, signature);
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      drugKey,
      searchKey: searchKeyOf(d.drugLabel),
      drugLabel: d.drugLabel,
      signature,
      dose: d.head.dose,
      food: d.head.food,
      duration: d.head.duration,
      contLines: d.contLines,
    });
  }
  return out;
}

// Escape the LIKE metacharacters so a doctor typing "%" does not match every
// medicine they have ever prescribed.
const likePrefix = (s: string): string =>
  `${s.replace(/([\\%_])/g, '\\$1')}%`;

@Injectable()
export class RxHabitsService implements OnModuleInit {
  private readonly log = new Logger(RxHabitsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Design §8 rule 8 — "silence toward the doctor, noise toward the operator".
   * An empty result, a failed query and a missing table all look identical on
   * screen (correct for the doctor, a trap for everyone else), so the one place
   * a missing table can be announced is the log at boot.
   *
   * This NEVER throws: a missing convenience table must not take the API down.
   * This repo has already shipped two committed-but-unapplied manual migrations
   * (FUNCTIONAL-AUDIT.md), and the deploy workflow does not run migrations.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1 FROM "DoctorRxHabit" LIMIT 1`;
    } catch (e) {
      this.log.error(
        'DoctorRxHabit is unreadable — prescribing habit suggestions are DEAD ' +
          '(the ℞ pad still works, silently). Apply ' +
          'server/prisma/manual-rx-habits.sql through the tunnel, then run ' +
          `server/scripts/rebuild-rx-habits.js. Cause: ${String(e)}`,
      );
    }
  }

  // ── Write path ────────────────────────────────────────────────────────────

  /**
   * Learn from a prescription that has ALREADY been committed.
   *
   * Called from `PrescriptionsService.create` after `prescription.create`
   * returns, inside a try/catch — never inside the prescription's transaction,
   * because a habit-write failure must never roll back a prescription the
   * doctor believes was saved and has already printed.
   *
   * `patientCount` counts DISTINCT PATIENTS, not prescriptions. A blind
   * `increment: 1` would let one long-term patient returning monthly, a visit
   * re-saved to fix a typo, or a reprint make a one-off dose look like routine
   * practice — which defeats the only safety mechanism this feature has (D3).
   * The set of patients is never copied into the habit table; only the number
   * is stored, and it is established by asking the record.
   */
  async recordFrom(
    doctorId: string,
    patientId: string,
    prescriptionId: string,
    items: RxItemLike[],
  ): Promise<void> {
    const blocks = blocksFrom(items);
    if (blocks.length === 0) return;

    // Which of these blocks has this patient already contributed, on an EARLIER
    // prescription? One query, then a set lookup per block.
    const priorKeys = await this.priorBlockKeys(doctorId, patientId, prescriptionId);
    const now = new Date();

    await this.prisma.$transaction(
      blocks.map((b) => {
        const isNewPatientForBlock = !priorKeys.has(blockKey(b.drugKey, b.signature));
        return this.prisma.doctorRxHabit.upsert({
          where: {
            doctorId_drugKey_signature: {
              doctorId,
              drugKey: b.drugKey,
              signature: b.signature,
            },
          },
          create: {
            doctorId,
            drugKey: b.drugKey,
            searchKey: b.searchKey,
            drugLabel: b.drugLabel,
            signature: b.signature,
            algoVersion: ALGO_VERSION,
            dose: b.dose,
            food: b.food,
            duration: b.duration,
            contLines: b.contLines as unknown as Prisma.InputJsonValue,
            patientCount: 1,
            lastUsedAt: now,
          },
          update: {
            lastUsedAt: now,
            // Refreshed so the casing shown follows the doctor's most recent
            // spelling. This is why the "verbatim" claim in design §8 is scoped
            // to the INSTRUCTION: the label may come from a later prescription
            // than the dose did.
            drugLabel: b.drugLabel,
            ...(isNewPatientForBlock ? { patientCount: { increment: 1 } } : {}),
            // `hidden` is deliberately NOT touched — a suggestion the doctor hid
            // stays hidden even if they prescribe it again by hand. Un-hiding is
            // an explicit act with a permanent route (design §7).
          },
        });
      }),
    );
  }

  /** Every (drugKey, signature) this patient contributed BEFORE `excludeRxId`. */
  private async priorBlockKeys(
    doctorId: string,
    patientId: string,
    excludeRxId: string,
  ): Promise<Set<string>> {
    const prior = await this.prisma.prescription.findMany({
      where: { doctorId, patientId, id: { not: excludeRxId } },
      select: {
        items: {
          orderBy: { order: 'asc' },
          select: { drug: true, dose: true, duration: true, instruction: true, isNote: true, isCont: true, order: true },
        },
      },
    });
    const keys = new Set<string>();
    for (const rx of prior) {
      for (const b of blocksFrom(rx.items)) keys.add(blockKey(b.drugKey, b.signature));
    }
    return keys;
  }

  // ── Read path ─────────────────────────────────────────────────────────────

  /**
   * The dropdown lookup, scoped to ONE doctor (P1).
   *
   * Matches on `searchKey` only — the query goes through the same
   * normalisation as the stored key, so `tab napa`, `Tablet. Napa` and `napa`
   * all become `napa` and hit one index. An `OR` across `drugKey` as well would
   * span two columns, only one of which is indexed, for no gain.
   *
   * Caps: top 3 rows PER MEDICINE (never a global LIMIT — that would let one
   * heavily-used medicine crowd another out entirely), and at most 4 medicines.
   * A medicine either appears with all of its suggestions or not at all.
   *
   * Returns [] rather than throwing on any failure: on a clinical screen "no
   * suggestions" and "the lookup failed" must not look alike, and the safe
   * rendering of both is silence plus a working dropdown.
   */
  async list(doctorId: string, q: string): Promise<HabitGroup[]> {
    const key = searchKeyOf(q ?? '');
    if (key.length < MIN_QUERY) return [];

    let rows: LookupRow[];
    try {
      rows = await this.prisma.$queryRaw<LookupRow[]>`
        WITH matched AS (
          SELECT * FROM "DoctorRxHabit"
          WHERE "doctorId" = ${doctorId} AND "searchKey" LIKE ${likePrefix(key)}
        ),
        ranked AS (
          SELECT m.*, ROW_NUMBER() OVER (
            PARTITION BY m."drugKey", m."hidden"
            -- id ASC last so the order is TOTAL: two equally-used rows must not
            -- swap places between keystrokes.
            ORDER BY m."pinned" DESC, m."patientCount" DESC, m."lastUsedAt" DESC, m."id" ASC
          ) AS rn
          FROM matched m
        ),
        kept AS (
          SELECT * FROM ranked
          WHERE ("hidden" = false AND rn <= ${MAX_PER_MEDICINE})
             OR ("hidden" = true  AND rn <= ${MAX_HIDDEN_PER_MEDICINE})
        ),
        lead AS (
          SELECT "drugKey", "patientCount" AS "gCount", "lastUsedAt" AS "gLast"
          FROM ranked WHERE "hidden" = false AND rn = 1
        ),
        counts AS (
          SELECT "drugKey", COUNT(*)::int AS "hiddenCount"
          FROM matched WHERE "hidden" = true GROUP BY "drugKey"
        ),
        grp AS (
          SELECT k."drugKey",
                 (l."drugKey" IS NOT NULL) AS "hasVisible",
                 l."gCount", l."gLast",
                 COALESCE(c."hiddenCount", 0) AS "hiddenCount"
          FROM (SELECT DISTINCT "drugKey" FROM matched) k
          LEFT JOIN lead l   ON l."drugKey" = k."drugKey"
          LEFT JOIN counts c ON c."drugKey" = k."drugKey"
        ),
        picked AS (
          SELECT * FROM grp
          ORDER BY "hasVisible" DESC, "gCount" DESC NULLS LAST,
                   "gLast" DESC NULLS LAST, "drugKey" ASC
          LIMIT ${MAX_MEDICINES}
        )
        SELECT k."id", k."drugKey", k."drugLabel", k."dose", k."food", k."duration",
               k."contLines", k."patientCount", k."lastUsedAt", k."pinned", k."hidden",
               p."hiddenCount"
        FROM kept k
        JOIN picked p ON p."drugKey" = k."drugKey"
        ORDER BY p."hasVisible" DESC, p."gCount" DESC NULLS LAST,
                 p."gLast" DESC NULLS LAST, k."drugKey" ASC,
                 k."pinned" DESC, k."patientCount" DESC, k."lastUsedAt" DESC, k."id" ASC
      `;
    } catch (e) {
      this.log.warn(`habit lookup failed for doctor ${doctorId}: ${String(e)}`);
      return [];
    }

    const groups = new Map<string, HabitGroup>();
    for (const r of rows) {
      // A block whose contLines cannot be read is dropped WHOLE — never
      // partially. Half a taper is worse than no suggestion.
      const contLines = sanitiseContLines(r.contLines);
      if (contLines === null) {
        this.log.warn(`habit ${r.id} has unreadable contLines — dropped from the response`);
        continue;
      }
      let g = groups.get(r.drugKey);
      if (!g) {
        g = {
          drugKey: r.drugKey,
          drugLabel: r.drugLabel,
          items: [],
          hidden: [],
          hiddenCount: Number(r.hiddenCount ?? 0),
        };
        groups.set(r.drugKey, g);
      }
      const item: HabitItem = {
        id: r.id,
        drugLabel: r.drugLabel,
        dose: r.dose,
        food: r.food,
        duration: r.duration,
        contLines,
        patientCount: r.patientCount,
        lastUsedAt: r.lastUsedAt,
        pinned: r.pinned,
      };
      if (r.hidden) g.hidden.push(item);
      else g.items.push(item);
    }
    // A group left with nothing to show and nothing to restore is not a group.
    const out = [...groups.values()].filter((g) => g.items.length > 0 || g.hiddenCount > 0);
    await this.attachGenerics(out);
    return out;
  }

  /**
   * Recover each medicine's generic name from the `medicines` catalogue.
   *
   * ⚕️ WHY THIS RUNS ON THE SERVER. An earlier design resolved the generic on
   * the client, from the medicine results already loaded for the same query —
   * cheaper, but it makes a SAFETY field depend on a race between two
   * independent requests. On a flaky connection the habit response can arrive
   * while the medicines one is still in flight (or has failed), and a doctor
   * clicking the suggestion in that window gets a ℞ line with no generic — so
   * a rule written against the generic, such as the entecavir
   * contraindication behind the brand "Barcavir", silently does not fire.
   * The suggestion and the generic now travel together and cannot separate.
   *
   * ⚠️ SEARCHED BY EACH GROUP'S OWN BRAND TOKEN, NOT BY WHAT THE DOCTOR TYPED.
   * An earlier version used the typed query as the prefix, and lost the generic
   * in two ordinary cases, both verified against production on 2026-08-17:
   *   · a full label — `Tablet. Barcavir 0.5 mg` normalises to the search key
   *     `barcavir 0.5mg`, and `brandName ILIKE 'barcavir 0.5mg%'` matches no
   *     brand at all (the brand is "Barcavir"). This is not an edge case: the
   *     field holds the full label the moment a medicine has been picked;
   *   · a 2-character prefix — `na%` matches thousands of medicines, and the
   *     one that mattered fell outside the row cap.
   * Both failures were silent and both cost a contraindication warning.
   *
   * Now: at most 4 brand tokens, one bounded `ANY` query, and the match is made
   * in JS on the SAME normalised key that grouped the habits — never on the raw
   * label, which differs on a space ("0.5 mg"), a case, or a dropped "n/a".
   *
   * Never allowed to fail the lookup: without a generic the line behaves
   * exactly like a hand-typed brand, which is the already-documented state.
   */
  private async attachGenerics(groups: HabitGroup[]): Promise<void> {
    if (groups.length === 0) return;
    // The brand is the leading token of the search key ("barcavir 0.5mg" →
    // "barcavir"). Multi-word brands still match: this is only the prefix used
    // to fetch candidates, and the real test is the normalised key below.
    const prefixes = [
      ...new Set(
        groups
          .map((g) => searchKeyOf(g.drugLabel).split(' ')[0])
          .filter((t) => t.length >= 2)
          .map((t) => likePrefix(t)),
      ),
    ];
    if (prefixes.length === 0) return;
    try {
      // `medicines` is a raw table, not a Prisma model (see server/CLAUDE.md).
      // Bound parameter, so the doctor's own text can never reach the SQL.
      const rows = await this.prisma.$queryRawUnsafe<
        { brandName: string; genericName: string | null; dosageForm: string | null; strength: string | null }[]
      >(
        `SELECT "brandName", "genericName", "dosageForm", strength
         FROM medicines
         WHERE "brandName" ILIKE ANY($1::text[])
         LIMIT 500`,
        prefixes,
      );
      const byKey = new Map<string, string>();
      for (const m of rows) {
        if (!m.genericName) continue;
        const k = normaliseDrugKey(fmtMedicine(m));
        if (k && !byKey.has(k)) byKey.set(k, m.genericName);
      }
      for (const g of groups) {
        const generic = byKey.get(g.drugKey);
        if (generic) g.generic = generic;
      }
    } catch (e) {
      this.log.warn(`generic lookup failed for ${prefixes.join(', ')}: ${String(e)}`);
    }
  }

  // ── Hide / unhide ─────────────────────────────────────────────────────────

  /**
   * There is no DELETE (P4): "deleting" a suggestion sets `hidden`. The
   * prescription record is never touched, so the worst a misclick can do is
   * remove a suggestion — and `N hidden — show` always brings it back.
   */
  async setFlags(
    doctorId: string,
    actorName: string,
    id: string,
    flags: { hidden?: boolean; pinned?: boolean },
  ): Promise<HabitItem> {
    const row = await this.prisma.doctorRxHabit.findFirst({ where: { id, doctorId } });
    if (!row) throw new NotFoundException('Suggestion not found');

    const updated = await this.prisma.doctorRxHabit.update({
      where: { id },
      data: {
        ...(flags.hidden !== undefined ? { hidden: flags.hidden } : {}),
        ...(flags.pinned !== undefined ? { pinned: flags.pinned } : {}),
      },
    });

    if (flags.hidden !== undefined && flags.hidden !== row.hidden) {
      await this.logFlagChange(doctorId, actorName, updated.drugLabel, {
        dose: updated.dose,
        food: updated.food,
        duration: updated.duration,
      }, flags.hidden);
    }

    return {
      id: updated.id,
      drugLabel: updated.drugLabel,
      dose: updated.dose,
      food: updated.food,
      duration: updated.duration,
      contLines: sanitiseContLines(updated.contLines) ?? [],
      patientCount: updated.patientCount,
      lastUsedAt: updated.lastUsedAt,
      pinned: updated.pinned,
    };
  }

  /**
   * Audit trail for a doctor deliberately suppressing (or restoring) a dose
   * suggestion — support will one day need to know who suppressed what, when.
   *
   * Written straight onto `doctorId` (the workstation doctor) rather than
   * through ActivityService — here the practice is already known and is the one
   * that owns the habit row, so there is nothing to resolve. (ActivityService
   * used to re-derive the practice from what it treated as a user id, which was
   * the original reason to bypass it; that bug was removed 2026-08-27, but
   * writing directly is still the simpler path and stays.)
   * `patientId` is left null — this is not about one patient.
   *
   * Never allowed to fail the request: the flag change already succeeded, and
   * losing the audit line must not tell the doctor their click did nothing.
   */
  private async logFlagChange(
    doctorId: string,
    actorName: string,
    drugLabel: string,
    line: HabitLine,
    hidden: boolean,
  ): Promise<void> {
    const instruction = [line.dose, line.food, line.duration]
      .map((v) => v.trim())
      .filter(Boolean)
      .join(' · ');
    // ActivityLog.detail is capped at 400 chars server-side.
    const detail = `${hidden ? 'Hid' : 'Restored'} suggestion: ${drugLabel}${
      instruction ? ` — ${instruction}` : ''
    }`.slice(0, 400);
    try {
      await this.prisma.activityLog.create({
        data: {
          doctorId,
          actorName,
          section: 'Prescribing habits',
          detail,
          action: hidden ? 'saved' : 'added',
        },
      });
    } catch (e) {
      this.log.warn(`habit audit log failed for doctor ${doctorId}: ${String(e)}`);
    }
  }
}
