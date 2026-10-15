import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogueRow, catalogueRowsByBrandWord } from '../medicines/catalogue';
import {
  ALGO_VERSION,
  HabitLine,
  blockKey,
  fmtMedicine,
  normaliseDrugKey,
  searchKeyOf,
  signatureOf,
  splitForm,
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

/**
 * One medicine of the "Add Bulk Medicine" list, with the instruction the
 * typing dropdown would offer first for it (pinned, then most patients, then
 * most recent). The one case where the two differ: a first row that cannot be
 * read — the dropdown offers the next, the list leaves the medicine out and
 * counts it.
 */
/** One instruction the doctor has written for a medicine (the bulk box's ▼). */
export interface HabitChoice {
  id: string;
  dose: string;
  food: string;
  duration: string;
  contLines: HabitLine[];
  patientCount: number;
  lastUsedAt: Date;
}

export interface HabitMedicine {
  id: string;
  drugKey: string;
  drugLabel: string;
  /** ⚕️ Safety field — see `HabitGroup.generic`. */
  generic?: string;
  dose: string;
  food: string;
  duration: string;
  contLines: HabitLine[];
  patientCount: number;
  lastUsedAt: Date;
  /**
   * The doctor's LAST instructions for this medicine, newest first, at most
   * `MAX_RECENT`, hidden ones never (physician's sheet, 15/10/2026, item 2:
   * "down arrow dia last use 3ta option select kora jabe"). The medicine's own
   * row above is still the usual, chosen as before.
   */
  recent: HabitChoice[];
}

export interface HabitMedicineList {
  medicines: HabitMedicine[];
  /** The doctor has more medicines than the cap; the most used are returned. */
  truncated: boolean;
  /**
   * Medicines left out because their row could not be read. The box says the
   * number: a medicine that is silently not there reads as one never
   * prescribed.
   */
  unreadable: number;
}

const MAX_PER_MEDICINE = 3; // 5.docx: "1ta osudh er max 3tar beshi suggestion thakbe na"
const MAX_MEDICINES = 4; // eng review: ≤12 rows above a 10-row medicine list
const MAX_HIDDEN_PER_MEDICINE = 20; // bounded payload; hiddenCount is the true number
const MIN_QUERY = 2; // mirrors useMedicineSearch
const MAX_ALL_MEDICINES = 2000; // the bulk list; `truncated` says when it bit
const MAX_RECENT = 3; // physician's sheet, 15/10/2026: "last use 3ta option"

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
 * What a medicine is asked for by in the catalogue: the first word of its
 * brand ("Tablet. Barcavir 0.5 mg" → "barcavir"). Only a way to fetch
 * candidates — the real test is the whole normalised key — so a brand of
 * several words still matches. Null for a label with no brand word.
 *
 * Taken from the label AS WRITTEN, after its dosage form — not from the
 * normalised key, which closes the gap between a number and its unit: the key
 * of `3 G Cef` begins `3g`, and no brand in the catalogue begins with that
 * word.
 */
function brandWord(drugLabel: string): string | null {
  const written = (drugLabel ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return splitForm(written).rest.split(' ').filter(Boolean)[0] ?? null;
}

// Two spellings of one generic — a capital, a space — are one generic.
const sameGeneric = (a: string, b: string): boolean =>
  a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

/** Raw row shape returned by the whole-list query. */
interface AllRow {
  id: string;
  drugKey: string;
  drugLabel: string;
  dose: string;
  food: string;
  duration: string;
  contLines: unknown;
  patientCount: number;
  lastUsedAt: Date;
}

/** One of a medicine's latest instructions (`listAll`'s second question). */
type RecentRow = Omit<AllRow, 'drugLabel'>;

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
  // Medicines already reported as listed under two generics: the box asks on
  // every opening, and the same line is not written to the log every time.
  private readonly reportedTwoGenerics = new Set<string>();

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
    // ⚕️ Silent HERE, and only here. Without a generic the suggestion behaves
    // like a hand-typed brand, and the ℞ pad has a second, partial source for
    // it: the medicine results loaded for what was typed (`resolveGeneric` on
    // the client — at most the ten rows of that search). The lookup must never
    // cost the doctor the suggestion.
    try {
      await this.attachGenerics(out);
    } catch (e) {
      this.log.warn(`generic lookup failed for ${out.length} medicines: ${String(e)}`);
    }
    return out;
  }

  /**
   * Every medicine this doctor has a visible habit for, one row each: the
   * "Add Bulk Medicine" box (P1 — scoped to ONE doctor).
   *
   * The row chosen for a medicine is the typing dropdown's first suggestion
   * for it: pinned, then most DISTINCT PATIENTS, then most recent. Hidden rows
   * are left out BEFORE that choice, so a dose the doctor hid never hides the
   * next one — and a medicine whose doses are all hidden is not listed.
   *
   * ⚠️ UNLIKE `list()`, THIS THROWS — when the habits cannot be read, and also
   * when the catalogue cannot be asked for their generics (see
   * `attachGenerics`). The dropdown is silent on failure by design: it sits
   * under a working medicine search. This is a box the doctor opened on
   * purpose, and "your medicines could not be loaded" must not look like "you
   * have prescribed nothing".
   *
   * A medicine whose chosen row cannot be read is left out and COUNTED
   * (`unreadable`). The dropdown would offer that medicine's next instruction
   * instead; here one row stands for the medicine, so it is not listed — and
   * the box says how many are not.
   */
  async listAll(doctorId: string): Promise<HabitMedicineList> {
    const rows = await this.prisma.$queryRaw<AllRow[]>`
      WITH ranked AS (
        SELECT h.*, ROW_NUMBER() OVER (
          PARTITION BY h."drugKey"
          ORDER BY h."pinned" DESC, h."patientCount" DESC, h."lastUsedAt" DESC, h."id" ASC
        ) AS rn
        FROM "DoctorRxHabit" h
        WHERE h."doctorId" = ${doctorId} AND h."hidden" = false
      )
      SELECT "id", "drugKey", "drugLabel", "dose", "food", "duration", "contLines",
             "patientCount", "lastUsedAt"
      FROM ranked
      WHERE rn = 1
      ORDER BY "patientCount" DESC, "lastUsedAt" DESC, "drugKey" ASC
      LIMIT ${MAX_ALL_MEDICINES + 1}
    `;

    const medicines: HabitMedicine[] = [];
    let unreadable = 0;
    for (const r of rows.slice(0, MAX_ALL_MEDICINES)) {
      // Dropped WHOLE, as in the dropdown: half a taper is worse than none.
      const contLines = sanitiseContLines(r.contLines);
      if (contLines === null) {
        this.log.warn(`habit ${r.id} has unreadable contLines — left out of the bulk list`);
        unreadable++;
        continue;
      }
      medicines.push({
        id: r.id,
        drugKey: r.drugKey,
        drugLabel: r.drugLabel,
        dose: r.dose,
        food: r.food,
        duration: r.duration,
        contLines,
        patientCount: Number(r.patientCount),
        lastUsedAt: r.lastUsedAt,
        recent: [],
      });
    }
    await this.attachRecent(doctorId, medicines);
    // ⚕️ NOT caught, unlike in `list()`: the box has no second source for a
    // generic. Offered without the one the catalogue holds for it, a medicine
    // goes onto the pad with its contraindication warning switched off —
    // several lines at once, and nothing on screen to say so. The box says
    // "could not be loaded" instead, and Try again asks the catalogue again.
    await this.attachGenerics(medicines);
    return { medicines, truncated: rows.length > MAX_ALL_MEDICINES, unreadable };
  }

  /**
   * Each listed medicine's last `MAX_RECENT` instructions, newest first — the
   * ▼ of the bulk box. The same doctor's rows and the same `hidden = false` as
   * the list itself, so a dose the doctor hid is never offered here either.
   * An instruction whose taper cannot be read is left out of the choices
   * (half a schedule is worse than none); the medicine stays listed. Throws,
   * like `listAll`: the box says the list could not be loaded.
   */
  private async attachRecent(doctorId: string, medicines: HabitMedicine[]): Promise<void> {
    if (!medicines.length) return;
    const rows = await this.prisma.$queryRaw<RecentRow[]>`
      SELECT "id", "drugKey", "dose", "food", "duration", "contLines", "patientCount", "lastUsedAt"
      FROM (
        SELECT h."id", h."drugKey", h."dose", h."food", h."duration", h."contLines", h."patientCount", h."lastUsedAt",
               ROW_NUMBER() OVER (PARTITION BY h."drugKey" ORDER BY h."lastUsedAt" DESC, h."id" ASC) AS rr
        FROM "DoctorRxHabit" h
        WHERE h."doctorId" = ${doctorId} AND h."hidden" = false
      ) latest
      WHERE rr <= ${MAX_RECENT}
      ORDER BY "drugKey" ASC, rr ASC
    `;
    const byKey = new Map(medicines.map((m) => [m.drugKey, m] as const));
    for (const r of rows ?? []) {
      const m = byKey.get(r.drugKey);
      if (!m) continue; // a medicine past the list's cap
      const contLines = sanitiseContLines(r.contLines);
      if (contLines === null) {
        this.log.warn(`habit ${r.id} has unreadable contLines — left out of the bulk list's choices`);
        continue;
      }
      m.recent.push({
        id: r.id,
        dose: r.dose,
        food: r.food,
        duration: r.duration,
        contLines,
        patientCount: Number(r.patientCount),
        lastUsedAt: r.lastUsedAt,
      });
    }
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
   * ⚠️ ASKED BY EACH MEDICINE'S OWN BRAND, NOT BY WHAT THE DOCTOR TYPED. An
   * earlier version used the typed query as a prefix, and lost the generic in
   * two ordinary cases, both verified against production on 2026-08-17:
   *   · a full label — `Tablet. Barcavir 0.5 mg` normalises to the search key
   *     `barcavir 0.5mg`, and `brandName ILIKE 'barcavir 0.5mg%'` matches no
   *     brand at all (the brand is "Barcavir"). This is not an edge case: the
   *     field holds the full label the moment a medicine has been picked;
   *   · a 2-character prefix — `na%` matches thousands of medicines, and the
   *     one that mattered fell outside the row cap.
   * Both failures were silent and both cost a contraindication warning.
   *
   * The catalogue is asked ONCE, for the rows whose brand begins with one of
   * these medicines' brand words (`catalogueRows`), and the match is made in JS
   * on the SAME normalised key that grouped the habits — never on the raw
   * label, which differs on a space ("0.5 mg"), a case, or a dropped "n/a".
   *
   * THROWS when the catalogue cannot be asked, and attaches nothing then. What
   * a failure means is the caller's to say: `list()` catches it, `listAll()`
   * does not.
   *
   * ⚠️ WHERE THE CATALOGUE LISTS ONE MEDICINE UNDER TWO GENERICS (the same
   * form, brand and strength), the first is used, as it always was — the first
   * in a STATED order now (brand, form, strength, then generic), where it was
   * whichever row the database returned first, so the same medicine gets the
   * same generic on every request — and the log names the medicine and the
   * generics, once. Whether to attach neither is not decided here: it changes
   * which warnings fire in the dropdown too, and needs a look at the real
   * catalogue first (FUNCTIONAL-AUDIT.md).
   */
  private async attachGenerics(
    targets: { drugKey: string; drugLabel: string; generic?: string }[],
  ): Promise<void> {
    if (targets.length === 0) return;
    const words = [...new Set(targets.map((g) => brandWord(g.drugLabel)).filter((w): w is string => w !== null))];
    if (words.length === 0) return;

    const byKey = new Map<string, string>();
    // Every DIFFERENT generic met for a key that has more than one, in order.
    const twoGenerics = new Map<string, string[]>();
    for (const m of await this.catalogueRows(words)) {
      if (!m.genericName) continue;
      const k = normaliseDrugKey(fmtMedicine(m));
      if (!k) continue;
      const had = byKey.get(k);
      if (had === undefined) {
        byKey.set(k, m.genericName);
      } else if (!sameGeneric(had, m.genericName)) {
        const met = twoGenerics.get(k) ?? [had];
        if (!met.some((g) => sameGeneric(g, m.genericName as string))) met.push(m.genericName);
        twoGenerics.set(k, met);
      }
    }

    for (const g of targets) {
      const generic = byKey.get(g.drugKey);
      if (!generic) continue;
      g.generic = generic;
      const met = twoGenerics.get(g.drugKey);
      if (met && !this.reportedTwoGenerics.has(g.drugKey)) {
        this.reportedTwoGenerics.add(g.drugKey);
        // Names the medicine and the generics: catalogue data, no patient and
        // no doctor — what the operator needs to settle which is right.
        this.log.warn(
          `the catalogue lists "${g.drugKey}" under more than one generic (${met.join(' | ')}) — the first is used`,
        );
      }
    }
  }

  /**
   * Every catalogue row whose brand begins with one of these words — in ONE
   * pass over the table, by an EQUALITY on the brand's first word. The query
   * and why it is asked that way are in `medicines/catalogue.ts`, shared with
   * the prices of the "Total monthly approximate cost" box: one question of the
   * catalogue, not two written alike.
   */
  private catalogueRows(words: string[]): Promise<CatalogueRow[]> {
    return catalogueRowsByBrandWord(this.prisma, words);
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
