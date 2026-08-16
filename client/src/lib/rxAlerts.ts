// ⚕️ Prescribing alert matcher.
//
// Reads what is currently in the editor and returns the rules from
// `data/rxAlerts.ts` that apply. Pure and synchronous: it recomputes on every
// keystroke, so an alert appears the moment the trigger is typed and
// disappears the moment it is removed. Nothing is persisted — a stored alert
// could outlive the prescription that caused it and be read later as advice
// about a drug the patient is no longer on.
//
// Each alert carries `evidence`: the exact strings that made it fire and the
// field they came from. That line is the safety feature. The doctor can see
// why a rule triggered and dismiss it themselves, rather than trusting an
// unexplained banner.

import { RX_ALERT_RULES, type RxAlertRule } from "@/data/rxAlerts";
import { drugMentions } from "@/lib/drugHistorySummary";

/**
 * Clinical fields that can carry a patient condition, across both prescribing
 * screens: the OPD editor's left column and the IPD order sheet's clinical
 * sheet. Compared case-insensitively, because the two screens spell the same
 * field differently ("Chief complaints" vs "Chief Complaints").
 *
 * This is an allowlist on purpose. Everything else — drug history,
 * investigation findings, procedure, follow-up vitals — is excluded, so a new
 * field cannot silently start firing clinical alerts.
 */
export const CONDITION_FIELDS = [
  // OPD (PrescriptionView / LeftColumn)
  "Chief complaints",
  "Previous complaints",
  "History",
  "On examination",
  "Note / plan",
  "Provisional diagnosis",
  "Associated illness",
  "Final diagnosis",
  // IPD (IpdDetailView). "Sign" and "Symptoms" are what the ward sheet calls
  // the two complaint lists since 2026-08-15; "Chief Complaints" was the old
  // name for the first of them and matches the OPD entry above
  // case-insensitively, so admissions written before the rename stay covered.
  "Diagnosis",
  "Sign",
  "Symptoms",
  "Plan",
] as const;

const CONDITION_FIELD_SET = new Set<string>(CONDITION_FIELDS.map((f) => f.toLowerCase()));

export interface AlertEvidence {
  /** "℞" for the prescription pad, otherwise the sidebar field label. */
  field: string;
  /** The line the doctor actually typed, trimmed. */
  text: string;
  /**
   * Index into `RxAlertInput.rxDrugs` when this evidence IS a ℞ line; absent
   * for a sidebar condition or a drug-history entry.
   *
   * This is what lets a warning be drawn against the medicine that raised it —
   * beside the line in the editor and on the printed sheet — instead of only
   * in a banner further down the page. Carried as an index rather than matched
   * back by text, because two lines of the same brand at different strengths
   * would be indistinguishable by text alone.
   */
  rxIndex?: number;
}

export interface RxAlert {
  /** Stable within a render — used as a React key and for dismissal. */
  id: string;
  message: string;
  evidence: AlertEvidence[];
}

export interface RxAlertCheck {
  alerts: RxAlert[];
  /**
   * How many stored values could not be read as text. Non-zero means the rules
   * ran against an incomplete picture, and the banner has to SAY so.
   *
   * A silent zero-alert result is indistinguishable from "no contraindication",
   * which is exactly the false reassurance this feature exists to prevent — so
   * an unreadable value is surfaced, never swallowed.
   */
  unreadable: number;
}

export interface RxAlertInput {
  /** One entry per medicine line in the ℞ pad. */
  rxDrugs: { text: string; generic?: string }[];
  /** Sidebar clinical fields, as `{ label, items }`. */
  sidebar: { label: string; items: string[] }[];
  /**
   * Raw `Patient.drugHistory` entries plus the visit date (dd/mm/yyyy), used
   * by drug-drug rules only. "Current" means dated on this visit — the same
   * derivation `DrugHistoryField` uses to fill its Current medications tab.
   * Distant-past entries are excluded: a co-administration timing rule fired
   * for a drug stopped two years ago is alert fatigue, and a doctor who stops
   * reading alerts is the failure this feature exists to prevent.
   */
  drugHistory?: { entries: string[]; visitDate: string };
}

