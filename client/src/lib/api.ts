// ═══════════════════════════════════════════════════════════
// Typed client for the Muqsit API (NestJS, server/).
//
// Auth: the API issues an httpOnly access cookie (short-lived) and an
// httpOnly refresh cookie (long-lived, scoped to /api/auth). Tokens are
// never readable from JavaScript, so XSS cannot steal a session. We send
// cookies on every request via `credentials: "include"`. On a 401 we try
// the refresh endpoint once before bouncing the user to /login.
// ═══════════════════════════════════════════════════════════

import { compressImage } from "./compressImage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

// ── Types ───────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  displayName?: string | null;
  role: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export type Profession =
  | "doctor"
  | "intern_doctor"
  | "nurse"
  | "medical_technologist"
  | "computer_operator";

export interface RegisterInput {
  name: string;
  email: string;
  mobile: string;
  profession: Profession;
  registrationNo?: string;
  nidNo: string;
  designation: string;
  specialty: string;
  password: string;
  registrationCertUrl: string;
  nidFrontUrl: string;
  nidBackUrl: string;
  profilePictureUrl: string;
}

export interface MessageResponse {
  message: string;
  email?: string;
}

export interface Patient {
  id: string;
  name: string;
  hospitalId: string | null;
  bloodGroup: string | null;
  dob: string | null;
  age: number | null;
  sex: string | null;
  ethnicity: string | null;
  religion: string | null;
  mobile: string | null;
  spouseMobile: string | null;
  relativeMobile: string | null;
  relativeRelation: string | null;
  district: string | null;
  fullAddress: string | null;
  monthlyIncome: string | null;
  pictureUrl: string | null;
  tags: string[];
  watched: boolean;
  prescriptionImages: string[];
  reportImages: string[];
  hmDrugDates: Record<string, { sf: string; upto: string }> | null;
  hmSelectedDrugs: string[];
  familyMembers: Array<{ name: string; mobile: string; nid: string; sex: string; relation: string }>;
  doctorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientInput {
  name: string;
  hospitalId?: string | null;
  bloodGroup?: string | null;
  dob?: string | null;
  age?: number | null;
  sex?: string | null;
  ethnicity?: string | null;
  religion?: string | null;
  mobile?: string | null;
  spouseMobile?: string | null;
  relativeMobile?: string | null;
  relativeRelation?: string | null;
  district?: string | null;
  fullAddress?: string | null;
  monthlyIncome?: string | null;
  pictureUrl?: string | null;
  tags?: string[];
  watched?: boolean;
  prescriptionImages?: string[];
  reportImages?: string[];
  hmDrugDates?: Record<string, { sf: string; upto: string }>;
  hmSelectedDrugs?: string[];
  familyMembers?: Array<{ name: string; mobile: string; nid: string; sex: string; relation: string }>;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// ── Auth-failure listeners (used by AuthContext to clear state) ──
type AuthFailureListener = () => void;
const authFailureListeners = new Set<AuthFailureListener>();
export const onAuthFailure = (fn: AuthFailureListener): (() => void) => {
  authFailureListeners.add(fn);
  return () => authFailureListeners.delete(fn);
};

// Endpoints where a 401 is meaningful in itself (bad credentials, or the
// refresh call itself) and must NOT trigger a silent-refresh retry. Note
// /auth/me is deliberately NOT here: an expired access cookie on /auth/me
// should refresh silently so a valid refresh cookie keeps the session alive
// across reloads (otherwise every reload after the access cookie expires
// would log the user out).
const NO_REFRESH_PATHS = [
  "/auth/login",
  "/auth/refresh",
  "/auth/register",
  "/auth/verify-email",
  "/auth/resend-otp",
];
const skipRefresh = (path: string) => NO_REFRESH_PATHS.some((p) => path.startsWith(p));

// "refreshed" → got a new access cookie, retry the request.
// "rejected"  → server said the refresh token is invalid → real session loss.
// "unreachable" → network error (e.g. dev server restarting) → transient,
//                 keep the session; the next call will succeed once it's back.
type RefreshResult = "refreshed" | "rejected" | "unreachable";

// ── Single in-flight refresh promise so a burst of 401s doesn't kick off
// ── multiple parallel refresh calls (each of which would rotate the token).
let refreshInFlight: Promise<RefreshResult> | null = null;

async function attemptRefresh(): Promise<RefreshResult> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      return res.ok ? "refreshed" : "rejected";
    } catch {
      return "unreachable";
    } finally {
      // Allow the next refresh attempt only after this one settles.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

// ── Core fetch wrapper ──────────────────────────────────────
async function apiFetch<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    // 401 on an authenticated request → access cookie likely expired. Try one
    // silent refresh, then retry the original request once. Only a definitive
    // "rejected" (the refresh token is invalid) drops the user — a transient
    // "unreachable" (dev server mid-restart) keeps the session so a code
    // change doesn't bounce the user to /login.
    if (res.status === 401 && !retried && !skipRefresh(path)) {
      const result = await attemptRefresh();
      if (result === "refreshed") return apiFetch<T>(path, options, true);
      if (result === "rejected") authFailureListeners.forEach((fn) => fn());
    }

    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ────────────────────────────────────────────────────
export const authApi = {
  login: (identifier: string, password: string, remember: boolean) =>
    apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password, remember }),
    }),
  register: (input: RegisterInput) =>
    apiFetch<MessageResponse>("/auth/register", { method: "POST", body: JSON.stringify(input) }),
  verifyEmail: (email: string, otp: string) =>
    apiFetch<MessageResponse>("/auth/verify-email", { method: "POST", body: JSON.stringify({ email, otp }) }),
  resendOtp: (email: string) =>
    apiFetch<MessageResponse>("/auth/resend-otp", { method: "POST", body: JSON.stringify({ email }) }),
  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
  me: () => apiFetch<AuthUser>("/auth/me"),
};

