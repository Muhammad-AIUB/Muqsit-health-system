"use client";

import { useState } from "react";
import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { suggestionDB } from "@/data/suggestions";
import { patientsApi, uploadImage } from "@/lib/api";
import ExpandableField from "@/components/common/ExpandableField";

// ── Patient photo (uploads + persists to the patient record) ──
function PatientPhoto() {
  const { ptInfo, setPtInfo, ptName, currentPatientId } = useMuqsit();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const url = await uploadImage(file);
      setPtInfo((prev) => ({ ...prev, picture: url }));
      // Patient already saved? Persist the photo on the record right away.
      if (currentPatientId) await patientsApi.update(currentPatientId, { pictureUrl: url });
    } catch {
      setErr("Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!window.confirm("Remove this patient's photo?")) return;
    setBusy(true);
    setErr("");
    try {
      if (currentPatientId) await patientsApi.update(currentPatientId, { pictureUrl: null });
      setPtInfo((prev) => ({ ...prev, picture: null }));
    } catch {
      setErr("Could not remove");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 12, borderBottom: `0.5px solid ${C.n[200]}` }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <label
          style={{
            width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
            border: `2px dashed ${ptInfo.picture ? C.pri[400] : C.n[300]}`,
            background: ptInfo.picture ? "transparent" : C.n[50],
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", overflow: "hidden",
          }}
        >
          {ptInfo.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ptInfo.picture} alt={ptName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 20, color: C.n[500] }}>{busy ? "…" : "📷"}</span>
          )}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={onChange} disabled={busy} />
        </label>
        {ptInfo.picture && !busy && (
          <button
            onClick={removePhoto}
            title="Remove photo"
            style={{
              position: "absolute", top: -2, right: -2,
              width: 18, height: 18, borderRadius: "50%",
              border: `1px solid ${C.n[0]}`, background: C.danger[400], color: "#fff",
              fontSize: 11, lineHeight: 1, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: C.n[800] }}>Patient photo</div>
        <div style={{ fontSize: 10, color: err ? C.danger[800] : C.n[500], marginTop: 2 }}>
          {busy ? "Working…" : err ? err : ptInfo.picture ? "Click to change · × to remove" : "Click to upload"}
        </div>
      </div>
    </div>
  );
}

export default function LeftColumn() {
  const { leftFields, allFieldValues, setShowInvPopup, setShowOePopup } = useMuqsit();

  return (
    <div>
      <PatientPhoto />
      {leftFields.map((f) => {
        if (f.label === "Investigation report findings" || f.label === "On examination") {
          const openFn = f.label === "Investigation report findings" ? () => setShowInvPopup(true) : () => setShowOePopup(true);
          return (
            <div key={f.label} style={{ marginBottom: 2 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minHeight: 28 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: C.n[800], paddingTop: 4, cursor: "pointer" }} onClick={openFn}>{f.label}</span>
                {f.items.length === 0 && (
                  <button onClick={openFn} style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid " + C.n[300], background: "transparent", color: C.pri[400], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = C.n[300]; }}>+</button>
                )}
                {f.items.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1, alignItems: "center", paddingTop: 2 }}>
                    {f.items.map((item, idx) => (
                      <span key={idx} style={{ fontSize: 11, color: C.n[800], background: C.n[100], padding: "2px 8px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {item}
                        <button onClick={() => f.set(f.items.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: C.n[500], cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                    <button onClick={openFn} style={{ width: 18, height: 18, borderRadius: "50%", border: "1px solid " + C.n[300], background: "transparent", color: C.pri[400], fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>+</button>
                  </div>
                )}
              </div>
            </div>
          );
        }
        return (
          <ExpandableField
            key={f.label}
            label={f.label}
            items={f.items}
            setItems={f.set}
            suggestions={suggestionDB[f.sugKey || f.label] || []}
            allFields={allFieldValues}
            checkboxOptions={f.label === "Associated illness" ? ["BA", "COPD", "Hypothyroidism", "CKD", "CLD"] : undefined}
          />
        );
      })}
    </div>
  );
}