// ── Reading stored data that may not match its type ─────────
//
// `RxAlertInput` describes what the editor is SUPPOSED to hand over, but the
// values behind it come out of JSON columns and localStorage drafts written by
// older builds, so a field typed `string` can arrive as null, a number, or
// missing. TypeScript cannot catch that — the values are cast, not validated
// (`setRxItems(d.rxItems as RxItem[])` in MuqsitContext).
//
// This matcher must therefore be TOTAL. It runs during the render of the
// prescription editor, so an exception here does not lose an alert — it blanks
// the entire screen a doctor prescribes through. Coerce here, in one place, so
// the clinical matching below stays readable and works on plain strings.
//
// Degrade as little as possible: one unreadable row is skipped, the rest of
// the record is still checked, and the count is reported so the doctor is told
// the check was partial rather than being shown a reassuring blank.
const isStr = (v: unknown): v is string => typeof v === "string";

interface Normalised {
  rxDrugs: { text: string; generic?: string }[];
  sidebar: { label: string; items: string[] }[];
  history: { entries: string[]; visitDate: string } | null;
  unreadable: number;
}

function normalise(raw: RxAlertInput): Normalised {
  let unreadable = 0;
  const rxDrugs: Normalised["rxDrugs"] = [];
  const sidebar: Normalised["sidebar"] = [];

  const rawRx: unknown = raw?.rxDrugs;
  if (Array.isArray(rawRx)) {
    for (const d of rawRx as unknown[]) {
      if (!d || typeof d !== "object") { unreadable += 1; continue; }
      const { text, generic } = d as { text?: unknown; generic?: unknown };
      // A line keeps whichever half is readable: a broken brand string still
      // matches a rule through its generic, and vice versa.
      let ok = false;
      const entry: { text: string; generic?: string } = { text: "" };
      if (isStr(text)) { entry.text = text; ok = true; } else unreadable += 1;
      if (generic != null) {
        if (isStr(generic)) { entry.generic = generic; ok = true; } else unreadable += 1;
      }
      if (ok) rxDrugs.push(entry);
    }
  } else if (rawRx != null) unreadable += 1;

  const rawSidebar: unknown = raw?.sidebar;
  if (Array.isArray(rawSidebar)) {
    for (const f of rawSidebar as unknown[]) {
      if (!f || typeof f !== "object") { unreadable += 1; continue; }
      const { label, items } = f as { label?: unknown; items?: unknown };
      if (!isStr(label)) { unreadable += 1; continue; }
      if (!Array.isArray(items)) { if (items != null) unreadable += 1; continue; }
      const clean: string[] = [];
      for (const it of items as unknown[]) {
        if (isStr(it)) clean.push(it);
        else unreadable += 1;
      }
      sidebar.push({ label, items: clean });
    }
  } else if (rawSidebar != null) unreadable += 1;

  let history: Normalised["history"] = null;
  const rawHx: unknown = raw?.drugHistory;
  if (rawHx && typeof rawHx === "object") {
    const { entries, visitDate } = rawHx as { entries?: unknown; visitDate?: unknown };
    const clean: string[] = [];
    if (Array.isArray(entries)) {
      for (const e of entries as unknown[]) {
        if (isStr(e)) clean.push(e);
        else unreadable += 1;
      }
    } else if (entries != null) unreadable += 1;
    // A blank visit date is a legitimately empty header field, not bad data;
    // it simply means no history entry can count as current.
    if (visitDate != null && !isStr(visitDate)) unreadable += 1;
    history = { entries: clean, visitDate: isStr(visitDate) ? visitDate : "" };
  } else if (rawHx != null) unreadable += 1;

  return { rxDrugs, sidebar, history, unreadable };
}

