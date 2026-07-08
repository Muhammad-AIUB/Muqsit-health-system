"use client";

import { useEffect } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkstations } from "@/hooks/useWorkstations";

// The "Your workstations" picker. A secondary user works under the doctors they
// assist; a primary user can also assist others. This left panel lets them
// choose which practice to work in — own workspace on top, assisted below.
// Auto-selects when there's only one; forces a choice when there are several.
export default function WorkstationSwitcher() {
  const { activeWorkstationId, showWorkstations, setShowWorkstations, selectWorkstation } = useMuqsit();
  const { logout } = useAuth();
  const { data: workstations = [], isLoading, isSuccess, isError } = useWorkstations();

  useEffect(() => {
    if (isLoading || activeWorkstationId || workstations.length === 0) return;
    if (workstations.length === 1) selectWorkstation(workstations[0]);
    else setShowWorkstations(true);
  }, [isLoading, workstations, activeWorkstationId, selectWorkstation, setShowWorkstations]);

  // A fetch failure is handled inside useWorkstations (silent retries with
  // backoff — the query never errors out to the UI). Render nothing while the
  // list isn't loaded yet; the app stays fully usable in the meantime.
  if (isError) return null;

  // A secondary user who isn't anyone's assistant has nowhere to work — the whole
  // app is blurred behind an upgrade message (they can only be added as an
  // assistant, or purchase the account). Only after a SUCCESSFUL fetch that
  // really returned zero workstations.
  if (isSuccess && workstations.length === 0) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: font, background: "rgba(248,248,246,0.55)", backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)" }}>
        <div style={{ maxWidth: 560, textAlign: "center", background: C.n[0], border: `1px solid ${C.n[200]}`, borderRadius: 16, boxShadow: "0 18px 50px rgba(0,0,0,0.18)", padding: "30px 28px" }}>
          <div style={{ fontSize: 30, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#ED1C24", lineHeight: 1.5 }}>
            You are currently in secondary account holder. You can only use it as assistant under primary account holder. You can also purchase it to use its full potential.
          </div>
          <div style={{ fontSize: 12.5, color: C.n[500], marginTop: 14 }}>
            Ask a primary doctor to add you as their assistant, or upgrade your account.
          </div>
          <button onClick={() => void logout()} style={{ marginTop: 18, padding: "9px 22px", borderRadius: 8, border: `1px solid ${C.n[200]}`, background: C.n[0], color: C.n[800], fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: font }}>Log out</button>
        </div>
      </div>
    );
  }

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
                  onClick={() => selectWorkstation(w)}
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