// ── Profile (self-service) ──────────────────────────────────
export interface Chamber {
  id: string;
  address: string;
  mapLink: string | null;
  order: number;
}

export interface ChamberInput {
  id?: string;
  address: string;
  mapLink?: string;
}

export interface OtherCertificate {
  id: string;
  url: string;
  details: string | null;
  order: number;
}

export interface OtherCertificateInput {
  id?: string;
  url: string;
  details?: string;
}

export interface ProfileMe {
  id: string;
  email: string;
  name: string;
  displayName: string | null;
  role: string;
  mobile: string | null;
  profession: string | null;
  registrationNo: string | null;
  nidNo: string | null;
  designation: string | null;
  specialty: string | null;
  institutionCode: string | null;
  profilePictureUrl: string | null;
  registrationCertUrl: string | null;
  nidFrontUrl: string | null;
  nidBackUrl: string | null;
  otherCertificates: OtherCertificate[];
  emailVerified: boolean;
  approvalStatus: string;
  accountTier: string;
  chambers: Chamber[];
  favouriteInvestigations: string[];
  investigationUnitPrefs: Record<string, string>;
}

export interface ProfileUpdateInput {
  // Note: registrationNo and registrationCertUrl are NOT here — BMDC details
  // are admin-managed (the server's UpdateProfileDto also rejects them).
  displayName?: string;
  email?: string;
  mobile?: string;
  nidNo?: string;
  designation?: string;
  specialty?: string;
  profilePictureUrl?: string;
  nidFrontUrl?: string;
  nidBackUrl?: string;
  otherCertificates?: OtherCertificateInput[];
  chambers?: ChamberInput[];
  favouriteInvestigations?: string[];
  investigationUnitPrefs?: Record<string, string>;
}

export const usersApi = {
  me: () => apiFetch<ProfileMe>("/users/me"),
  update: (input: ProfileUpdateInput) =>
    apiFetch<ProfileMe>("/users/me", { method: "PATCH", body: JSON.stringify(input) }),
};

