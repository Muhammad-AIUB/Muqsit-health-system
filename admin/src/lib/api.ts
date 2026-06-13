// ═══════════════════════════════════════════════════════════
// Typed client for the Muqsit API — admin dashboard.
//
// Auth mirrors the main client: the API issues httpOnly access + refresh
// cookies (never readable from JS), sent on every request via
// `credentials: "include"`. On a 401 we try one silent refresh before
// giving up and notifying listeners (which drop the user → login screen).
// ═══════════════════════════════════════════════════════════

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthResponse {
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

// ── Auth-failure listeners (the page subscribes to drop the user) ──
type AuthFailureListener = () => void;
const authFailureListeners = new Set<AuthFailureListener>();
export const onAuthFailure = (fn: AuthFailureListener): (() => void) => {
  authFailureListeners.add(fn);
  return () => authFailureListeners.delete(fn);
};

// ── Single in-flight refresh so a burst of 401s triggers one refresh. ──
let refreshInFlight: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
      return res.ok;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

async function apiFetch<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: "include" });

  if (!res.ok) {
    // 401 on a non-auth request → access cookie expired. Try one silent
    // refresh, then retry once. If refresh fails, notify listeners so the
    // dashboard drops the user back to the sign-in screen.
    if (res.status === 401 && !retried && !path.startsWith("/auth/")) {
      const ok = await attemptRefresh();
      if (ok) return apiFetch<T>(path, options, true);
      authFailureListeners.forEach((fn) => fn());
    }

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
  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
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
