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
// Source: the physician's entecavir rule sheet, `entecavir.xlsx`, received
// 2026-08-28 — column A drug, column B condition, column C advice. All FOUR rows
// are reproduced here verbatim, the CKD one included: it used to be missing
// because only a cut-off screenshot of it existed, and a half-remembered renal
// dosing band is exactly the value that must never be guessed.
//
// The three strings below were written into this file straight from the
// spreadsheet's cells, not retyped — down to the trailing space on the
// decompensated row.
//
// Rows 1 and 4 (Pregnant, Lactating mother) carry the SAME sentence in column
// C. They are kept as two rules so this table still reads row-for-row against
// the sheet; the matcher folds equal messages into one alert, so a patient who
// is both never sees the advice twice.
//
// The CKD row is a CrCl-banded dosing table and its line breaks ARE the table —
// which is why both alert surfaces render a message with `white-space:
// pre-line`. Re-flowed into a paragraph, four dose bands would run together.
const ENTECAVIR_PREGNANCY_LACTATION =
  "Entecavir is contraindicated in pregnancy and lactation. Use tenofovir disoproxil.";

const ENTECAVIR_CKD =
  "In case of CKD patient entecavir dose should be adjusted to CrCL.\nCrCl at least 50 mL/min: 0.5 mg orally once a day\nCrCl 30 to less than 50 mL/min: 0.25 mg orally once a day or 0.5 mg orally every 48 hours\nCrCl 10 to less than 30 mL/min: 0.15 mg orally once a day or 0.5 mg orally every 72 hours\nCrCl less than 10 mL/min: 0.05 mg orally once a day or 0.5 mg orally every 7 days\n\nIn case of decompensated case above dose will be doubled to be used.\n\nOr you can switch to tenofovir alafenamide which is kidney friendly.";

const ENTECAVIR_DECOMPENSATED = "use entecavir -double of usual dose ";

const ENTECAVIR: RxAlertRule[] = [
  {
    kind: "drug-condition",
    drug: "Entecavir",
    drugMatch: ["entecavir"],
    condition: "Pregnant",
    conditionMatch: ["pregnant", "pregnancy"],
    message: ENTECAVIR_PREGNANCY_LACTATION,
  },
  {
    kind: "drug-condition",
    drug: "Entecavir",
    drugMatch: ["entecavir"],
    condition: "Lactating mother",
    // "lactating" / "lactation" / "breastfeeding" already matched here before
    // the sheet arrived; they are kept, so nothing that warned yesterday stops.
    conditionMatch: ["lactating mother", "lactating", "lactation", "breastfeeding"],
    message: ENTECAVIR_PREGNANCY_LACTATION,
  },
  {
    kind: "drug-condition",
    drug: "Entecavir",
    drugMatch: ["entecavir"],
    condition: "CKD",
    // "chronic kidney disease" is the abbreviation written out, not a widening
    // of the rule: a doctor who types the full name has the same patient.
    conditionMatch: ["ckd", "chronic kidney disease"],
    message: ENTECAVIR_CKD,
  },
  {
    kind: "drug-condition",
    drug: "Entecavir",
    drugMatch: ["entecavir"],
    condition: "Decompensated liver cirrhosis",
    // The sheet's phrase, plus the same phrase without "liver" (cirrhosis is
    // liver by definition). Bare "decompensated" is NOT matched — it belongs to
    // heart failure just as readily, and this advice is about the liver. Nor is
    // the "DCLD" shorthand: adding one is the physician's call, not a tidy-up.
    conditionMatch: ["decompensated liver cirrhosis", "decompensated cirrhosis"],
    message: ENTECAVIR_DECOMPENSATED,
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