// ── Medicines search ────────────────────────────────────────
export interface MedicineHit {
  id: string;
  brandName: string;
  genericName: string | null;
  dosageForm: string | null;
  strength: string | null;
  company: string | null;
  priceRaw: string | null;
}

export const medicinesApi = {
  search: (q: string) =>
    apiFetch<MedicineHit[]>(`/medicines/search?q=${encodeURIComponent(q)}`),
};

// ── Prescription print layout ───────────────────────────────
export interface PrescriptionLayout {
  rxType: "opd" | "ipd";
  opdLayout: "single" | "extra";
  unit: "in" | "cm";
  totalHeight: string;
  totalWidth: string;
  leftMargin: string;
  rightMargin: string;
  headerHeight: string;
  footerHeight: string;
  headerSplit: boolean;
  headerAlign: "left" | "center" | "right";
  headerHtml: string;
  headerLeftHtml: string;
  headerRightHtml: string;
  footerHtml: string;
  bodySplit: string;
  bodyLeftTopMargin: string;
  bodyRightTopMargin: string;
  bodyBottomLine: boolean;
}

export type PrescriptionLayoutInput = Partial<PrescriptionLayout>;

export const prescriptionLayoutApi = {
  get: () => apiFetch<PrescriptionLayout>("/prescription-layout"),
  update: (input: PrescriptionLayoutInput) =>
    apiFetch<PrescriptionLayout>("/prescription-layout", { method: "PUT", body: JSON.stringify(input) }),
};

// ── Prescription templates (OPD / IPD / custom), per doctor ──
export type TemplateCategory = "opd" | "ipd" | "custom";

export interface TemplateItem {
  drug: string;
  dose: string;
  duration: string;
  instruction: string;
  isNote?: boolean;
}

