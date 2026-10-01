// Shared, SYNTHETIC test fixtures. Nothing here is a real patient.
//
// ⚕️ No clinical content is invented in this file. Every medicine label, dose,
// duration and finding below is copied from an expectation that already exists
// in the suite (`prescriptionDoc.test.ts`, `rxDrugHistory.test.ts`,
// `rxRowMove.test.ts`, `investigationOrder.test.ts`) — the source is named
// beside each block. If a value here needs to change, change it in the test it
// came from first and ask why it was there.
//
// Everything is a FACTORY returning a fresh object, so one test mutating its
// copy can never leak into the next.

import type { Patient } from "@/lib/api";
import type { PrescriptionDoc, RxLine } from "@/lib/prescriptionDoc";
import type { MovableRow } from "@/lib/rxRowMove";
import type { RxItem } from "@/types";

/** The wall clock every date test injects (`dateInput.test.ts`, `age.test.ts`). */
export const FIXED_NOW = new Date(2026, 6, 27); // 27 Jul 2026, local midnight

/** The visit stamp `rxDrugHistory.test.ts` uses. */
export const VISIT_DATE = "07/09/2026";

// ── Patient ────────────────────────────────────────────────────────────────
/** A complete `Patient` record with every clinical collection empty. Sex and
 *  age are deliberately UNRECORDED (null) — a fixture that defaulted one would
 *  be the very fabricated default `client/CLAUDE.md` forbids. */
export function makePatient(over: Partial<Patient> = {}): Patient {
  return {
    id: "pt-test-1",
    name: "Patient",
    hospitalId: null,
    bloodGroup: null,
    dob: null,
    age: null,
    ageAsOfYear: null,
    sex: null,
    ethnicity: null,
    religion: null,
    mobile: "01700000000",
    nid: null,
    spouseMobile: null,
    relativeMobile: null,
    relativeRelation: null,
    district: null,
    fullAddress: null,
    monthlyIncome: null,
    pictureUrl: null,
    tags: [],
    watched: false,
    prescriptionImages: [],
    reportImages: [],
    imageThumbs: null,
    lastRxImageKey: null,
    hmDrugDates: null,
    hmSymptomDates: null,
    hmSelectedDrugs: [],
    familyMembers: [],
    investigationSummary: [],
    onExaminationSummary: [],
    drugHistory: [],
    incompleteRx: null,
    doctorId: "doc-test-1",
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    ...over,
  };
}

// ── ℞ pad rows (lib/rxRowMove.ts) — the builders of rxRowMove.test.ts ───────
export const medRow = (drug: string, dose = ""): MovableRow =>
  ({ drug, dose, food: "", duration: "", isMedicine: true, continuation: false });
export const taperRow = (dose: string): MovableRow =>
  ({ drug: "", dose, food: "", duration: "", isMedicine: true, continuation: true });
export const noteRow = (drug: string): MovableRow =>
  ({ drug, dose: "", food: "", duration: "", isMedicine: false, continuation: false });
export const typingRow = (): MovableRow => noteRow("");

/** rxRowMove.test.ts's pad: Napa, Pred + two tapers, a note, Omep, typing row. */
export const makePad = (): MovableRow[] => [
  medRow("Napa", "1+1+1"),
  medRow("Pred", "2+0+0"), taperRow("1+0+0"), taperRow("1/2+0+0"),
  noteRow("Insulin as before"),
  medRow("Omep", "1+0+1"),
  typingRow(),
];

// ── ℞ items (types/RxItem) — the builder of rxDrugHistory.test.ts ───────────
export const rxItem = (p: Partial<RxItem> = {}): RxItem =>
  ({ drug: "", dose: "", duration: "", instruction: "", ...p });

// ── Printed sheet (lib/prescriptionDoc.ts) ─────────────────────────────────
/** `line()` from prescriptionDoc.test.ts. */
export const rxLine = (drug: string, dose = "1+0+0", duration = "5 days", instruction = ""): RxLine =>
  ({ drug, dose, duration, instruction });
export const rxNote = (drug: string): RxLine =>
  ({ drug, dose: "", duration: "", instruction: "", isNote: true });

/** `REPORTED` from prescriptionDoc.test.ts — five lines, one long free dose. */
export const REPORTED_RX = (): RxLine[] => [
  rxLine("Tablet. Barcavir 0.5 mg", "1+0+0", "Continue"),
  rxLine("Tablet. Napa 500 mg", "1+1+1", "5 days"),
  rxLine("Oral Solution. Avolac 3.35 gm/5 ml", "2-4tsf at night if constipation", ""),
  rxLine("Tablet. Bicozin N/A", "1+0+0", "Continue"),
  rxLine("Capsule. Denvar 400 mg", "1+0+1", "7 days"),
];

/** The eight-medicine sheet reported on 2026-08-26 (prescriptionDoc.test.ts,
 *  "keeps ordinary medicine names on one line beside one long free-typed dose"). */
export const EIGHT_MEDICINE_RX = (): RxLine[] => [
  rxLine("Tablet. Xynovir 300 mg", "1+0+0", "Continue", "Before meal"),
  rxLine("Tablet. Barcavir 0.5 mg", "0+0+1", "Continue", "Before meal"),
  rxLine("Capsule. Lenva 4 mg", "0+0+2", "Continue", ""),
  rxLine("Tablet. Carvista 3.125 mg", "1+0+1", "Continue", ""),
  rxLine("Tablet. Bicozin", "0+0+1", "Continue", ""),
  rxLine("Capsule (Enteric Coated). Sergel 40 mg", "1+0+1", "2 month", "Before meal"),
  rxLine("Tablet. Deflux 10 mg", "1+0+1", "if needed", "Before meal"),
  rxLine("Oral Solution. Avolac 3.35 gm/5 ml", "2-4TSF at night if constipation", "", ""),
];

/** The A4 page of prescriptionDoc.test.ts's "body section" block. */
export const A4_PAGE = (): NonNullable<PrescriptionDoc["page"]> => ({
  unit: "in", width: "8.27", height: "11.69", marginLeft: "0.4", marginRight: "0.4",
  headerHeight: "0.5", footerHeight: "0.5",
});

/** `doc()` from prescriptionDoc.test.ts ("printed Rx markup"): fixed date, no
 *  clinical blocks. Fully deterministic — the builder reads no clock. */
export function makePrescriptionDoc(rx: RxLine[], over: Partial<PrescriptionDoc> = {}): PrescriptionDoc {
  return {
    doctorName: "Dr Test",
    patient: { name: "Patient", age: "39", gender: "Male", address: "", weight: "", date: "16/08/2026", phone: "01700000000" },
    clinical: [],
    rx,
    advice: [],
    adviceTest: [],
    followUp: "",
    ...over,
  };
}

// ── Drug history (rxDrugHistory.test.ts) ───────────────────────────────────
export const STORED_DRUG_HISTORY = (): string[] => [
  "10/01/2024: Losartan 50mg — 1+0+1 — after food — continuing",
  "20/07/2026: Metformin 500mg — 1+0+1 — after food — 1 month",
];
export const NAPA_ENTRY = "07/09/2026: Tablet. Napa 500 mg — 1+1+1 — food — 5 days";
export const MESACOL_ENTRY = "07/09/2026: Mesacol 400 mg — 2+2+2 — food — 7 week";
