"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminApi,
  ApiError,
  onAuthFailure,
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

  // Restore the session from the httpOnly cookie. The cookie is sent
  // automatically; if it's missing/expired, me() 401s and we stay logged out.
  useEffect(() => {
    adminApi
      .me()
      .then((u) => setUser(u.role === "admin" ? u : null))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  // A failed silent refresh (expired/revoked session — e.g. after an admin
  // force-logout) drops the user back to the sign-in screen.
  useEffect(() => onAuthFailure(() => setUser(null)), []);

  const logout = async () => {
    try { await adminApi.logout(); } catch { /* clear locally regardless */ }
    setUser(null);
  };

  if (!ready) return null;

  if (!user) return <LoginForm onLoggedIn={setUser} />;

  return <Dashboard user={user} onLogout={() => void logout()} />;
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
        // Not an admin — don't keep the session cookie around.
        try { await adminApi.logout(); } catch { /* ignore */ }
        setError("This account is not an administrator.");
        return;
      }
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
          <div style={{ fontSize: 30, marginBottom: 8 }}>🛡️</div>
          <h1 style={{ fontSize: 24, color: C.n900 }}>Muqsit Health System Admin</h1>
        </div>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 26 }}>
          <label style={lblStyle}>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={inpStyle} placeholder="Enter your email" autoComplete="off" />
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

// ── Dashboard (sidebar layout) ───────────────────────────────
const NAV = [
  { id: "primary", label: "Primary accounts", icon: "⭐" },
  { id: "secondary", label: "Secondary accounts", icon: "👥" },
  { id: "trash", label: "Trash", icon: "🗑️" },
] as const;
type NavId = (typeof NAV)[number]["id"];

function Dashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [nav, setNav] = useState<NavId>("primary");

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ── Sidebar ── */}
      <aside style={{ width: 220, flexShrink: 0, background: C.white, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: "20px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 10px", marginBottom: 28 }}>
          <div style={{ width: 30, height: 26, borderRadius: 6, background: C.pri, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>MHS+</div>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.n900 }}>Admin</span>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setNav(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                border: "none",
                textAlign: "left",
                fontSize: 13.5,
                fontWeight: nav === item.id ? 600 : 400,
                background: nav === item.id ? C.priLight : "transparent",
                color: nav === item.id ? C.priDark : C.n600,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, marginTop: 14 }}>
          <div style={{ fontSize: 12.5, color: C.n900, fontWeight: 500, padding: "0 10px", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
          <button onClick={onLogout} style={{ ...btnGhost, width: "100%" }}>Log out</button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{ flex: 1, padding: "26px 30px", overflow: "auto" }}>
        <AccountsPage mode={nav} />
      </main>
    </div>
  );
}

// ── Accounts page (all sign-ups + full details) ──────────────
const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: "#FAEEDA", fg: "#854F0B" },
  approved: { bg: "#E1F5EE", fg: "#0F6E56" },
  suspended: { bg: "#EEEEEC", fg: "#6B6B6B" },
  rejected: { bg: "#FCEBEB", fg: "#A32D2D" },
};

