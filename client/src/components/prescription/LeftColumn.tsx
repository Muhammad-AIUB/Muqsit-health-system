"use client";

import { useState } from "react";
import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { suggestionDB } from "@/data/suggestions";
import ExpandableField from "@/components/common/ExpandableField";
import DrugHistoryField from "@/components/prescription/DrugHistoryField";

export default function LeftColumn() {
  const { leftFields, allFieldValues, setShowInvPopup, setShowOePopup, invImages } = useMuqsit();
  // Image opened from a finding that has an attached report.
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <div>
      {leftFields.map((f) => {
        if (f.label === "Drug history") {
          return (
            <DrugHistoryField
              key={f.label}
              items={f.items}
              setItems={f.set}
              suggestions={suggestionDB[f.sugKey || f.label] || []}
            />
          );
        }
        if (f.label === "Investigation report findings" || f.label === "On examination") {
          const openFn = f.label === "Investigation report findings" ? () => setShowInvPopup(true) : () => setShowOePopup(true);
          return (
            <div key={f.label} style={{ marginBottom: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 28 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: C.n[800], cursor: "pointer" }} onClick={openFn}>{f.label}</span>
                <button onClick={openFn} style={{ width: 20, height: 20, borderRadius: "50%", border: "1px solid " + C.n[300], background: "transparent", color: C.pri[400], fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = C.n[300]; }}>+</button>
                {f.items.length > 0 && (
                  <button onClick={openFn} style={{ fontSize: 11, color: C.pri[600], background: C.pri[50], border: `0.5px solid ${C.pri[100]}`, borderRadius: 6, padding: "2px 10px", cursor: "pointer", fontFamily: "inherit" }}>✎ Edit</button>
                )}
              </div>
              {f.items.length > 0 && (() => {
                // Uploaded report images aren't listed here — only real findings.
                const textItems = f.items.filter((it) => it.indexOf("[image attached]") < 0);
                const imageCount = f.items.length - textItems.length;
                return (
                  <div style={{ paddingLeft: 14, marginTop: 1, marginBottom: 4 }}>
                    {textItems.map((item, idx) => {
                      // A finding "dd/mm/yyyy:Test:value" may have an attached
                      // report image keyed by "dd/mm/yyyy:Test".
                      const parts = item.split(":");
                      const imgUrl = parts.length >= 2 ? invImages[parts[0] + ":" + parts[1]] : undefined;
                      return (
                        <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, color: C.n[800], padding: "1.5px 0" }}>
                          <span style={{ color: C.n[500], lineHeight: 1.45, flexShrink: 0 }}>•</span>
                          <span
                            onClick={imgUrl ? () => setLightbox(imgUrl) : undefined}
                            title={imgUrl ? "View attached report image" : undefined}
                            style={{ flex: 1, lineHeight: 1.45, cursor: imgUrl ? "pointer" : "default", color: imgUrl ? C.info[800] : C.n[800], textDecoration: imgUrl ? "underline" : "none" }}
                          >{item}{imgUrl ? " 📎" : ""}</span>
                        </div>
                      );
                    })}
                    {imageCount > 0 && (
                      <div
                        onClick={f.label === "Investigation report findings" ? () => setShowInvPopup(true) : undefined}
                        style={{ fontSize: 11, color: C.info[800], padding: "1.5px 0", cursor: f.label === "Investigation report findings" ? "pointer" : "default", textDecoration: f.label === "Investigation report findings" ? "underline" : "none" }}
                      >📎 {imageCount} report image{imageCount > 1 ? "s" : ""} attached</div>
                    )}
                  </div>
                );
              })()}
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

      {/* Report image lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 24 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Report" style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()} />
          <button
            onClick={() => setLightbox(null)}
            style={{ position: "fixed", top: 18, right: 22, width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.92)", color: C.n[900], fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >×</button>
        </div>
      )}
    </div>
  );
}
