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
  // IPD (IpdDetailView)
  "Diagnosis",
  "Plan",
] as const;

const CONDITION_FIELD_SET = new Set<string>(CONDITION_FIELDS.map((f) => f.toLowerCase()));

export interface AlertEvidence {
  /** "℞" for the prescription pad, otherwise the sidebar field label. */
  field: string;
  /** The line the doctor actually typed, trimmed. */
  text: string;
}

export interface RxAlert {
  /** Stable within a render — used as a React key and for dismissal. */
  id: string;
  message: string;
  evidence: AlertEvidence[];
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

/** A drug the patient is on, from either source, with where it came from. */
interface DrugSource {
  text: string;
  generic?: string;
  /** "℞" or "Drug history". */
  field: string;
  /** True when it is on the prescription being written right now. */
  fromRx: boolean;
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
function drugPool(input: RxAlertInput): DrugSource[] {
  const pool: DrugSource[] = input.rxDrugs
    .filter((d) => d.text.trim() || d.generic)
    .map((d) => ({ text: d.text.trim(), generic: d.generic, field: "℞", fromRx: true }));

  const hx = input.drugHistory;
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

const evidenceOf = (d: DrugSource): AlertEvidence => ({ field: d.field, text: d.text || (d.generic ?? "") });

/** First sidebar entry matching any of `terms`, restricted to condition fields. */
function findCondition(sidebar: RxAlertInput["sidebar"], terms: string[]): AlertEvidence | null {
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

function matchRule(rule: RxAlertRule, pool: DrugSource[], input: RxAlertInput): AlertEvidence[] | null {
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

export function findRxAlerts(input: RxAlertInput): RxAlert[] {
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

  return out;
}
