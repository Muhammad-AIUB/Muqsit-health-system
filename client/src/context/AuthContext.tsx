"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  authApi,
  getToken,
  setToken,
  clearToken,
  type AuthUser,
  type RegisterInput,
  type MessageResponse,
} from "@/lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean; // finished restoring session from storage
  login: (identifier: string, password: string) => Promise<void>;
  // Registration is a multi-step flow (verify email → admin approval),
  // so it returns a message instead of signing the user in.
  register: (input: RegisterInput) => Promise<MessageResponse>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // Restore session on first load.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }
    authApi
      .me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setReady(true));
  }, []);

  const login = async (identifier: string, password: string) => {
    const res = await authApi.login(identifier, password);
    setToken(res.accessToken);
    setUser(res.user);
  };

  const register = async (input: RegisterInput) => {
    return authApi.register(input);
  };

  const logout = () => {
    clearToken();
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
