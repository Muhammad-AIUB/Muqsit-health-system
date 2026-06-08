// ═══════════════════════════════════════════════════════════
// Typed client for the Muqsit API (NestJS, server/).
// ═══════════════════════════════════════════════════════════

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
  profilePictureUrl?: string;
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
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
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
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
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
  get: (id: string) => apiFetch<Patient>(`/patients/${id}`),
  create: (input: PatientInput) =>
    apiFetch<Patient>("/patients", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<PatientInput>) =>
    apiFetch<Patient>(`/patients/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) => apiFetch<{ id: string }>(`/patients/${id}`, { method: "DELETE" }),
};
