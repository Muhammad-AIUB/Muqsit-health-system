"use client";

import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { C } from "@/theme";
import { PERMISSION_GROUPS, PERM_LABEL_OF, type PermGroup } from "@/lib/permissions";

// Shared bits between the assistant editor and the IPD team editor. Both grant
// permission keys the same way, so they must LOOK the same — a doctor should
// not have to learn two permission UIs.

export const card: CSSProperties = {
  background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: 16,
};

export const btn = (bg: string, fg: string): CSSProperties => ({
  padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer",
  fontSize: 12, fontWeight: 500, background: bg, color: fg, fontFamily: "inherit",
});

export const toggleInSet = (setter: Dispatch<SetStateAction<Set<string>>>) => (key: string) =>
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

export const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((k) => b.has(k));

/** Checkbox grid. `groups` defaults to the assistant keys; the IPD team passes its own. */
export function PermissionGrid({
  selected, onToggle, groups = PERMISSION_GROUPS,
}: {
  selected: Set<string>;
  onToggle: (key: string) => void;
  groups?: PermGroup[];
}) {
  return (
    <>
      {groups.map((grp) => (
        <div key={grp.group} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: C.n[600], marginBottom: 6 }}>{grp.group}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
            {grp.perms.map((p) => (
              <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(p.key)} onChange={() => onToggle(p.key)} style={{ cursor: "pointer" }} />
                {p.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function MarkedChips({ keys }: { keys: string[] }) {
  if (keys.length === 0) return <div style={{ fontSize: 12, color: C.n[500] }}>Nothing marked yet.</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {keys.map((k) => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 20, background: C.pri[50], color: C.pri[600] }}>
          ✓ {PERM_LABEL_OF.get(k) ?? k}
        </span>
      ))}
    </div>
  );
}

export const prettyProfession = (p: string | null): string =>
  p ? p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";

export const contactLine = (u: { email: string; mobile: string | null; profession: string | null }) =>
  `${u.email} · ${u.mobile ?? "—"} · ${prettyProfession(u.profession)}`;
