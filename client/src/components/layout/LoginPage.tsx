"use client";

import { useState } from "react";
import { C, font } from "@/theme";
import { inputSm } from "@/theme/styles";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import SignupPage from "./SignupPage";

export default function LoginPage() {
  const { login } = useAuth();
  const [view, setView] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (view === "signup") return <SignupPage onBack={() => setView("login")} />;

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Is the API running?");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
  };

  return (
    <div style={{ fontFamily: font, minHeight: 500, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${C.n[50]} 0%, #f0f7f4 100%)`, borderRadius: 16, padding: 40 }}>
      <div style={{ width: 380, textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 32, padding: "12px 20px", background: C.n[0], borderRadius: 12, border: `0.5px solid ${C.n[200]}` }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 600 }}>M+</div>
          <span style={{ fontSize: 22, fontWeight: 500, color: C.n[900], letterSpacing: "-0.02em" }}>MedCare</span>
        </div>
        <p style={{ fontSize: 13, color: C.n[600], marginBottom: 24 }}>Patient management & prescription system</p>
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 14, padding: 28, textAlign: "left" }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: C.n[600], display: "block", marginBottom: 5 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onKeyDown} placeholder="doctor@clinic.com" style={{ ...inputSm, padding: "10px 14px", fontSize: 13 }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: C.n[600], display: "block", marginBottom: 5 }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onKeyDown} placeholder="••••••••" style={{ ...inputSm, padding: "10px 14px", fontSize: 13 }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <label style={{ fontSize: 11, color: C.n[600], display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" defaultChecked style={{ accentColor: C.pri[400], width: 14, height: 14 }} /> Remember me
            </label>
            <span style={{ fontSize: 11, color: C.pri[400], cursor: "pointer", fontWeight: 500 }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>Forgot password?</span>
          </div>

          {error && (
            <div style={{ fontSize: 11, color: C.danger[800], background: C.danger[50], border: `0.5px solid ${C.danger[100]}`, borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>{error}</div>
          )}

          <button onClick={submit} disabled={loading} style={{ width: "100%", padding: "12px 20px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 14, fontWeight: 500, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1, transition: "opacity 0.15s" }}>
            {loading ? "Please wait…" : "Sign in"}
          </button>

          <div style={{ textAlign: "center", fontSize: 11, color: C.n[600], marginTop: 16 }}>
            New here? <span onClick={() => { setView("signup"); setError(""); }} style={{ color: C.pri[400], cursor: "pointer", fontWeight: 500 }}>Create an account</span>
          </div>
        </div>
        <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 4, alignItems: "center" }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.pri[400] }} />
          <span style={{ fontSize: 10, color: C.n[600] }}>Offline-ready · Encrypted · HIPAA compliant</span>
        </div>
      </div>
    </div>
  );
}