/** A drug the patient is on, from either source, with where it came from. */
interface DrugSource {
  text: string;
  generic?: string;
  /** "℞" or "Drug history". */
  field: string;
  /** True when it is on the prescription being written right now. */
  fromRx: boolean;
  /** Index into the caller's `rxDrugs`, for ℞ lines only. */
  rxIndex?: number;
}

// A term matches only on word boundaries, so "pregnant" does not fire on
// "prepregnant" and "ranitidine" does not fire inside a longer word.
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const termRe = (term: string) => new RegExp(`(^|[^a-z0-9])${escapeRe(term)}([^a-z0-9]|$)`, "i");

// Words that flip the meaning of a condition when they sit immediately before
// it ("not pregnant", "no pregnancy"). Deliberately short and literal — this
// is a guard against the obvious negation, not a claim to understand clinical
// prose. Anything more ambiguous still fires, and the evidence line lets the
// doctor see the sentence and judge.
const NEGATORS = ["no", "not", "non", "never", "nil", "denies", "denied", "without", "negative", "neg"];

const negatedRe = (term: string) =>
  new RegExp(`(^|[^a-z0-9])(${NEGATORS.join("|")})[\\s\\-/]+${escapeRe(term)}([^a-z0-9]|$)`, "i");

/** True when `haystack` mentions `term` and that mention is not negated. */
function mentions(haystack: string, term: string): boolean {
  if (!termRe(term).test(haystack)) return false;
  return !negatedRe(term).test(haystack);
}

/** Everything the patient is on: this prescription first, then current history. */
function drugPool(input: Normalised): DrugSource[] {
  // The index is captured BEFORE the empty rows are filtered out, so it still
  // points at the caller's own `rxDrugs` array — the pad's row, not a position
  // in this pool.
  const pool: DrugSource[] = input.rxDrugs
    .map((d, rxIndex) => ({ ...d, rxIndex }))
    .filter((d) => d.text.trim() || d.generic)
    .map((d) => ({ text: d.text.trim(), generic: d.generic, field: "℞", fromRx: true, rxIndex: d.rxIndex }));

  const hx = input.history;
  if (hx) {
    for (const m of drugMentions(hx.entries, hx.visitDate)) {
      if (m.date !== hx.visitDate) continue; // distant past — see RxAlertInput
      if (!m.name.trim()) continue;
      pool.push({ text: m.name.trim(), field: "Drug history", fromRx: false });
    }
  }
  return pool;
}

/** Index in `pool` of the first drug matching any of `terms`, else -1. */
function findDrugIn(pool: DrugSource[], terms: string[]): number {
  return pool.findIndex((d) => terms.some((t) => mentions(`${d.text} ${d.generic ?? ""}`, t)));
}

const evidenceOf = (d: DrugSource): AlertEvidence => ({
  field: d.field,
  text: d.text || (d.generic ?? ""),
  ...(d.rxIndex === undefined ? {} : { rxIndex: d.rxIndex }),
});

/** First sidebar entry matching any of `terms`, restricted to condition fields. */
function findCondition(sidebar: Normalised["sidebar"], terms: string[]): AlertEvidence | null {
  for (const f of sidebar) {
    if (!CONDITION_FIELD_SET.has(f.label.toLowerCase())) continue;
    for (const raw of f.items) {
      const text = raw.trim();
      if (!text) continue;
      if (terms.some((t) => mentions(text, t))) return { field: f.label, text };
    }
  }
  return null;
}

