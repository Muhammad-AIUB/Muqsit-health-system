"use client";

import { C } from "@/theme";
import { useMedCare } from "@/context/MedCareContext";
import { suggestionDB } from "@/data/suggestions";
import ExpandableField from "@/components/common/ExpandableField";

export default function LeftColumn() {
  const { leftFields, allFieldValues, setShowInvPopup, setShowOePopup } = useMedCare();

  return (
    <div>
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
        return <ExpandableField key={f.label} label={f.label} items={f.items} setItems={f.set} suggestions={suggestionDB[f.sugKey || f.label] || []} allFields={allFieldValues} />;
      })}
    </div>
  );
}
