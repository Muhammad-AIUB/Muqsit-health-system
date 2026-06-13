// ═══════════════════════════════════════════════════════════
// Typed client for the Muqsit API (NestJS, server/).
// ═══════════════════════════════════════════════════════════

import { compressImage } from "./compressImage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TOKEN_KEY = "muqsit_token";

// ── Token storage (browser only) ────────────────────────────
export const getToken = (): string | null =>
  typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => window.localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => window.localStorage.removeItem(TOKEN_KEY);

// ── Types ───────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthResponse {
  accessToken: string;
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
  doctorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientInput {
  name: string;
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
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// ── Core fetch wrapper ──────────────────────────────────────
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch {
      /* non-JSON error body */
    }
    // A 401 on an authenticated, non-auth request means the session/token
    // expired — drop it and send the user to sign in again, preserving
    // where they were. (/auth/* is excluded: a wrong password is also 401.)
    if (res.status === 401 && token && !path.startsWith("/auth/") && typeof window !== "undefined") {
      clearToken();
      const next = window.location.pathname + window.location.search;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ────────────────────────────────────────────────────
export const authApi = {
  login: (identifier: string, password: string) =>
    apiFetch<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) }),
  register: (input: RegisterInput) =>
    apiFetch<MessageResponse>("/auth/register", { method: "POST", body: JSON.stringify(input) }),
  verifyEmail: (email: string, otp: string) =>
    apiFetch<MessageResponse>("/auth/verify-email", { method: "POST", body: JSON.stringify({ email, otp }) }),
  resendOtp: (email: string) =>
    apiFetch<MessageResponse>("/auth/resend-otp", { method: "POST", body: JSON.stringify({ email }) }),
  me: () => apiFetch<AuthUser>("/auth/me"),
};

// ── File upload (multipart → Cloudinary) ────────────────────
export async function uploadImage(file: File): Promise<string> {
  // Shrink large photos in the browser first — uploads get ~10x faster.
  const compressed = await compressImage(file);
  const token = getToken();
  const form = new FormData();
  form.append("file", compressed);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/uploads/image`, {
    method: "POST",
    body: form,
    headers,
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
}

export interface PrescriptionInput {
  patientId: string;
  chiefComplaints?: string[];
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
  diagnosis: string | null;
  status: string;
  admittedAt: string;
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
  events: (id: string) => apiFetch<IpdEventRecord[]>(`/ipd/${id}/events`),
  addEvent: (id: string, note: string, reportUrl?: string) =>
    apiFetch<IpdEventRecord>(`/ipd/${id}/events`, { method: "POST", body: JSON.stringify({ note, reportUrl }) }),
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
