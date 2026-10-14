// ⚕️ "Total monthly approximate cost" (the box on the prescription header),
// priced from the medicine chart — the `medicines` table the medicine list is
// picked from (physician's decision, 2026-10-14: "take from medicine chart —
// but remember like Sergel 20 and Sergel 40 mg is not same"). It replaced an
// 18-item list kept in the app, which no medicine picked from the chart was on.
//
// A wrong number here is one a patient plans their month by, so the rule is
// the app's rule for a number: only what is read WHOLE is used, and what is
// not priced is said, never left out of the sum quietly.
//
//  • The medicine is the chart's row by `sameMedicine` — form and strength
//    included. Zzcap 20 mg is never priced as Zzcap 40 mg. A medicine is
//    priced only where every row of the chart it matches gives the same unit
//    price (a label typed without its form matches the rows of every form of
//    that name and strength), and no pack of its brand stored with no form or
//    strength — as the import stores a brand's second pack — gives another.
//  • The price is the chart's "Unit Price: ৳ N" of a tablet, capsule or
//    suppository — one unit is what a dose of `1` gives. A bottle, a vial, a
//    tube is priced by the pack, and what one dose of it costs is not
//    something to guess: not priced. (The format was read from the source
//    workbooks the chart was imported from — each of their 15,540 rows that
//    begins "Unit Price" is read by `unitPrice` — not from the production
//    table, which was not read.)
//  • The dose is counts joined by `+` (`1+0+1`, `1/2+0+1/2`); the duration is
//    days, weeks or months (in English or Bangla), or Continue; and the food
//    cell is blank or says only when, beside a meal (`After meal`, `2 hr
//    before meal`) — a cell that may say how OFTEN (`once a week`,
//    `alternate day`) leaves the medicine not priced: 1+0+0 once a week is
//    four tablets a month, not thirty (review, before release).
//  • A month is 30 days: a shorter course is priced for its days, a longer one
//    and Continue for 30. Tapering lines are priced in order, after the line
//    above them, until the month is used up.
//
// Pure, and total: it runs in the prescription header, where an uncaught error
// takes the editor down with it.

import type { RxItem } from "@/types";
import { brandWordsOf, instructionKey, MedicineMap } from "@/lib/medicineKey";
import { fmtMedicine } from "@/lib/rxShorthand";

export const MONTH_DAYS = 30;

/** A row of the medicine chart, as `POST /medicines/by-brand` gives it. */
export interface ChartRow {
  brandName: string;
  dosageForm: string | null;
  strength: string | null;
  priceRaw: string | null;
}

/** Why a medicine on the pad was not priced. */
export type Unpriced = "not-in-chart" | "no-price" | "per-pack" | "several" | "dose" | "duration" | "instruction";

/** One medicine of the pad (with its tapering lines): its price for the month, or why it has none. */
export interface CostLine {
  label: string;
  taka?: number;
  unpriced?: Unpriced;
}

export interface MonthlyCost {
  /** The sum of the medicines that were priced. */
  total: number;
  /** Every medicine on the pad, in its order — priced or not. */
  lines: CostLine[];
}

const cell = (s: string | null | undefined): string => (s ?? "").trim();

// A number as the chart writes a price: grouped by threes with commas
// (`16,100.00`) or not at all (`12`), with or without decimals. ASCII digits
// only. Nothing else is read as one.
const AMOUNT = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
const UNIT_PRICE = /^Unit Price:\s*৳\s*(\S+?)(?:\s+\(.*\))?$/;

