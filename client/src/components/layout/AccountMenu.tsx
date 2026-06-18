"use client";

import { useEffect, useRef, useState } from "react";
import { C, font } from "@/theme";
import { useAuth } from "@/context/AuthContext";

// Avatar button that opens a small account menu (identity + Log out). Replaces
// the old "click the avatar = instant logout" behaviour, which was too easy to
// trigger by accident. Shared by the desktop and mobile shells.
export default function AccountMenu({ size = 28 }: { size?: number }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const initials = (user?.name || "DR").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const fullName = user?.displayName?.trim() || user?.name || "Doctor";

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={fullName}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ width: size, height: size, borderRadius: "50%", border: open ? `2px solid ${C.pri[600]}` : "none", background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: size <= 24 ? 9 : 10, fontWeight: 500, cursor: "pointer", fontFamily: font, boxSizing: "border-box" }}
      >{initials}</button>

      {open && (
        <div role="menu" style={{ position: "absolute", top: size + 8, right: 0, width: 224, background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.14)", overflow: "hidden", zIndex: 1000 }}>
          {/* Identity */}
          <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: `0.5px solid ${C.n[200]}` }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.pri[400], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.n[900], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fullName}</div>
              <div style={{ fontSize: 11, color: C.n[500], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email}</div>
            </div>
          </div>
          {/* Log out */}
          <button
            role="menuitem"
            onClick={() => { setOpen(false); logout(); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", border: "none", background: "transparent", color: C.danger[800], fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: font, textAlign: "left" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.danger[50]; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
