"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { C, font } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";

// Email/phone the user asked us to remember. Only the identifier is stored —
// never the password (that would be readable by any script; the long-lived
// session cookie is what saves you from re-typing it).
const REMEMBER_KEY = "mhs_remember_id";

export default function LoginPage() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [focused, setFocused] = useState<"identifier" | "password" | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Pre-fill the remembered email/phone on load.
  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setIdentifier(saved);
      setRemember(true);
    }
  }, []);

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const id = identifier.trim();
      await login(id, password, remember);
      // Persist (or clear) the remembered identifier only once login succeeds.
      if (remember) window.localStorage.setItem(REMEMBER_KEY, id);
      else window.localStorage.removeItem(REMEMBER_KEY);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Is the API running?");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
  };

  // ── input styling with focus state ──
  const fieldWrap = (id: "identifier" | "password") =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 14px",
      borderRadius: 10,
      background: C.n[50],
      border: `1.5px solid ${focused === id ? C.pri[400] : C.n[200]}`,
      boxShadow: focused === id ? `0 0 0 3px ${C.pri[50]}` : "none",
      transition: "border-color 0.15s, box-shadow 0.15s",
    }) as const;

  const inputBase = {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 14,
    color: C.n[900],
    fontFamily: font,
  } as const;

  return (
    <div
      style={{
        fontFamily: font,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `radial-gradient(1200px 600px at 50% -10%, ${C.pri[50]} 0%, transparent 60%), linear-gradient(160deg, ${C.n[50]} 0%, #eef6f2 100%)`,
        padding: 24,
      }}
    >
      <div style={{ width: 400, maxWidth: "100%" }}>
        {/* ── Brand ── */}
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 16,
              background: `linear-gradient(135deg, ${C.pri[400]} 0%, ${C.pri[600]} 100%)`,
              color: "#fff",
              fontSize: 18,
              fontWeight: 700,
              boxShadow: `0 8px 24px ${C.pri[100]}`,
              marginBottom: 14,
            }}
          >
            MHS+
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.n[900], margin: "0 0 4px", letterSpacing: "-0.02em" }}>
            Muqsit Health System
          </h1>
          <p style={{ fontSize: 13, color: C.n[600], margin: 0 }}>Patient management &amp; prescription system</p>
        </div>

        {/* ── Card ── */}
        <div
          style={{
            background: C.n[0],
            border: `1px solid ${C.n[200]}`,
            borderRadius: 18,
            padding: 30,
            boxShadow: "0 12px 40px rgba(15, 110, 86, 0.08), 0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 600, color: C.n[900], margin: "0 0 4px" }}>Welcome back</h2>
          <p style={{ fontSize: 12.5, color: C.n[600], margin: "0 0 22px" }}>Sign in to continue to your dashboard</p>

          {/* Email or phone */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: C.n[800], display: "block", marginBottom: 7 }}>Email or phone</label>
            <div style={fieldWrap("identifier")}>
              <span style={{ fontSize: 15, color: C.n[500] }}>👤</span>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => setFocused("identifier")}
                onBlur={() => setFocused(null)}
                placeholder="Email address or phone"
                name="username"
                autoComplete="username"
                style={inputBase}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: C.n[800], display: "block", marginBottom: 7 }}>Password</label>
            <div style={fieldWrap("password")}>
              <span style={{ fontSize: 15, color: C.n[500] }}>🔒</span>
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                placeholder="Enter your password"
                name="password"
                autoComplete="current-password"
                style={inputBase}
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: C.n[500], padding: 0 }}
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {/* Remember + forgot */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: C.n[600], display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ accentColor: C.pri[400], width: 15, height: 15 }}
              />{" "}
              Remember me
            </label>
            <span
              style={{ fontSize: 12, color: C.pri[600], cursor: "pointer", fontWeight: 500 }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
            >
              Forgot password?
            </span>
          </div>

          {error && (
            <div
              style={{
                fontSize: 12,
                color: C.danger[800],
                background: C.danger[50],
                border: `1px solid ${C.danger[100]}`,
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>⚠️</span>
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading}
            style={{
              width: "100%",
              padding: "13px 20px",
              borderRadius: 10,
              border: "none",
              background: loading ? C.pri[600] : `linear-gradient(135deg, ${C.pri[400]} 0%, ${C.pri[600]} 100%)`,
              color: "#fff",
              fontSize: 14.5,
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.8 : 1,
              boxShadow: `0 4px 14px ${C.pri[100]}`,
              transition: "opacity 0.15s, transform 0.1s",
            }}
            onMouseDown={(e) => !loading && (e.currentTarget.style.transform = "scale(0.99)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {loading ? "Please wait…" : "Sign in"}
          </button>

          <div style={{ textAlign: "center", fontSize: 12.5, color: C.n[600], marginTop: 18 }}>
            New here?{" "}
            <Link href="/signup" style={{ color: C.pri[600], cursor: "pointer", fontWeight: 600, textDecoration: "none" }}>
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
