"use client";

import type { ReactNode } from "react";
import { C, colorOf, font } from "@/theme";
import { useMedCare } from "@/context/MedCareContext";
import { researchPatients } from "@/data/patients";

export default function ResearchView() {
  const { rcQuery, setRcQuery, rcFilter, rcSelected, setRcSelected } = useMedCare();

  const q = rcQuery.trim().toLowerCase();
  const rcResults = q.length < 1 ? [] : researchPatients.filter((p) => {
    if (rcFilter === "disease") return p.diseases.some((d) => d.toLowerCase().includes(q));
    if (rcFilter === "tags") return p.tags.some((t) => t.toLowerCase().includes(q));
    return p.diseases.some((d) => d.toLowerCase().includes(q)) || p.tags.some((t) => t.toLowerCase().includes(q));
  });
  const allSelected = rcResults.length > 0 && rcResults.every((p) => rcSelected.has(p.id));

  const highlight = (text: string): ReactNode => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return <span>{text.slice(0, idx)}<mark style={{ background: C.warn[100], color: C.warn[900], borderRadius: 2, padding: "0 1px" }}>{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</span>;
  };

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Research Companion</div>
      <div style={{ fontSize: 12, color: C.n[600], marginBottom: 16 }}>Find patients by disease, tags, or both</div>

      {/* Search bar */}
      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 15, color: C.n[400] }}>🔍</span>
        <input
          value={rcQuery}
          onChange={(e) => { setRcQuery(e.target.value); setRcSelected(new Set()); }}
          placeholder="Search by disease or tag…"
          style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: C.n[900], background: "transparent", fontFamily: font }}
          autoFocus
        />
        {rcQuery && <button onClick={() => { setRcQuery(""); setRcSelected(new Set()); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.n[400], fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
      </div>

      {/* Results */}
      {q.length > 0 && (
        <div>
          {rcResults.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.n[400], fontSize: 12 }}>No patients found for &quot;{rcQuery}&quot;</div>
          ) : (
            <div>
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={allSelected} onChange={(e) => {
                      if (e.target.checked) setRcSelected(new Set(rcResults.map((p) => p.id)));
                      else setRcSelected(new Set());
                    }} style={{ width: 14, height: 14, accentColor: C.pri[400], cursor: "pointer" }} />
                    <span style={{ fontSize: 11, color: C.n[600] }}>Select all</span>
                  </label>
                  <span style={{ fontSize: 11, color: C.n[500] }}>·</span>
                  <span style={{ fontSize: 11, color: C.n[600] }}>{rcResults.length} patient{rcResults.length !== 1 ? "s" : ""} found</span>
                </div>
                {rcSelected.size > 0 && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: C.pri[600], fontWeight: 500 }}>{rcSelected.size} selected</span>
                    <button style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 11, cursor: "pointer", fontFamily: font }}>Compare</button>
                    <button style={{ padding: "4px 12px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[700], fontSize: 11, cursor: "pointer", fontFamily: font }}>Export</button>
                  </div>
                )}
              </div>

              {/* Patient cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rcResults.map((p) => {
                  const sel = rcSelected.has(p.id);
                  return (
                    <div key={p.id} onClick={() => {
                      const s = new Set(rcSelected);
                      if (sel) s.delete(p.id); else s.add(p.id);
                      setRcSelected(s);
                    }} style={{ background: sel ? C.pri[50] : C.n[0], border: `0.5px solid ${sel ? C.pri[300] : C.n[200]}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, transition: "background 0.15s" }}>
                      <input type="checkbox" checked={sel} onChange={() => {}} onClick={(e) => e.stopPropagation()} style={{ width: 14, height: 14, accentColor: C.pri[400], cursor: "pointer", marginTop: 2, flexShrink: 0 }} />
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: colorOf(p.gender === "F" ? "pri" : "info").bg, color: colorOf(p.gender === "F" ? "pri" : "info").fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                        {p.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.n[900] }}>{p.name}</span>
                          <span style={{ fontSize: 10, color: C.n[500] }}>{p.age}y · {p.gender === "F" ? "Female" : "Male"}</span>
                          <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 10, background: p.source === "IPD" ? C.info[50] : C.pri[50], color: p.source === "IPD" ? C.info[800] : C.pri[600], fontWeight: 600 }}>{p.source}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 5 }}>
                          {p.diseases.map((d) => (
                            <span key={d} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: C.danger[50], color: C.danger[800], border: `0.5px solid ${C.danger[100]}` }}>
                              🩺 {highlight(d)}
                            </span>
                          ))}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {p.tags.map((t) => (
                            <span key={t} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: C.n[100], color: C.n[700] }}>
                              # {highlight(t)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {q.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.n[400] }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔬</div>
          <div style={{ fontSize: 13, color: C.n[500] }}>Type a disease name or tag to find matching patients</div>
          <div style={{ fontSize: 11, color: C.n[400], marginTop: 4 }}>e.g. &quot;Dengue&quot;, &quot;Diabetic&quot;, &quot;Elderly&quot;, &quot;Post-op&quot;</div>
        </div>
      )}
    </div>
  );
}