function matchRule(rule: RxAlertRule, pool: DrugSource[], input: Normalised): AlertEvidence[] | null {
  if (rule.kind === "drug-condition") {
    // Condition rules read the prescription only. The trigger is the act of
    // prescribing the drug to a patient who has the condition.
    const rx = pool.filter((d) => d.fromRx);
    const i = findDrugIn(rx, rule.drugMatch);
    if (i < 0) return null;
    const cond = findCondition(input.sidebar, rule.conditionMatch);
    return cond ? [evidenceOf(rx[i]), cond] : null;
  }

  // drug-drug: either drug may come from current drug history, but at least one
  // side must be on today's ℞ — otherwise the pair is unchanged from last visit
  // and the alert would repeat forever without the doctor having done anything.
  const a = findDrugIn(pool, rule.drugMatch);
  if (a < 0) return null;
  const b = pool.findIndex((d, i) => i !== a && rule.withMatch.some((t) => mentions(`${d.text} ${d.generic ?? ""}`, t)));
  if (b < 0) return null;
  if (!pool[a].fromRx && !pool[b].fromRx) return null;
  return [evidenceOf(pool[a]), evidenceOf(pool[b])];
}

/**
 * Run every rule against the editor's current state.
 *
 * Never throws. Anything it cannot read is skipped and counted in
 * `unreadable` — see the note on `RxAlertCheck` for why that count must reach
 * the doctor instead of being absorbed into a clean-looking empty result.
 */
export function checkRxAlerts(raw: RxAlertInput): RxAlertCheck {
  const input = normalise(raw);
  const out: RxAlert[] = [];
  const seen = new Set<string>();
  const pool = drugPool(input);

  for (const rule of RX_ALERT_RULES) {
    const evidence = matchRule(rule, pool, input);
    if (!evidence) continue;
    // One message per distinct advice text. Six PPI rules share one sentence;
    // a doctor co-prescribing two of them should read it once, with both named.
    const key = rule.message;
    const existing = out.find((a) => a.message === key);
    if (existing) {
      for (const e of evidence) {
        if (!existing.evidence.some((x) => x.field === e.field && x.text === e.text)) existing.evidence.push(e);
      }
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `${rule.drug}|${key}`, message: rule.message, evidence });
  }

  return { alerts: out, unreadable: input.unreadable };
}

/** The alerts alone, for callers that do not render the "partial check" notice. */
export function findRxAlerts(input: RxAlertInput): RxAlert[] {
  return checkRxAlerts(input).alerts;
}

/**
 * The warnings for each ℞ line, keyed by index into `RxAlertInput.rxDrugs`.
 *
 * ⚕️ ONE SOURCE FOR BOTH SURFACES. The editor draws these beside the medicine
 * while the doctor writes, and `prescriptionDoc` prints the same sentences on
 * the sheet. Two independently-derived versions of a contraindication could
 * disagree, and the printed one is the legal document — so both read this.
 *
 * A drug-drug rule names two medicines; when both are on today's ℞ the warning
 * is attached to BOTH lines, because either one is the one the doctor might
 * change. A rule whose other side is a drug-history entry attaches only to the
 * ℞ line, which is the only line there is to attach it to.
 *
 * Total: anything unreadable is skipped upstream by `checkRxAlerts`, and an
 * index that does not correspond to a line simply yields nothing.
 */
// One entry per input object. The ℞ pad calls `rxAlertsByLine` once per
// medicine row, and `useRxAlertInput` memoises the input — so without this the
// full rule sweep runs N times for every keystroke in any cell. A WeakMap keyed
// on the input means a new input (a real change) always recomputes, and an
// unchanged one is free; nothing is retained after the input is dropped.
const byLineCache = new WeakMap<RxAlertInput, Map<number, string[]>>();

export function rxAlertsByLine(input: RxAlertInput): Map<number, string[]> {
  const cached = input && typeof input === "object" ? byLineCache.get(input) : undefined;
  if (cached) return cached;
  const byLine = new Map<number, string[]>();
  for (const alert of checkRxAlerts(input).alerts) {
    for (const e of alert.evidence) {
      if (e.rxIndex === undefined) continue;
      const list = byLine.get(e.rxIndex) ?? [];
      // The same sentence must never be printed twice against one medicine.
      if (!list.includes(alert.message)) list.push(alert.message);
      byLine.set(e.rxIndex, list);
    }
  }
  if (input && typeof input === "object") byLineCache.set(input, byLine);
  return byLine;
}
