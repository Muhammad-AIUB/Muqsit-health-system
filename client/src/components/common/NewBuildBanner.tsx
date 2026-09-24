"use client";

import { useEffect, useState } from "react";
import { onBuildChange } from "@/lib/api";
import { C, font } from "@/theme";

// Shown when the API's X-App-Build changes mid-session: a deploy happened and
// this tab is now an OLD client. It never reloads on its own — a doctor may be
// mid-consultation with an unsaved form — it offers, calmly, once.
export default function NewBuildBanner() {
  const [stale, setStale] = useState(false);
  useEffect(() => onBuildChange(() => setStale(true)), []);
  if (!stale) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        background: C.warn[50],
        color: C.warn[800],
        borderTop: `1px solid ${C.warn[100]}`,
        fontFamily: font,
        fontSize: 13,
      }}
    >
      <span>A new version of Muqsit is available. Finish what you are doing, then reload.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: "4px 12px",
          borderRadius: 6,
          border: `1px solid ${C.warn[600]}`,
          background: "#fff",
          color: C.warn[800],
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Reload
      </button>
      <button
        type="button"
        onClick={() => setStale(false)}
        aria-label="Dismiss"
        style={{ background: "none", border: "none", color: C.warn[600], cursor: "pointer" }}
      >
        Later
      </button>
    </div>
  );
}