export interface RxTemplateRecord {
  id: string;
  category: TemplateCategory;
  name: string;
  items: TemplateItem[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ── Activity feed (real-time who-did-what log) ──────────────
export interface ActivityRecord {
  id: string;
  actorName: string;
  patientName: string | null;
  patientId: string | null;
  section: string;
  detail: string;
  action: "added" | "saved";
  imageUrl: string | null;
  createdAt: string;
}

export interface LogActivityInput {
  section: string;
  detail: string;
  patientName?: string;
  patientId?: string;
  action?: "added" | "saved";
  imageUrl?: string;
}

export const activityApi = {
  list: (limit = 50) => apiFetch<ActivityRecord[]>(`/activity?limit=${limit}`),
  log: (input: LogActivityInput) =>
    apiFetch<ActivityRecord>("/activity", { method: "POST", body: JSON.stringify(input) }),
};

// ── Active prescription draft (auto-saved editor state, one per doctor) ──
export interface PrescriptionDraftRecord {
  data: Record<string, unknown>;
}

export const prescriptionDraftApi = {
  get: () => apiFetch<PrescriptionDraftRecord>("/prescription-draft"),
  save: (data: Record<string, unknown>) =>
    apiFetch<PrescriptionDraftRecord>("/prescription-draft", {
      method: "PUT",
      body: JSON.stringify({ data }),
    }),
  clear: () => apiFetch<{ ok: true }>("/prescription-draft", { method: "DELETE" }),
};

export const templatesApi = {
  list: (category?: TemplateCategory) =>
    apiFetch<RxTemplateRecord[]>(`/prescription-templates${category ? `?category=${category}` : ""}`),
  create: (input: { category: TemplateCategory; name: string; items: TemplateItem[] }) =>
    apiFetch<RxTemplateRecord>("/prescription-templates", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: { name?: string; items?: TemplateItem[] }) =>
    apiFetch<RxTemplateRecord>(`/prescription-templates/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) =>
    apiFetch<{ id: string }>(`/prescription-templates/${id}`, { method: "DELETE" }),
};

// ── File upload (multipart → Cloudinary) ────────────────────
export async function uploadImage(file: File): Promise<string> {
  // Shrink large photos in the browser first — uploads get ~10x faster.
  const compressed = await compressImage(file);
  const form = new FormData();
  form.append("file", compressed);

  const res = await fetch(`${API_URL}/uploads/image`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch {
      /* non-JSON */
    }
    throw new ApiError(res.status, message);
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

// ── Patients ────────────────────────────────────────────────
export const patientsApi = {
  list: (search?: string) =>
    apiFetch<Patient[]>(`/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  watched: () => apiFetch<Patient[]>("/patients/watched"),
  get: (id: string) => apiFetch<Patient>(`/patients/${id}`),
  create: (input: PatientInput) =>
    apiFetch<Patient>("/patients", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<PatientInput>) =>
    apiFetch<Patient>(`/patients/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) => apiFetch<{ id: string }>(`/patients/${id}`, { method: "DELETE" }),
};

// ── Prescriptions ───────────────────────────────────────────
export interface RxItemInput {
  drug: string;
  dose: string;
  duration: string;
  instruction: string;
  order?: number;
  isNote?: boolean;
  sf?: string;
}

export interface PrescriptionInput {
  patientId: string;
  chiefComplaints?: string[];
  previousComplaints?: string[];
  history?: string[];
  investigation?: string[];
  drugHistory?: string[];
  onExamination?: string[];
  note?: string[];
  provisionalDiagnosis?: string[];
  associatedIllness?: string[];
  finalDiagnosis?: string[];
  advice?: string[];
  adviceTest?: string[];
  followUpNum?: string;
  followUpUnit?: string;
  followUpMandatory?: boolean;
  items: RxItemInput[];
}

export interface PrescriptionRecord extends PrescriptionInput {
  id: string;
  doctorId: string;
  createdAt: string;
}

export const prescriptionsApi = {
  create: (input: PrescriptionInput) =>
    apiFetch<PrescriptionRecord>("/prescriptions", { method: "POST", body: JSON.stringify(input) }),
  listByPatient: (patientId: string) =>
    apiFetch<PrescriptionRecord[]>(`/prescriptions?patientId=${encodeURIComponent(patientId)}`),
};

// ── OPD queue ───────────────────────────────────────────────
export interface OpdVisit {
  id: string;
  patientId: string | null;
  name: string;
  phone: string | null;
  age: number | null;
  gender: string | null;
  type: string;
  token: string;
  status: string;
  createdAt: string;
}

export interface OpdVisitInput {
  name: string;
  patientId?: string;
  phone?: string;
  age?: number;
  gender?: string;
  type?: string;
}

export const opdApi = {
  list: () => apiFetch<OpdVisit[]>("/opd"),
  create: (input: OpdVisitInput) =>
    apiFetch<OpdVisit>("/opd", { method: "POST", body: JSON.stringify(input) }),
  setStatus: (id: string, status: "waiting" | "done") =>
    apiFetch<OpdVisit>(`/opd/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
};

// ── IPD ward ────────────────────────────────────────────────
// One "Follow Up" vitals/intake-output snapshot for an IPD admission.
export interface IpdFollowUp {
  bp?: string;          // blood pressure
  hr?: string;          // heart rate
  temp?: string;        // temperature
  spo2?: string;        // oxygen saturation
  urineOutput?: string;
  fluidIntake?: string; // fluid intake / given
  bloodSugar?: string;
  note?: string;        // specific note
}

// A saved follow-up snapshot carries the time it was recorded.
export interface IpdFollowUpEntry extends IpdFollowUp {
  ts: string; // ISO timestamp
}

// Per-admission clinical sheet (IPD detail view). List sections are chip-lists
// (like the prescription page); the diagnosis column on the row is kept in sync.
export interface IpdClinical {
  diagnosis?: string[];
  chiefComplaints?: string[];
  chiefComplaintsNotes?: Record<string, string>; // note box per complaint
  investigation?: string[];
  procedure?: string[];
  procedureNotes?: Record<string, string>;        // note box per procedure
  plan?: string[];
  adviceTests?: string[];
  followUps?: IpdFollowUpEntry[]; // timestamped log
  rxItems?: RxItemInput[];
  invImages?: Record<string, string>; // attached report images, keyed like the findings
}

export interface IpdAdmission {
  id: string;
  patientId: string | null;
  bed: string;
  name: string;
  hospitalId: string | null;
  roomNo: string | null;
  wardNo: string | null;
  floorBuilding: string | null;
  mobile: string | null;
  age: number | null;
  sex: string | null;
  diagnosis: string | null;
  status: string;
  clinical: IpdClinical | null;
  admittedAt: string;
}

export interface IpdAdmissionUpdateInput {
  bed?: string;
  name?: string;
  hospitalId?: string;
  roomNo?: string;
  wardNo?: string;
  floorBuilding?: string;
  mobile?: string;
  diagnosis?: string;
  age?: number;
  sex?: string;
  clinical?: IpdClinical;
}

export interface IpdAdmissionInput {
  bed: string;
  name: string;
  patientId?: string;
  hospitalId?: string;
  roomNo?: string;
  wardNo?: string;
  floorBuilding?: string;
  mobile?: string;
  diagnosis?: string;
  status?: string;
}

export interface IpdEventRecord {
  id: string;
  admissionId: string;
  author: string;
  role: string | null;
  note: string;
  reportUrl: string | null;
  createdAt: string;
}

export const ipdApi = {
  list: () => apiFetch<IpdAdmission[]>("/ipd"),
  create: (input: IpdAdmissionInput) =>
    apiFetch<IpdAdmission>("/ipd", { method: "POST", body: JSON.stringify(input) }),
  setStatus: (id: string, status: string) =>
    apiFetch<IpdAdmission>(`/ipd/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  update: (id: string, input: IpdAdmissionUpdateInput) =>
    apiFetch<IpdAdmission>(`/ipd/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  events: (id: string) => apiFetch<IpdEventRecord[]>(`/ipd/${id}/events`),
  addEvent: (id: string, note: string, reportUrl?: string) =>
    apiFetch<IpdEventRecord>(`/ipd/${id}/events`, { method: "POST", body: JSON.stringify({ note, reportUrl }) }),
};

// ── Assistants & RBAC ───────────────────────────────────────
export interface AssistantRecord {
  id: string;
  assistantId: string;
  name: string;
  email: string;
  mobile: string | null;
  profession: string | null;
  status: "active" | "suspended";
  permissions: string[];
}

export interface AssistantCandidate {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  profession: string | null;
}

export const assistantsApi = {
  list: () => apiFetch<AssistantRecord[]>("/assistants"),
  search: (q: string) =>
    apiFetch<AssistantCandidate[]>(`/assistants/search?q=${encodeURIComponent(q)}`),
  getDefaults: () => apiFetch<{ permissions: string[] }>("/assistants/defaults"),
  setDefaults: (permissions: string[]) =>
    apiFetch<{ permissions: string[]; updatedAssistants: number }>("/assistants/defaults", { method: "PUT", body: JSON.stringify({ permissions }) }),
  add: (assistantId: string) =>
    apiFetch<AssistantRecord>("/assistants", { method: "POST", body: JSON.stringify({ assistantId }) }),
  update: (id: string, input: { permissions?: string[]; status?: "active" | "suspended" }) =>
    apiFetch<AssistantRecord>(`/assistants/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) =>
    apiFetch<{ id: string }>(`/assistants/${id}`, { method: "DELETE" }),
};

// ── Research companion ──────────────────────────────────────
export interface ResearchHit {
  id: string;
  name: string;
  age: number | null;
  sex: string | null;
  mobile: string | null;
  tags: string[];
  diseases: string[];
}

export const researchApi = {
  search: (q: string) => apiFetch<ResearchHit[]>(`/research/patients?q=${encodeURIComponent(q)}`),
};