function AccountsPage({ mode }: { mode: NavId }) {
  const trash = mode === "trash";
  const [rows, setRows] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // No status filter → every sign-up regardless of state.
      setRows(await adminApi.listRegistrations());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Trash = soft-deleted accounts (both tiers, hence the Tier column there).
  // Primary/Secondary = live accounts of that tier.
  const visible = rows.filter((r) =>
    trash ? !!r.deletedAt : !r.deletedAt && r.accountTier === mode,
  );

  // Search rules: BMDC/registration number, name, institution code, email, phone number.
  const q = search.trim().toLowerCase();
  const filtered = q
    ? visible.filter((r) =>
        [r.registrationNo ?? "", r.name, r.institutionCode ?? "", r.email, r.mobile ?? ""].some((v) =>
          v.toLowerCase().includes(q),
        ),
      )
    : visible;

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>{trash ? "Trash" : mode === "primary" ? "Primary accounts" : "Secondary accounts"}</h1>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by BMDC number, name, institution code, email or phone…"
        style={{ ...inpStyle, maxWidth: 420, marginBottom: 16 }}
      />

      {error && <div style={errBox}>{error}</div>}

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.n50, textAlign: "left", color: C.n600 }}>
              <th style={th}>Name</th>
              <th style={th}>Profession</th>
              <th style={th}>Email</th>
              <th style={th}>Mobile</th>
              <th style={th}>Status</th>
              {trash && <th style={th}>Tier</th>}
              <th style={th}>Signed up</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td style={td} colSpan={trash ? 8 : 7}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td style={{ ...td, color: C.n500 }} colSpan={trash ? 8 : 7}>{q ? "No accounts match your search." : trash ? "Trash is empty." : `No ${mode} accounts yet.`}</td></tr>
            )}
            {!loading && filtered.map((r) => {
              const badge = STATUS_BADGE[r.approvalStatus] ?? STATUS_BADGE.pending;
              return (
                <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      {r.profilePictureUrl ? (
                        <img src={r.profilePictureUrl} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: `1px solid ${C.border}` }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.priLight, color: C.priDark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>
                          {r.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      {r.name}
                    </div>
                  </td>
                  <td style={td}>{r.profession ? PROFESSION_LABELS[r.profession] ?? r.profession : "—"}</td>
                  <td style={td}>{r.email}</td>
                  <td style={td}>{r.mobile ?? "—"}</td>
                  <td style={td}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: badge.bg, color: badge.fg }}>
                      {r.approvalStatus}
                    </span>
                  </td>
                  {trash && (
                    <td style={td}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: r.accountTier === "secondary" ? "#E6F1FB" : C.priLight, color: r.accountTier === "secondary" ? "#185FA5" : C.priDark }}>
                        {r.accountTier}
                      </span>
                    </td>
                  )}
                  <td style={td}>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td style={td}>
                    <RowActions reg={r} mode={mode} onChanged={load} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Per-row actions ──────────────────────────────────────────
// "View details" opens the print-friendly page in a new tab (admin then
// uses the browser's "Save as PDF"). The other buttons depend on which list
// the row is in (see the spec in NAV).
function RowActions({ reg, mode, onChanged }: { reg: Registration; mode: NavId; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  // Run a mutation with an optional confirm, then reload the list. Failures
  // surface as an alert (this is an internal back-office tool).
  const run = async (fn: () => Promise<unknown>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const reject = () => {
    const reason = window.prompt(`Reason for rejecting ${reg.name} (emailed to them):`);
    if (reason === null) return; // cancelled
    if (!reason.trim()) { window.alert("A rejection reason is required."); return; }
    void run(() => adminApi.reject(reg.id, reason.trim()));
  };

  const view = (
    <button onClick={() => window.open(`/accounts/${reg.id}`, "_blank", "noopener")} style={actBtn(C.white)} disabled={busy}>
      View details
    </button>
  );

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {view}

      {mode === "secondary" && reg.approvalStatus !== "approved" && (
        <button onClick={() => void run(() => adminApi.approve(reg.id))} style={actBtn(C.pri, "#fff")} disabled={busy}>Approve</button>
      )}
      {(mode === "primary" || mode === "secondary") && reg.approvalStatus !== "suspended" && (
        <button onClick={() => void run(() => adminApi.suspend(reg.id))} style={actBtn(C.warn, "#fff")} disabled={busy}>Suspend</button>
      )}
      {mode === "primary" && (
        <button onClick={() => void run(() => adminApi.setTier(reg.id, "secondary"))} style={actBtn(C.white)} disabled={busy}>Move to secondary</button>
      )}
      {mode === "secondary" && (
        <button onClick={() => void run(() => adminApi.setTier(reg.id, "primary"))} style={actBtn(C.white)} disabled={busy}>Move to primary</button>
      )}
      {(mode === "primary" || mode === "secondary") && reg.approvalStatus !== "rejected" && (
        <button onClick={reject} style={actBtn(C.white, C.dangerDark)} disabled={busy}>Reject</button>
      )}
      {(mode === "primary" || mode === "secondary") && (
        <button onClick={() => void run(() => adminApi.softDelete(reg.id), `Move ${reg.name} to Trash? They'll be signed out and can be restored later.`)} style={actBtn(C.danger, "#fff")} disabled={busy}>Delete</button>
      )}

      {mode === "trash" && (
        <>
          <button onClick={() => void run(() => adminApi.approve(reg.id))} style={actBtn(C.pri, "#fff")} disabled={busy}>Approve</button>
          <button onClick={() => void run(() => adminApi.setTier(reg.id, "primary"))} style={actBtn(C.white)} disabled={busy}>Move to primary</button>
          <button onClick={() => void run(() => adminApi.setTier(reg.id, "secondary"))} style={actBtn(C.white)} disabled={busy}>Move to secondary</button>
          <button onClick={() => void run(() => adminApi.hardDelete(reg.id), `Permanently delete ${reg.name}? This cannot be undone.`)} style={actBtn(C.danger, "#fff")} disabled={busy}>Delete permanently</button>
        </>
      )}
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
// Compact per-row action button. Pass a background (and optional text colour);
// a white background keeps the neutral bordered look, a colour fills it.
const actBtn = (bg: string, fg?: string): React.CSSProperties => ({
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${bg === C.white ? C.border : bg}`,
  background: bg,
  color: fg ?? C.n900,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
});
const tab: React.CSSProperties = { padding: "7px 16px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.white, color: C.n600, fontSize: 13, cursor: "pointer" };
const tabActive: React.CSSProperties = { background: C.priLight, borderColor: C.pri, color: C.priDark, fontWeight: 600 };
const th: React.CSSProperties = { padding: "11px 14px", fontWeight: 600, fontSize: 12 };
const td: React.CSSProperties = { padding: "11px 14px", color: C.n900 };
