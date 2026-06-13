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
  login: (identifier: string, password: string) => Promise<void>;
  // Registration is a multi-step flow (verify email → admin approval),
  // so it returns a message instead of signing the user in.
  register: (input: RegisterInput) => Promise<MessageResponse>;
  logout: () => Promise<void>;
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
        if (!(e instanceof ApiError && e.status === 401)) {
          // 401 just means "not signed in" — anything else is unexpected
          // (server down, CORS misconfig). Log so it isn't silent.
          console.error("Failed to restore session", e);
        }
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  // When the API layer detects an unrecoverable 401 (refresh also failed),
  // drop the user from state. The RequireAuth guard then sends them to
  // /login on the next render.
  useEffect(() => onAuthFailure(() => setUser(null)), []);

  const login = async (identifier: string, password: string) => {
    const res = await authApi.login(identifier, password);
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

  return (
    <AuthContext.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