/** The chart's price of ONE unit (`Unit Price: ৳ 1,150.00 (2 x 7: ৳ 16,100.00)` → 1150), or null for anything else. */
export function unitPrice(priceRaw: string | null | undefined): number | null {
  const m = UNIT_PRICE.exec(cell(priceRaw));
  if (!m || !AMOUNT.test(m[1])) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// The forms whose ONE unit is what a dose of `1` gives.
const PER_UNIT_FORM = /\b(?:tablet|capsule|suppository)\b/i;

type Reading = { kind: "unit"; taka: number } | { kind: "pack" } | { kind: "none" };

function readRow(row: ChartRow): Reading {
  const taka = unitPrice(row.priceRaw);
  if (taka !== null && PER_UNIT_FORM.test(row.dosageForm ?? "")) return { kind: "unit", taka };
  return cell(row.priceRaw).includes("৳") ? { kind: "pack" } : { kind: "none" };
}

const sameReading = (a: Reading, b: Reading): boolean =>
  a.kind === b.kind && (a.kind !== "unit" || a.taka === (b as { taka: number }).taka);

function partValue(part: string): number | null {
  if (/^\d+(?:\.\d+)?$/.test(part)) return Number(part);
  if (part === "½") return 0.5;
  const frac = /^(\d+)\/(\d+)$/.exec(part);
  if (frac && Number(frac[2]) > 0) return Number(frac[1]) / Number(frac[2]);
  return null;
}

/** Units a day from a dose written as counts joined by `+` (`1+0+1` → 2), or null when any part is not a count. */
export function dosesPerDay(dose: string): number | null {
  const parts = cell(dose).split("+").map((p) => p.trim());
  if (parts.length < 2) return null;
  let sum = 0;
  for (const p of parts) {
    const v = partValue(p);
    if (v === null) return null;
    sum += v;
  }
  return sum;
}

const DURATION = /^(\d+)\s*(days?|weeks?|months?|দিন|সপ্তাহ|মাস)$/i;

/** Days from `5 days`, `2 weeks`, `1 month` (or their Bangla words); "continue" for Continue; null for anything else. */
export function durationDays(written: string): number | "continue" | null {
  const s = cell(written).replace(/\s+/g, " ");
  if (/^continue$/i.test(s)) return "continue";
  const m = DURATION.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n >= 1)) return null;
  const unit = m[2].toLowerCase();
  const per = unit.startsWith("day") || unit === "দিন" ? 1 : unit.startsWith("week") || unit === "সপ্তাহ" ? 7 : MONTH_DAYS;
  return n * per;
}

// The food cell as the pad's shorthand writes it (`parseFood`): when, beside a
// meal — and so a dose taken every day. Compared with capitals and spaces set
// aside (`instructionKey`), and nothing else.
const MEAL_TIMING = /^(?:(?:\d+(?:\.\d+)?hr )?(?:before|after) meal|\d+(?:\.\d+)?hr before or after meal|with food)$/;

/** Does this food cell say only WHEN a dose is taken beside a meal (or nothing) — never how often? */
export const saysOnlyWhen = (food: string): boolean => {
  const k = instructionKey(food);
  return k === "" || MEAL_TIMING.test(k);
};

// A medicine's lines in order, until the month is used up: units of it taken.
function unitsForMonth(lines: RxItem[]): number | "dose" | "duration" | "instruction" {
  let left = MONTH_DAYS;
  let units = 0;
  for (const line of lines) {
    if (left <= 0) break;
    const perDay = dosesPerDay(line.dose);
    if (perDay === null) return "dose";
    const days = durationDays(line.duration);
    if (days === null) return "duration";
    if (!saysOnlyWhen(line.instruction)) return "instruction";
    const used = days === "continue" ? left : Math.min(days, left);
    units += perDay * used;
    left -= used;
  }
  return units;
}

// A row with no form and no strength: how the chart's import stores a brand's
// second pack — the source leaves both blank on that row, and which medicine
// of the brand it belongs to cannot be told from the table.
const isBarePack = (r: ChartRow): boolean => cell(r.dosageForm) === "" && cell(r.strength) === "";

