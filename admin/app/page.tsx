"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminApi,
  ApiError,
  clearToken,
  getToken,
  setToken,
  PROFESSION_LABELS,
  type AuthUser,
  type Registration,
} from "@/lib/api";

const C = {
  pri: "#1D9E75",
  priDark: "#0F6E56",
  priLight: "#E1F5EE",
  danger: "#E24B4A",
  dangerDark: "#A32D2D",
  dangerLight: "#FCEBEB",
  warn: "#EF9F27",
  warnLight: "#FAEEDA",
  border: "#E5E5E3",
  n50: "#F8F8F6",
  n500: "#999",
  n600: "#6B6B6B",
  n900: "#1A1A1A",
  white: "#fff",
};

export default function AdminApp() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }
    adminApi
      .me()
      .then((u) => {
        if (u.role === "admin") setUser(u);
        else clearToken();
      })
      .catch(() => clearToken())
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  if (!user) return <LoginForm onLoggedIn={setUser} />;

  return <Dashboard user={user} onLogout={() => { clearToken(); setUser(null); }} />;
}

// ── Login ────────────────────────────────────────────────────
function LoginForm({ onLoggedIn }: { onLoggedIn: (u: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await adminApi.login(email.trim(), password);
      if (res.user.role !== "admin") {
        setError("This account is not an administrator.");
        return;
      }
      setToken(res.accessToken);
      onLoggedIn(res.user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Login failed. Is the API running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, color: C.n900 }}>Muqsit Health System Admin</h1>
          <p style={{ color: C.n600, fontSize: 13 }}>Sign in to review registrations</p>
        </div>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 26 }}>
          <label style={lblStyle}>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={inpStyle} placeholder="admin@muqsit.local" />
          <label style={{ ...lblStyle, marginTop: 14 }}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={inpStyle} placeholder="••••••••" />
          {error && <div style={errBox}>{error}</div>}
          <button onClick={submit} disabled={loading} style={{ ...btnPri, width: "100%", marginTop: 18, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Please wait…" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────
const STATUSES = ["pending", "approved", "rejected"] as const;

function Dashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("pending");
  const [rows, setRows] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Registration | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await adminApi.listRegistrations(status));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load registrations");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="app-root">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1>Registrations</h1>
          <p style={{ color: C.n600, fontSize: 13 }}>Review and approve healthcare professional sign-ups</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: C.n600 }}>{user.name}</span>
          <button onClick={onLogout} style={btnGhost}>Log out</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)} style={{ ...tab, ...(status === s ? tabActive : {}) }}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {error && <div style={errBox}>{error}</div>}

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.n50, textAlign: "left", color: C.n600 }}>
              <th style={th}>Name</th>
              <th style={th}>Profession</th>
              <th style={th}>Email</th>
              <th style={th}>Mobile</th>
              <th style={th}>Reg. no</th>
              <th style={th}>Email verified</th>
              <th style={th}>Submitted</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td style={td} colSpan={8}>Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td style={{ ...td, color: C.n500 }} colSpan={8}>No {status} registrations.</td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={td}>{r.name}</td>
                <td style={td}>{r.profession ? PROFESSION_LABELS[r.profession] ?? r.profession : "—"}</td>
                <td style={td}>{r.email}</td>
                <td style={td}>{r.mobile ?? "—"}</td>
                <td style={td}>{r.registrationNo ?? "—"}</td>
                <td style={td}>{r.emailVerified ? "✓" : "✗"}</td>
                <td style={td}>{new Date(r.createdAt).toLocaleDateString()}</td>
                <td style={td}>
                  <button onClick={() => setSelected(r)} style={btnGhost}>Review</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <ReviewModal
          reg={selected}
          onClose={() => setSelected(null)}
          onDone={() => { setSelected(null); void load(); }}
        />
      )}
    </div>
  );
}

