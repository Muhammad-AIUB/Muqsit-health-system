// ═══════════════════════════════════════════════════════════
// Typed client for the Muqsit API — admin dashboard.
// ═══════════════════════════════════════════════════════════

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TOKEN_KEY = "muqsit_admin_token";

export const getToken = (): string | null =>
  typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => window.localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => window.localStorage.removeItem(TOKEN_KEY);

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

export interface Registration {
  id: string;
  email: string;
  name: string;
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
  emailVerified: boolean;
  approvalStatus: string;
  rejectionReason: string | null;
  accountTier: string;
  createdAt: string;
  updatedAt: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

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
      /* non-JSON */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const adminApi = {
  login: (email: string, password: string) =>
    apiFetch<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ identifier: email, password }) }),
  me: () => apiFetch<AuthUser>("/auth/me"),
  listRegistrations: (status?: string) =>
    apiFetch<Registration[]>(`/admin/registrations${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  approve: (id: string) =>
    apiFetch<Registration>(`/admin/registrations/${id}/approve`, { method: "PATCH" }),
  reject: (id: string, reason: string) =>
    apiFetch<Registration>(`/admin/registrations/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) }),
  suspend: (id: string) =>
    apiFetch<Registration>(`/admin/registrations/${id}/suspend`, { method: "PATCH" }),
  setTier: (id: string, tier: "primary" | "secondary") =>
    apiFetch<Registration>(`/admin/registrations/${id}/tier`, { method: "PATCH", body: JSON.stringify({ tier }) }),
  // Force-logout: revokes every active refresh token for the user, so their
  // next silent refresh fails and they fall through to /login.
  revokeSessions: (id: string) =>
    apiFetch<{ revoked: number }>(`/admin/users/${id}/revoke-sessions`, { method: "POST" }),
};

export const PROFESSION_LABELS: Record<string, string> = {
  doctor: "Doctor",
  intern_doctor: "Intern doctor",
  nurse: "Nurse",
  medical_technologist: "Medical technologist",
  computer_operator: "Computer operator",
};