function priceOf(lines: RxItem[], rows: ChartRow[], bare: Map<string, number[]>): Pick<CostLine, "taka" | "unpriced"> {
  if (rows.length === 0) return { unpriced: "not-in-chart" };
  const readings = rows.map(readRow);
  if (readings.some((r) => !sameReading(r, readings[0]))) return { unpriced: "several" };
  const reading = readings[0];
  if (reading.kind === "none") return { unpriced: "no-price" };
  if (reading.kind === "pack") return { unpriced: "per-pack" };
  // A bare pack of the same brand at another unit price may be this
  // medicine's other pack (review, before release).
  for (const r of rows) {
    if ((bare.get(r.brandName.trim().toLowerCase()) ?? []).some((t) => t !== reading.taka)) return { unpriced: "several" };
  }
  const units = unitsForMonth(lines);
  if (typeof units === "string") return { unpriced: units };
  return { taka: units * reading.taka };
}

// The pad as medicines, each with the tapering lines directly under it. A line
// is a taper by the pad's own test (`rowsFromRxItems`): marked `isCont`, or —
// on a line saved before that mark existed — no drug name. A note is no
// medicine's line and ends the one above it.
function medicinesOf(items: RxItem[]): RxItem[][] {
  const out: RxItem[][] = [];
  let open: RxItem[] | null = null;
  (items ?? []).forEach((it, i) => {
    if (!it) return;
    if (it.isNote) { open = null; return; }
    const isCont = it.isCont ?? (cell(it.drug) === "" && i > 0);
    if (isCont) { open?.push(it); return; }
    if (!cell(it.drug)) { open = null; return; }
    open = [it];
    out.push(open);
  });
  return out;
}

/** The words the chart is asked for, to price this pad: the first word of each medicine's brand. */
export function chartWordsOf(items: RxItem[]): string[] {
  const words = new Set<string>();
  for (const [head] of medicinesOf(items)) for (const w of brandWordsOf(head.drug)) words.add(w);
  return [...words].sort();
}

/** The pad's month, priced from these rows of the chart. */
export function monthlyCost(items: RxItem[], rows: ChartRow[]): MonthlyCost {
  const chart = new MedicineMap<ChartRow>();
  const bare = new Map<string, number[]>();
  for (const r of rows ?? []) {
    chart.add(fmtMedicine(r), r);
    const taka = unitPrice(r.priceRaw);
    if (isBarePack(r) && taka !== null) {
      const brand = r.brandName.trim().toLowerCase();
      bare.set(brand, [...(bare.get(brand) ?? []), taka]);
    }
  }
  const lines: CostLine[] = [];
  let total = 0;
  for (const block of medicinesOf(items)) {
    const label = block[0].drug;
    const price = priceOf(block, chart.get(label), bare);
    if (price.taka !== undefined) total += price.taka;
    lines.push({ label, ...price });
  }
  return { total, lines };
}

/** The server's answer, read without trusting it: the rows it could read, or null when it is not the chart at all. */
export function readChartRows(body: unknown): ChartRow[] | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const rows = (body as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return null;
  const textOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof (r as { brandName?: unknown }).brandName === "string")
    .map((r) => ({
      brandName: r.brandName as string,
      dosageForm: textOrNull(r.dosageForm),
      strength: textOrNull(r.strength),
      priceRaw: textOrNull(r.priceRaw),
    }));
}

/** Why a medicine was not priced, in the doctor's words. */
export function unpricedReason(reason: Unpriced): string {
  switch (reason) {
    case "not-in-chart": return "not found in the medicine chart as it is written";
    case "no-price": return "the medicine chart gives no price for it";
    case "per-pack": return "the medicine chart prices it by the pack (a bottle, a vial, a tube), not by the dose";
    case "several": return "the medicine chart has more than one price for it";
    case "dose": return "its dose is not written as counts, like 1+0+1";
    case "duration": return "its duration is not in days, weeks or months, or Continue";
    case "instruction": return "its food instruction is not one the app reads as every day (only one like \"After meal\" or \"2 hr before meal\" is)";
  }
}
