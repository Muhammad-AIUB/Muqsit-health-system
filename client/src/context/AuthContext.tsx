"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  authApi,
  onAuthFailure,
  ApiError,
  type AuthUser,
  type RegisterInput,
  type MessageResponse,
} from "@/lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean; // finished restoring session from cookie
  login: (identifier: string, password: string, remember: boolean) => Promise<void>;
  // Registration is a multi-step flow (verify email → admin approval),
  // so it returns a message instead of signing the user in.
  register: (input: RegisterInput) => Promise<MessageResponse>;
  logout: () => Promise<void>;
  // Re-fetch /auth/me so cached fields (name/email shown in the header)
  // stay in sync after a profile update.
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // Restore session on first load: ask the server who we are. The access
  // cookie is httpOnly so we cannot read it ourselves; /auth/me will return
  // 200 if the cookie is valid, and apiFetch will silently refresh once
  // before giving up.
  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          // Definitive: no valid session (and the silent refresh inside
          // apiFetch also failed). Treat as signed out.
          setUser(null);
        } else {
          // Transient — server down / restarting in dev / CORS. Don't wipe a
          // session over a blip; just log it. (On first load there's no user
          // yet, so this simply leaves us logged out until the server is back.)
          console.error("Failed to restore session (transient)", e);
        }
      })
      .finally(() => setReady(true));
  }, []);

  // When the API layer detects an unrecoverable 401 (refresh also failed),
  // drop the user from state. The RequireAuth guard then sends them to
  // /login on the next render.
  useEffect(() => onAuthFailure(() => setUser(null)), []);

  const login = async (identifier: string, password: string, remember: boolean) => {
    const res = await authApi.login(identifier, password, remember);
    // Mark a FRESH login so the prescription editor starts blank & gated. A plain
    // page reload (no login) does NOT set this, so the loaded patient is restored.
    try { window.sessionStorage.setItem("mhs_fresh_login", "1"); } catch { /* ignore */ }
    setUser(res.user);
  };

  const register = async (input: RegisterInput) => {
    return authApi.register(input);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the server call fails (offline, etc) we still drop local
      // state so the UI reflects "logged out".
    }
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      setUser(await authApi.me());
    } catch {
      /* leave the existing cached user — the api layer's auth-failure
         listener handles real session loss */
    }
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
