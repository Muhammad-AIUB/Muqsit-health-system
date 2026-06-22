"use client";

import { useState } from "react";
import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { useAddSupervisor, useRemoveSupervisor, useSupervisors } from "@/hooks/useChat";
import { ApiError } from "@/lib/api";
import Pill from "@/components/common/Pill";

// Real "Supervising doctor list" for the loaded patient (4.docx). The owner
// assigns other registered doctors by email / mobile; they then get access to
// this patient's chat and see it under their "Message" tab. The owner doctor is
// always shown as Primary.
export default function SupervisingDoctors() {
  const { currentPatientId, ptName, isAssistantMode } = useMuqsit();
  const { data: supervisors = [], isLoading } = useSupervisors(currentPatientId);
  const add = useAddSupervisor(currentPatientId);
  const remove = useRemoveSupervisor(currentPatientId);

  const [showAdd, setShowAdd] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [err, setErr] = useState("");

  // Assistants can view but not manage; only the owning doctor assigns.
  const canManage = !isAssistantMode;

  if (!currentPatientId) {
    return (
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
        Supervising doctor list
        <div style={{ fontSize: 12, color: C.n[500], fontWeight: 400, marginTop: 10 }}>
          Load or save a patient first to assign supervising doctors.
        </div>
      </div>
    );
  }

  const submit = async () => {
    const id = identifier.trim();
    if (!id) { setErr("Enter an email or mobile number."); return; }
    try {
      await add.mutateAsync(id);
      setIdentifier(""); setShowAdd(false); setErr("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not add the doctor.");
    }
  };

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Supervising doctor list</div>
      <div style={{ background: C.n[0], border: "0.5px solid " + C.n[200], borderRadius: 10, padding: 16 }}>
        {/* Owner */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: supervisors.length ? "0.5px solid " + C.n[200] : "none" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.pri[50], color: C.pri[600], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>★</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{isAssistantMode ? "Owning doctor" : "You"}</div>
            <div style={{ fontSize: 10, color: C.n[600] }}>Primary — owns {ptName.trim() || "this patient"}</div>
          </div>
          <Pill bg={C.pri[50]} fg={C.pri[600]}>Primary</Pill>
        </div>

        {/* Assigned supervisors */}
        {isLoading ? (
          <div style={{ fontSize: 12, color: C.n[500], padding: "10px 0" }}>Loading…</div>
        ) : (
          supervisors.map((d, i) => (
            <div key={d.doctorId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < supervisors.length - 1 ? "0.5px solid " + C.n[200] : "none" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.info[50], color: C.info[800], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500 }}>
                {d.name.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{d.name}</div>
                <div style={{ fontSize: 10, color: C.n[600] }}>{d.email} · Supervising</div>
              </div>
              {canManage && (
                <button
                  onClick={() => { if (window.confirm(`Remove ${d.name} from this patient?`)) remove.mutate(d.doctorId); }}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "0.5px solid " + C.n[200], background: C.n[0], color: C.danger[800], fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Remove
                </button>
              )}
            </div>
          ))
        )}

        {canManage && !showAdd && (
          <button onClick={() => { setShowAdd(true); setErr(""); }} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 6, border: "1px dashed " + C.n[300], background: "transparent", color: C.pri[400], fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            + Add supervising doctor
          </button>
        )}

        {canManage && showAdd && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                autoFocus
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                placeholder="Doctor's email or mobile"
                style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "0.5px solid " + C.n[200], fontSize: 12, outline: "none", fontFamily: "inherit" }}
              />
              <button onClick={submit} disabled={add.isPending} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", opacity: add.isPending ? 0.6 : 1 }}>
                {add.isPending ? "Adding…" : "Add"}
              </button>
              <button onClick={() => { setShowAdd(false); setErr(""); setIdentifier(""); }} style={{ padding: "8px 14px", borderRadius: 6, border: "0.5px solid " + C.n[200], background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
            {err && <div style={{ fontSize: 11, color: C.danger[800] }}>{err}</div>}
            <div style={{ fontSize: 10.5, color: C.n[500] }}>The doctor must already have a registered account.</div>
          </div>
        )}
      </div>
    </div>
  );
}
