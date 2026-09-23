"use client";

import { useState } from "react";
import { C } from "@/theme";
import { useInvestigationPrefs, useSaveInvestigationGroups } from "@/hooks/useInvestigationPrefs";
import { groupTicked, newGroupProblem, toggleGroup } from "@/lib/investigationGroups";
import InvestigationDirectory from "./InvestigationDirectory";

// The "Investigations group" tab of Advised tests / investigation (physician's
// request, 2026-09-24): the doctor's own groups, each with a tick box that puts
// every test of the group into the Added list, and "+ Add new group" to make
// one — a name, and tests ticked from the same directories the Investigations
// tab shows. The rules live in lib/investigationGroups.ts.
export default function InvestigationGroups({ selected, apply }: {
  selected: string[];
  apply: (add: string[], remove: string[]) => void;
}) {
  const { groups, isLoading } = useInvestigationPrefs();
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setAdding(true)}
        style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.pri[400]}`, background: C.pri[50], color: C.pri[600], fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
      >+ Add new group</button>

      <div style={{ marginTop: 14 }}>
        {!isLoading && groups.length === 0 && (
          <div style={{ padding: "22px 12px", textAlign: "center", color: C.n[500], fontSize: 12.5 }}>No investigation groups yet.</div>
        )}
        {groups.map((g) => {
          const on = groupTicked(g, selected);
          return (
            <label key={g.name} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "9px 12px", borderRadius: 8, marginBottom: 6, cursor: "pointer", userSelect: "none", border: `0.5px solid ${on ? C.pri[400] : C.n[200]}`, background: on ? C.pri[50] : C.n[0] }}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => { const t = toggleGroup(g, selected, groups); apply(t.add, t.remove); }}
                aria-label={`Add group ${g.name}`}
                style={{ width: 15, height: 15, marginTop: 2, flexShrink: 0, accentColor: C.pri[400], cursor: "pointer" }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: on ? C.pri[600] : C.n[900] }}>{g.name}</span>
                <span style={{ display: "block", fontSize: 11.5, color: C.n[600], lineHeight: 1.4, marginTop: 2 }}>{g.tests.join(", ")}</span>
              </span>
            </label>
          );
        })}
      </div>

      {adding && <NewGroupModal onClose={() => setAdding(false)} />}
    </div>
  );
}

function NewGroupModal({ onClose }: { onClose: () => void }) {
  const { groups } = useInvestigationPrefs();
  const save = useSaveInvestigationGroups();
  const [name, setName] = useState("");
  const [tests, setTests] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const toggle = (t: string) => setTests((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const submit = async () => {
    const why = newGroupProblem(name, tests, groups);
    if (why) { setProblem(why); return; }
    setProblem(null);
    try {
      await save.mutateAsync([...groups, { name: name.trim(), tests }]);
      onClose();
    } catch (e) {
      // Stays open with everything the doctor typed and ticked.
      setProblem(`Group NOT saved: ${e instanceof Error ? e.message : "please try again."}`);
    }
  };

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{ position: "fixed", inset: 0, padding: 16, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}
    >
      <div
        role="dialog"
        aria-label="Add new group"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(720px, 100%)", maxHeight: "85vh", display: "flex", flexDirection: "column", background: C.n[0], borderRadius: 14, border: `0.5px solid ${C.n[200]}`, boxShadow: "0 12px 40px rgba(0,0,0,0.16)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `0.5px solid ${C.n[200]}` }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: C.n[900] }}>Add new group</div>
          <button onClick={onClose} aria-label="Close" style={{ width: 28, height: 28, borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: "16px 20px", overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.n[600], marginBottom: 6 }}>Name of the group</div>
          <input
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); setProblem(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
            placeholder="e.g. DM follow-up"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 8, fontSize: 13, border: `0.5px solid ${C.n[200]}`, outline: "none", background: C.n[50], color: C.n[900], fontFamily: "inherit" }}
          />
          <div style={{ fontSize: 11.5, color: C.n[600], marginTop: 8 }}>
            {tests.length === 0 ? "No tests ticked yet." : `${tests.length} test${tests.length === 1 ? "" : "s"}: ${tests.join(", ")}`}
          </div>

          <InvestigationDirectory selected={tests} onToggle={(t) => { toggle(t); setProblem(null); }} />
        </div>

        {/* One Save at the very bottom, outside the scrolling list, so it is
            always in reach: the name and the ticked tests are saved together. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50], flexShrink: 0 }}>
          {/* Beside the button that raised it, so it is seen however far the
              list was scrolled. */}
          <div role={problem ? "alert" : undefined} style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.danger[800] }}>{problem}</div>
          <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button
            onClick={() => void submit()}
            disabled={save.isPending}
            style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: save.isPending ? "default" : "pointer", fontFamily: "inherit", opacity: save.isPending ? 0.7 : 1 }}
          >{save.isPending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
