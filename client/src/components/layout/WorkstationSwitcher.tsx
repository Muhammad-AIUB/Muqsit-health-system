"use client";

import { useEffect } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { useWorkstations } from "@/hooks/useWorkstations";

// The "Your workstations" picker. A secondary user works under the doctors they
// assist; a primary user can also assist others. This left panel lets them
// choose which practice to work in — own workspace on top, assisted below.
// Auto-selects when there's only one; forces a choice when there are several.
export default function WorkstationSwitcher() {
  const { activeWorkstationId, showWorkstations, setShowWorkstations, selectWorkstation } = useMuqsit();
  const { data: workstations = [], isLoading } = useWorkstations();

  useEffect(() => {
    if (isLoading || activeWorkstationId || workstations.length === 0) return;
    if (workstations.length === 1) selectWorkstation(workstations[0].doctorId);
    else setShowWorkstations(true);
  }, [isLoading, workstations, activeWorkstationId, selectWorkstation, setShowWorkstations]);

  if (!showWorkstations) return null;
  const canClose = !!activeWorkstationId; // can't dismiss until a workstation is chosen

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", fontFamily: font }}>
      <div onClick={canClose ? () => setShowWorkstations(false) : undefined} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }} />
      <aside style={{ position: "relative", width: 264, height: "100%", background: C.n[0], borderRight: `1px solid ${C.n[200]}`, boxShadow: "4px 0 24px rgba(0,0,0,0.08)", padding: "22px 16px", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.n[900], textDecoration: "underline" }}>Your workstations</div>
          {canClose && <button onClick={() => setShowWorkstations(false)} title="Close" style={{ border: "none", background: "transparent", fontSize: 20, lineHeight: 1, color: C.n[500], cursor: "pointer" }}>×</button>}
        </div>

        {workstations.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.n[500] }}>No workstation available.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {workstations.map((w) => {
              const active = w.doctorId === activeWorkstationId;
              return (
                <button
                  key={w.doctorId}
                  onClick={() => selectWorkstation(w.doctorId)}
                  style={{
                    textAlign: "center", padding: "18px 14px", borderRadius: 12, cursor: "pointer", fontFamily: font,
                    border: `2px solid ${active ? C.pri[400] : C.n[900]}`,
                    background: active ? C.pri[50] : C.n[0],
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, color: active ? C.pri[600] : C.n[900], textDecoration: "underline" }}>{w.name}</div>
                  <div style={{ fontSize: 10, color: C.n[500], marginTop: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {w.role === "owner" ? "Your workspace" : "Assistant"}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}

// Small pill shown in the top bar — the active practice + a click to switch.
// Hidden when the user has only one workstation (nothing to switch to).
export function WorkstationIndicator() {
  const { activeWorkstationId, setShowWorkstations } = useMuqsit();
  const { data: workstations = [] } = useWorkstations();
  if (workstations.length < 2) return null;

  const active = workstations.find((w) => w.doctorId === activeWorkstationId);
  return (
    <button
      onClick={() => setShowWorkstations(true)}
      title="Switch workstation"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, border: `1px solid ${C.n[200]}`, background: C.n[0], color: C.n[800], fontSize: 11.5, fontWeight: 500, cursor: "pointer", fontFamily: font, maxWidth: 200 }}
    >
      <span style={{ fontSize: 12 }}>🏥</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{active?.name ?? "Choose workstation"}</span>
      <span style={{ color: C.n[400], fontSize: 9 }}>▾</span>
    </button>
  );
}
