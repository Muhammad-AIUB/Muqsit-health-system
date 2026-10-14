"use client";

import { useEffect } from "react";
import { C, font } from "@/theme";
import { shadowCard } from "@/theme/styles";
import { useAuth } from "@/context/AuthContext";
import Icon from "@/components/common/Icon";
import { setTheme, userTheme, useTheme, type ThemeMode } from "@/lib/theme";

// ☀ / ☾ — light and night (physician's request, 2026-10-15). Drawn like the
// BAN / EN switch beside it, so the two read as one kind of control. The mode
// itself lives in lib/theme.ts.
export default function ThemeToggle() {
  const { user } = useAuth();
  const mode = useTheme();

  // This user's own last choice on this device; a user who never chose keeps
  // whatever the device is showing (the sign-in page's, the first paint's).
  useEffect(() => {
    const saved = userTheme(user?.id);
    if (saved) setTheme(saved, user?.id);
  }, [user?.id]);

  const opt = (value: ThemeMode, icon: "sun" | "moon", label: string) => {
    const active = mode === value;
    return (
      <button
        type="button"
        onClick={() => setTheme(value, user?.id)}
        aria-pressed={active}
        aria-label={label}
        title={label}
        style={{
          padding: "4px 8px", borderRadius: 6, cursor: "pointer", fontFamily: font, lineHeight: 1,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: active ? C.pri[50] : "transparent",
          color: active ? C.pri[600] : C.n[500],
          border: active ? `1px solid ${C.pri[400]}` : "1px solid transparent",
          boxShadow: active ? shadowCard : "none",
        }}
      >
        <Icon name={icon} size={14} />
      </button>
    );
  };

  return (
    <div role="group" aria-label="Colour mode" style={{ display: "flex", gap: 2, padding: 2, borderRadius: 8, background: C.n[100], flexShrink: 0 }}>
      {opt("light", "sun", "Light mode")}
      {opt("dark", "moon", "Night mode")}
    </div>
  );
}
