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
  const [selected, setSelected] = useState<Registration | null>(null);

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

  // Primary/Secondary show non-rejected accounts of that tier; Trash shows
  // only rejected ones (both tiers, hence the Tier column there).
  const visible = rows.filter((r) =>
    trash ? r.approvalStatus === "rejected" : r.approvalStatus !== "rejected" && r.accountTier === mode,
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
              <th style={th}></th>
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
                    <button onClick={() => setSelected(r)} style={btnGhost}>View details</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <AccountDetailsModal
          reg={selected}
          onClose={() => setSelected(null)}
          onDone={() => { setSelected(null); void load(); }}
        />
      )}
    </div>
  );
}

// ── Account details modal (full submission + approve/reject) ─
function AccountDetailsModal({ reg, onClose, onDone }: { reg: Registration; onClose: () => void; onDone: () => void }) {
  const badge = STATUS_BADGE[reg.approvalStatus] ?? STATUS_BADGE.pending;
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

  const suspend = async () => {
    setBusy(true); setError("");
    try { await adminApi.suspend(reg.id); onDone(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Failed to suspend"); }
    finally { setBusy(false); }
  };

  const moveTier = async () => {
    const next = reg.accountTier === "secondary" ? "primary" : "secondary";
    setBusy(true); setError("");
    try { await adminApi.setTier(reg.id, next); onDone(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Failed to change tier"); }
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
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {reg.profilePictureUrl ? (
              <img src={reg.profilePictureUrl} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: `1px solid ${C.border}` }} />
            ) : (
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: C.priLight, color: C.priDark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 600 }}>
                {reg.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h2 style={{ fontSize: 19, color: C.n900 }}>{reg.name}</h2>
              <p style={{ color: C.n600, fontSize: 13 }}>
                {reg.profession ? PROFESSION_LABELS[reg.profession] ?? reg.profession : "—"} · {reg.specialty ?? "—"}{" "}
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 999, background: badge.bg, color: badge.fg, marginLeft: 4 }}>
                  {reg.approvalStatus}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 999, background: reg.accountTier === "secondary" ? "#E6F1FB" : C.priLight, color: reg.accountTier === "secondary" ? "#185FA5" : C.priDark, marginLeft: 4 }}>
                  {reg.accountTier}
                </span>
              </p>
            </div>
          </div>
          <button onClick={onClose} style={btnGhost}>Close</button>
        </div>

        <h3 style={{ fontSize: 13, color: C.n600, marginTop: 22, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>Submitted information</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", fontSize: 13 }}>
          <Detail label="Email" value={`${reg.email}${reg.emailVerified ? " (verified)" : " (unverified)"}`} />
          <Detail label="Mobile" value={reg.mobile} />
          <Detail label="Profession" value={reg.profession ? PROFESSION_LABELS[reg.profession] ?? reg.profession : null} />
          <Detail label="Registration no" value={reg.registrationNo} />
          <Detail label="NID no" value={reg.nidNo} />
          <Detail label="Designation" value={reg.designation} />
          <Detail label="Specialty" value={reg.specialty} />
          <Detail label="Institution code" value={reg.institutionCode} />
          <Detail label="Signed up" value={new Date(reg.createdAt).toLocaleString()} />
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
          <div style={{ ...errBox, marginTop: 16 }}>Rejection reason: {reg.rejectionReason}</div>
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
          <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
            {reg.approvalStatus !== "approved" && (
              <button onClick={approve} disabled={busy} style={{ ...btnPri, opacity: busy ? 0.7 : 1 }}>Approve</button>
            )}
            {reg.approvalStatus !== "suspended" && (
              <button onClick={suspend} disabled={busy} style={{ ...btnPri, background: C.warn, opacity: busy ? 0.7 : 1 }}>Suspend</button>
            )}
            {reg.approvalStatus !== "rejected" && (
              <button onClick={() => setRejecting(true)} disabled={busy} style={btnDanger}>Reject</button>
            )}
            <button onClick={moveTier} disabled={busy} style={{ ...btnGhost, marginLeft: "auto", padding: "10px 20px", fontSize: 13 }}>
              Move to {reg.accountTier === "secondary" ? "primary" : "secondary"}
            </button>
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