// ── Review modal ─────────────────────────────────────────────
function ReviewModal({ reg, onClose, onDone }: { reg: Registration; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const approve = async () => {
    setBusy(true); setError("");
    try { await adminApi.approve(reg.id); onDone(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Failed to approve"); }
    finally { setBusy(false); }
  };

  const reject = async () => {
    if (!reason.trim()) { setError("Please enter a reason"); return; }
    setBusy(true); setError("");
    try { await adminApi.reject(reg.id, reason.trim()); onDone(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Failed to reject"); }
    finally { setBusy(false); }
  };

  const docs: { label: string; url: string | null }[] = [
    { label: "Profile picture", url: reg.profilePictureUrl },
    { label: "Registration / qualification certificate", url: reg.registrationCertUrl },
    { label: "NID front", url: reg.nidFrontUrl },
    { label: "NID back", url: reg.nidBackUrl },
  ];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, width: 680, maxHeight: "88vh", overflow: "auto", padding: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div>
            <h2 style={{ fontSize: 19, color: C.n900 }}>{reg.name}</h2>
            <p style={{ color: C.n600, fontSize: 13 }}>{reg.profession ? PROFESSION_LABELS[reg.profession] ?? reg.profession : "—"} · {reg.specialty ?? "—"}</p>
          </div>
          <button onClick={onClose} style={btnGhost}>Close</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginTop: 18, fontSize: 13 }}>
          <Detail label="Email" value={`${reg.email}${reg.emailVerified ? " (verified)" : " (unverified)"}`} />
          <Detail label="Mobile" value={reg.mobile} />
          <Detail label="Registration no" value={reg.registrationNo} />
          <Detail label="NID no" value={reg.nidNo} />
          <Detail label="Designation" value={reg.designation} />
          <Detail label="Status" value={reg.approvalStatus} />
        </div>

        <h3 style={{ fontSize: 13, color: C.n600, marginTop: 22, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>Documents</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {docs.map((d) => (
            <div key={d.label}>
              <div style={{ fontSize: 12, color: C.n600, marginBottom: 6 }}>{d.label}</div>
              {d.url ? (
                <a href={d.url} target="_blank" rel="noreferrer">
                  <img src={d.url} alt={d.label} style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}` }} />
                </a>
              ) : (
                <div style={{ height: 150, borderRadius: 8, border: `1px dashed ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.n500, fontSize: 12 }}>Not provided</div>
              )}
            </div>
          ))}
        </div>

        {reg.rejectionReason && (
          <div style={{ ...errBox, marginTop: 16 }}>Previously rejected: {reg.rejectionReason}</div>
        )}
        {error && <div style={{ ...errBox, marginTop: 16 }}>{error}</div>}

        {rejecting ? (
          <div style={{ marginTop: 18 }}>
            <label style={lblStyle}>Rejection reason</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} style={{ ...inpStyle, resize: "vertical" }} placeholder="Explain why this registration is being rejected…" />
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={reject} disabled={busy} style={{ ...btnDanger, opacity: busy ? 0.7 : 1 }}>Confirm rejection</button>
              <button onClick={() => setRejecting(false)} style={btnGhost}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button onClick={approve} disabled={busy} style={{ ...btnPri, opacity: busy ? 0.7 : 1 }}>Approve</button>
            <button onClick={() => setRejecting(true)} disabled={busy} style={btnDanger}>Reject</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.n500, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ color: C.n900 }}>{value ?? "—"}</div>
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────
const lblStyle: React.CSSProperties = { fontSize: 12, color: C.n600, display: "block", marginBottom: 5 };
const inpStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const errBox: React.CSSProperties = { fontSize: 12, color: C.dangerDark, background: C.dangerLight, borderRadius: 8, padding: "8px 12px", marginTop: 12 };
const btnPri: React.CSSProperties = { padding: "10px 20px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: "10px 20px", borderRadius: 8, border: "none", background: C.danger, color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.n900, fontSize: 12.5, fontWeight: 500, cursor: "pointer" };
const tab: React.CSSProperties = { padding: "7px 16px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.white, color: C.n600, fontSize: 13, cursor: "pointer" };
const tabActive: React.CSSProperties = { background: C.priLight, borderColor: C.pri, color: C.priDark, fontWeight: 600 };
const th: React.CSSProperties = { padding: "11px 14px", fontWeight: 600, fontSize: 12 };
const td: React.CSSProperties = { padding: "11px 14px", color: C.n900 };
