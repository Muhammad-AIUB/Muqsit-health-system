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
}

export interface OpdPatient {
  id: number;
  name: string;
  phone: string;
  age: number;
  gender: "M" | "F";
  init: string;
  type: string;
  token: string;
  color: ColorKey;
}

export interface IpdPatient {
  bed: string;
  name: string;
  diagnosis: string;
  status: string;
  admitted: string;
  color: ColorKey;
}

export interface IpdEvent {
  ts: string;
  author: string;
  role: string;
  note: string;
  report: string | null;
}

export interface RecentPatient {
  id: string;
  name: string;
  age: number;
  gender: "M" | "F";
  init: string;
  phone: string;
  lastSeen: string;
  diagnosis: string;
  color: ColorKey;
}

export interface QuestionPatient {
  id: string;
  name: string;
  age: number;
  gender: "M" | "F";
  init: string;
  phone: string;
  time: string;
  msg: string;
  type: "alert" | "info" | "suggestion" | "question";
  color: ColorKey;
}

export interface ResearchPatient {
  id: string;
  name: string;
  age: number;
  gender: "M" | "F";
  phone: string;
  source: "OPD" | "IPD";
  diseases: string[];
  tags: string[];
}

export interface HealthDrug {
  name: string;
  start: string;
  end: string;
  color: string;
}

export interface HealthDataPoint {
  d: string;
  v: number;
}

export interface HealthSymptom {
  name: string;
  color: string;
  data: HealthDataPoint[];
}

export interface HealthTest {
  name: string;
  unit: string;
  normal: [number, number];
  color: string;
  data: HealthDataPoint[];
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
