// ⚕️ Prescribing alert rules — the clinical rule table.
//
// EVERY `message` below is VERBATIM from a rule sheet supplied by the product
// owner (a physician). Do not reword, correct spelling, add a rule, widen a
// match term, or fill in a dose from clinical memory. If a rule looks
// incomplete, ask the physician — an invented cutoff or dose in this file is
// shown to a prescribing doctor as if it were verified. (Root CLAUDE.md,
// PRIME DIRECTIVE #1.)
//
// Two rule kinds:
//   drug-condition — a drug in the ℞ pad + a patient condition in the sidebar
//   drug-drug      — two drugs in the ℞ pad (or one in ℞, one in Drug history)
//
// Match terms are lowercase and matched on WORD BOUNDARIES, so "pregnant"
// hits "Pregnant", "? pregnant", "28wk pregnant" but not "prepregnant".

export interface DrugConditionRule {
  kind: "drug-condition";
  /** Generic drug name as written in the source sheet. Shown in "why". */
  drug: string;
  /** Lowercase terms that identify the drug in the ℞ pad. */
  drugMatch: string[];
  /** Condition label as written in the source sheet. Shown in "why". */
  condition: string;
  /** Lowercase terms searched across the sidebar clinical fields. */
  conditionMatch: string[];
  /** Verbatim advice text. */
  message: string;
}

export interface DrugDrugRule {
  kind: "drug-drug";
  drug: string;
  drugMatch: string[];
  withDrug: string;
  withMatch: string[];
  message: string;
}

export type RxAlertRule = DrugConditionRule | DrugDrugRule;

// ── Entecavir ───────────────────────────────────────────────
// Source: the physician's entecavir rule sheet (column A drug, column B
// condition, column C advice).
//
// ⚠️ INCOMPLETE: the sheet's second row (entecavir + CKD, a CrCl-banded dose
// adjustment) was cut off in the screenshot it was supplied in and the file
// itself has not been received. It is deliberately NOT reproduced here —
// a half-remembered renal dosing band is exactly the kind of value that
// harms a patient. Add it only from the source file.
const ENTECAVIR: RxAlertRule[] = [
  {
    kind: "drug-condition",
    drug: "Entecavir",
    drugMatch: ["entecavir"],
    condition: "Pregnant",
    conditionMatch: ["pregnant", "pregnancy", "lactating", "lactation", "breastfeeding"],
    message: "Entecavir is contraindicated in pregnancy and lactation. Use tenofovir disoproxil.",
  },
];

// ── Sofosbuvir + Velpatasvir ────────────────────────────────
// Source: the physician's "Sofosbuvir+Velpatasvir" sheet, all 9 rows.
//
// The sheet's subject is the sofosbuvir/velpatasvir COMBINATION, so the match
// term is "velpatasvir" — the component that identifies it. Bare "sofosbuvir"
// is not matched: it also ships combined with ledipasvir and daclatasvir, and
// firing this exact wording at those patients would state a combination the
// doctor did not prescribe.
const SOF_VEL_DRUG = "Sofosbuvir+Velpatasvir";
const SOF_VEL_MATCH = ["velpatasvir"];

const PPI_MESSAGE =
  "Sofosbuvir/Velpatasvir dose must have atleast 4 hours gap before taking Proton Pump Inhibitor";
const H2_MESSAGE =
  "Sofosbuvir/Velpatasvir dose must have atleast 12 hours gap before taking your H2 blocker";

const PROTON_PUMP_INHIBITORS = [
  "Omeprazole",
  "Esomeprazole",
  "Lansoprazole",
  "Dexlansoprazole",
  "Pantoprazole",
  "Rabeprazole",
];

const H2_BLOCKERS = ["Famotidine", "Cimetidine", "Ranitidine"];

const SOFOSBUVIR_VELPATASVIR: RxAlertRule[] = [
  ...PROTON_PUMP_INHIBITORS.map<DrugDrugRule>((withDrug) => ({
    kind: "drug-drug",
    drug: SOF_VEL_DRUG,
    drugMatch: SOF_VEL_MATCH,
    withDrug,
    withMatch: [withDrug.toLowerCase()],
    message: PPI_MESSAGE,
  })),
  ...H2_BLOCKERS.map<DrugDrugRule>((withDrug) => ({
    kind: "drug-drug",
    drug: SOF_VEL_DRUG,
    drugMatch: SOF_VEL_MATCH,
    withDrug,
    withMatch: [withDrug.toLowerCase()],
    message: H2_MESSAGE,
  })),
];

export const RX_ALERT_RULES: RxAlertRule[] = [...ENTECAVIR, ...SOFOSBUVIR_VELPATASVIR];
