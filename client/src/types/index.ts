// ═══════════════════════════════════════════════════════════
// Shared domain types for Muqsit
// ═══════════════════════════════════════════════════════════

export type ColorKey = "pri" | "warn" | "danger" | "info";

export interface Drug {
  name: string;
  cat: string;
  price: number;
}

export interface RxItem {
  drug: string;
  dose: string;
  duration: string;
  instruction: string;
  // A free-typed instruction line the doctor wrote between medicines
  // (e.g. "Take rest for 2 weeks"). Carried through to the printed sheet.
  isNote?: boolean;
  // "Start From" date for the medicine (IPD pad), e.g. "17 June 2026".
  sf?: string;
  // This line is a tapering continuation (`>>>`) of the medicine above it.
  // Persisted, because `savePrescription` fills the medicine's name back into
  // continuation lines so the printed sheet is self-contained — without this
  // flag a tapering schedule reads back as two unrelated medicines. Absent on
  // anything saved before 2026-08-17; there the blank `drug` is the only
  // signal, and it must not be guessed at retroactively.
  isCont?: boolean;
  // Generic name, present only when the line was picked from the medicines
  // table (`drug` carries the brand). Read by the prescribing-alert matcher so
  // a rule written against a generic still fires on a brand-name ℞. Additive:
  // prescriptions and drafts saved before this field simply lack it.
  generic?: string;
  // TRANSIENT — this line was inserted from a "Your usual" suggestion rather
  // than typed. It exists only to answer the one question the feature has no
  // proxy for: what share of ℞ lines the suggestions actually save. It is NOT
  // declared on `RxItemDto`, so `ValidationPipe({ whitelist: true })` strips it
  // before it can reach `PrescriptionItem` — a prescription must record what
  // was prescribed, never how it was typed. Cleared as soon as the doctor edits
  // the drug text by hand, same as `generic`.
  fromHabit?: boolean;
}

export interface IpdPatient {
  bed: string;
  name: string;
  diagnosis: string;
  status: string;
  admitted: string;
  color: ColorKey;
}

export type InvFieldType = "num" | "text" | "dd";

export interface InvField {
  l: string;
  t: InvFieldType;
  u1?: string;
  u2?: string;
  c12?: number;
  c21?: number;
  opts?: string[];
}

export interface InvTest {
  name: string;
  fields: InvField[];
  // Optional id of a built-in score calculator (see lib/calculators registry).
  // When set, the investigation popup renders that calculator for this test.
  calc?: string;
}

export interface InvCat {
  cat: string;
  tests: InvTest[];
}

export interface PtInfo {
  name: string;
  hospitalId: string;
  bloodGroup: string;
  dob: string;
  age: string;
  sex: string;
  ethnicity: string;
  religion: string;
  mobile: string;
  nid: string;
  spouseMobile: string;
  relativeMobile: string;
  relativeRelation: string;
  district: string;
  fullAddress: string;
  monthlyIncome: string;
  picture: string | null;
  tags: string[];
}

export interface FamilyForm {
  name: string;
  mobile: string;
  nid: string;
  sex: string;
}

export interface FamilyMember extends FamilyForm {
  relation: string;
}

export interface OeData {
  age: string;
  dob: string;
  heightCm: string;
  heightFt: string;
  heightIn: string;
  weightLb: string;
  weightKg: string;
  sbp: string;
  dbp: string;
  pulse: string;
  pulseNote: string;
  rr: string;
  spo2: string;
  anaemia: string;
  jaundice: string;
  ascites: string;
  auscHeart: string;
  auscLung: string;
  specialNote: string;
  diseaseHistory: string;
  surgicalHistory: string;
}

export type Page = "login" | "app";
export type View = "desktop" | "mobile";
export type TabId =
  | "prescription"
  | "opd"
  | "ipd"
  | "patients"
  | "message"
  | "research"
  | "settings"
  | "pt-settings"
  | "idsp"
  | "pt-records";
