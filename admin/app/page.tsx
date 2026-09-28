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
  const [showPw, setShowPw] = useState(false);
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
      <div style={{ width: "100%", maxWidth: 380, padding: "0 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22 }}>
          <BrandMark size={40} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.n900, marginTop: 12 }}>Muqsit Health System</h1>
          <div style={{ fontSize: 13, color: C.n600, marginTop: 2 }}>Admin console</div>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (!loading) void submit(); }}
          style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)" }}
        >
          <label htmlFor="admin-email" style={lblStyle}>Email</label>
          <input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inpStyle} autoComplete="username" autoFocus required />
          <label htmlFor="admin-password" style={{ ...lblStyle, marginTop: 14 }}>Password</label>
          <div style={{ position: "relative" }}>
            <input id="admin-password" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inpStyle, paddingRight: 42 }} autoComplete="current-password" required />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
              title={showPw ? "Hide password" : "Show password"}
              style={eyeBtn}
            >
              <EyeIcon off={showPw} />
            </button>
          </div>
          {error && <div role="alert" style={errBox}>{error}</div>}
          <button type="submit" disabled={loading} style={{ ...btnPri, width: "100%", marginTop: 18, padding: "11px 20px", fontSize: 14, opacity: loading ? 0.7 : 1, cursor: loading ? "wait" : "pointer" }}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

// The "MHS+" tile — one brand mark for the login screen and the sidebar.
function BrandMark({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size / 4.5), background: C.pri, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.3), fontWeight: 700, letterSpacing: "-0.02em", flexShrink: 0 }}>
      MHS+
    </div>
  );
}

// Eye / eye-with-slash, drawn inline so the admin app needs no icon library.
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

// ── Dashboard (sidebar layout) ───────────────────────────────
const NAV = [
  { id: "premium", label: "Premium accounts" },
  { id: "primary", label: "Primary accounts" },
  { id: "secondary", label: "Secondary accounts" },
  { id: "trash", label: "Trash" },
] as const;
type NavId = (typeof NAV)[number]["id"];

// Line icons (24-unit grid, currentColor) so the nav follows its text colour.
const NAV_ICON: Record<NavId, React.ReactNode> = {
  premium: <path d="M6 3h12l4 6-10 12L2 9z M2 9h20" />,
  primary: <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />,
  secondary: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8" />,
  trash: <path d="M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />,
};

// Stored dates are shown dd/mm/yyyy across the product.
const ddmmyyyy = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

function Dashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [nav, setNav] = useState<NavId>("primary");

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ── Sidebar ── */}
      <aside style={{ width: 220, flexShrink: 0, background: C.white, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: "20px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 10px", marginBottom: 28 }}>
          <BrandMark size={30} />
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
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                {NAV_ICON[item.id]}
              </svg>
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.n900 }}>{NAV.find((n) => n.id === mode)?.label}</h1>
        {!loading && (
          <span style={{ fontSize: 13, color: C.n600, fontVariantNumeric: "tabular-nums" }}>
            {q ? `${filtered.length} of ${visible.length}` : visible.length} {visible.length === 1 ? "account" : "accounts"}
          </span>
        )}
      </div>

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
                      {(() => {
                        const tc = r.accountTier === "secondary" ? { bg: "#E6F1FB", fg: "#185FA5" }
                          : r.accountTier === "premium" ? { bg: "#F3EAFB", fg: "#7B3FB3" }
                          : { bg: C.priLight, fg: C.priDark };
                        return (
                          <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: tc.bg, color: tc.fg }}>
                            {r.accountTier}
                          </span>
                        );
                      })()}
                    </td>
                  )}
                  <td style={{ ...td, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{ddmmyyyy(r.createdAt)}</td>
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

  const view = (
    <button onClick={() => window.open(`/accounts/${reg.id}`, "_blank", "noopener")} style={actBtn(C.white)} disabled={busy}>
      View details
    </button>
  );

  // Live tiers (premium / primary / secondary) share the same action set; only
  // the "Move to …" targets differ (you can't move a row into the tier it's
  // already in). Trash has its own set below.
  const isLive = mode === "premium" || mode === "primary" || mode === "secondary";
  const targets = TIERS.filter((t) => mode === "trash" || t !== mode);

  // Every tier change revokes the account's sessions (server setTier), and
  // secondary locks the doctor out of their own practice — confirm both.
  const moveTo = (tier: Tier) => {
    const lockout = tier === "secondary" ? " Secondary accounts cannot open their own practice until they are upgraded again." : "";
    void run(
      () => adminApi.setTier(reg.id, tier),
      `Move ${reg.name} to ${TIER_LABEL[tier]}? They will be signed out on every device.${lockout}`,
    );
  };

  const moveSelect = (
    <select
      value=""
      disabled={busy}
      aria-label={`Move ${reg.name} to another tier`}
      onChange={(e) => { if (e.target.value) moveTo(e.target.value as Tier); }}
      style={actSelect}
    >
      <option value="">{mode === "trash" ? "Restore to…" : "Move to…"}</option>
      {targets.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
    </select>
  );

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {view}

      {/* Any not-yet-approved live account (pending, or suspended — setTier
          deliberately keeps a suspension) needs Approve to be reinstated. */}
      {((isLive && reg.approvalStatus !== "approved") || mode === "trash") && (
        <button onClick={() => void run(() => adminApi.approve(reg.id))} style={actBtn(C.pri, "#fff")} disabled={busy}>Approve</button>
      )}
      {moveSelect}
      {isLive && reg.approvalStatus !== "suspended" && (
        <button
          onClick={() => void run(() => adminApi.suspend(reg.id), `Suspend ${reg.name}? They will be signed out on every device right away.`)}
          style={actOutline("#854F0B")}
          disabled={busy}
        >
          Suspend
        </button>
      )}
      {isLive && (
        <button onClick={() => void run(() => adminApi.softDelete(reg.id), `Move ${reg.name} to Trash? They'll be signed out and can be restored later.`)} style={actOutline(C.dangerDark)} disabled={busy}>Delete</button>
      )}
      {mode === "trash" && (
        <button onClick={() => void run(() => adminApi.hardDelete(reg.id), `Permanently delete ${reg.name}? This cannot be undone.`)} style={actOutline(C.dangerDark)} disabled={busy}>Delete permanently</button>
      )}
    </div>
  );
}

const TIERS = ["premium", "primary", "secondary"] as const;
type Tier = (typeof TIERS)[number];
const TIER_LABEL: Record<Tier, string> = { premium: "Premium", primary: "Primary", secondary: "Secondary" };

// ── Shared styles ────────────────────────────────────────────
const lblStyle: React.CSSProperties = { fontSize: 12, color: C.n600, display: "block", marginBottom: 5 };
const inpStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const eyeBtn: React.CSSProperties = { position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 6, background: "transparent", color: C.n600, cursor: "pointer" };
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
// Outlined action (text + border in one colour) for actions that should not
// shout on every row: Suspend, Delete.
const actOutline = (color: string): React.CSSProperties => ({ ...actBtn(C.white), color, borderColor: color + "55" });
const actSelect: React.CSSProperties = { ...actBtn(C.white), padding: "5px 8px", fontFamily: "inherit", outline: "none" };
const tab: React.CSSProperties ={ padding: "7px 16px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.white, color: C.n600, fontSize: 13, cursor: "pointer" };
const tabActive: React.CSSProperties = { background: C.priLight, borderColor: C.pri, color: C.priDark, fontWeight: 600 };
const th: React.CSSProperties = { padding: "11px 14px", fontWeight: 600, fontSize: 12 };
const td: React.CSSProperties = { padding: "11px 14px", color: C.n900 };
