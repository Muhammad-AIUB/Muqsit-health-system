"use client";

import { useEffect, useState, type ReactNode } from "react";
import { C, colorOf, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { useResearchSearch } from "@/hooks/useResearch";

export default function ResearchView() {
  const { rcQuery, setRcQuery, rcSelected, setRcSelected } = useMuqsit();

  // Debounce: only hit the API 300ms after the user stops typing.
  const [debouncedQ, setDebouncedQ] = useState(rcQuery.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(rcQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [rcQuery]);

  const { data: rcResults = [], isFetching, error } = useResearchSearch(debouncedQ);
  const q = debouncedQ.toLowerCase();
  const allSelected = rcResults.length > 0 && rcResults.every((p) => rcSelected.has(p.id));

  const selectedPatients = rcResults.filter((p) => rcSelected.has(p.id));
  const [showCompare, setShowCompare] = useState(false);

  // Download the selected patients as a CSV (no server round-trip — the rows
  // are already loaded). Excel-safe quoting.
  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ["Name", "Age", "Sex", "Mobile", "Diseases", "Tags"];
    const lines = selectedPatients.map((p) =>
      [p.name, p.age != null ? String(p.age) : "", p.sex ?? "", p.mobile ?? "", p.diseases.join("; "), p.tags.join("; ")]
        .map(esc)
        .join(","),
    );
    const csv = "﻿" + [header.map(esc).join(","), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-${debouncedQ.trim() || "patients"}-${selectedPatients.length}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Diseases / tags shared by EVERY selected patient — the useful research signal.
  const commonOf = (key: "diseases" | "tags") =>
    selectedPatients.length === 0
      ? []
      : selectedPatients[0][key].filter((v) => selectedPatients.every((p) => p[key].includes(v)));

  const highlight = (text: string): ReactNode => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return <span>{text.slice(0, idx)}<mark style={{ background: C.warn[100], color: C.warn[800], borderRadius: 2, padding: "0 1px" }}>{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</span>;
  };

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Research Companion</div>
      <div style={{ fontSize: 12, color: C.n[600], marginBottom: 16 }}>Find patients by disease, tags, or both</div>

      {/* Search bar */}
      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 15, color: C.n[500] }}>🔍</span>
        <input
          value={rcQuery}
          onChange={(e) => { setRcQuery(e.target.value); setRcSelected(new Set()); }}
          placeholder="Search by disease or tag…"
          style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: C.n[900], background: "transparent", fontFamily: font }}
          autoFocus
        />
        {isFetching && <span style={{ fontSize: 11, color: C.n[500] }}>Searching…</span>}
        {rcQuery && <button onClick={() => { setRcQuery(""); setRcSelected(new Set()); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.n[500], fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
      </div>

      {Boolean(error) && (
        <div style={{ fontSize: 12, color: C.danger[800], background: C.danger[50], borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
          Search failed. Is the API running?
        </div>
      )}

      {/* Results */}
      {q.length > 0 && !error && (
        <div>
          {rcResults.length === 0 && !isFetching ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.n[500], fontSize: 12 }}>No patients found for &quot;{debouncedQ}&quot;</div>
          ) : (
            <div>
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, rowGap: 8, marginBottom: 8 }}>
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
                    <button onClick={() => setShowCompare(true)} disabled={selectedPatients.length < 2} title={selectedPatients.length < 2 ? "Select at least 2 patients to compare" : "Compare selected patients"} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 11, cursor: selectedPatients.length < 2 ? "not-allowed" : "pointer", opacity: selectedPatients.length < 2 ? 0.5 : 1, fontFamily: font }}>Compare</button>
                    <button onClick={exportCsv} style={{ padding: "4px 12px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[800], fontSize: 11, cursor: "pointer", fontFamily: font }}>Export CSV</button>
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
                    }} style={{ background: sel ? C.pri[50] : C.n[0], border: `0.5px solid ${sel ? C.pri[400] : C.n[200]}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, transition: "background 0.15s" }}>
                      <input type="checkbox" checked={sel} onChange={() => {}} onClick={(e) => e.stopPropagation()} style={{ width: 14, height: 14, accentColor: C.pri[400], cursor: "pointer", marginTop: 2, flexShrink: 0 }} />
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: colorOf(p.sex === "Female" ? "pri" : "info").bg, color: colorOf(p.sex === "Female" ? "pri" : "info").fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                        {p.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.n[900] }}>{p.name}</span>
                          <span style={{ fontSize: 10, color: C.n[500] }}>{p.age != null ? `${p.age}y` : "—"} · {p.sex ?? "—"} · {p.mobile ?? "—"}</span>
                        </div>
                        {p.diseases.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 5 }}>
                            {p.diseases.map((d) => (
                              <span key={d} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: C.danger[50], color: C.danger[800], border: `0.5px solid ${C.danger[100]}` }}>
                                🩺 {highlight(d)}
                              </span>
                            ))}
                          </div>
                        )}
                        {p.tags.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {p.tags.map((t) => (
                              <span key={t} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: C.n[100], color: C.n[800] }}>
                                # {highlight(t)}
                              </span>
                            ))}
                          </div>
                        )}
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
        <div style={{ textAlign: "center", padding: "40px 0", color: C.n[500] }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔬</div>
          <div style={{ fontSize: 13, color: C.n[500] }}>Type a disease name or tag to find matching patients</div>
          <div style={{ fontSize: 11, color: C.n[500], marginTop: 4 }}>Diseases come from saved prescriptions; tags from Patient Settings</div>
        </div>
      )}

      {/* Compare panel — selected patients side by side, with shared diseases/tags */}
      {showCompare && (
        <div onClick={() => setShowCompare(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500, padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(960px, 96vw)", maxHeight: "88vh", overflow: "auto", background: C.n[0], borderRadius: 14, border: `0.5px solid ${C.n[200]}`, boxShadow: "0 16px 50px rgba(0,0,0,0.18)" }}>
            <div style={{ position: "sticky", top: 0, background: C.n[0], padding: "14px 18px", borderBottom: `0.5px solid ${C.n[200]}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Comparing {selectedPatients.length} patients</div>
              <button onClick={() => setShowCompare(false)} style={{ width: 28, height: 28, borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer" }}>×</button>
            </div>

            {(["diseases", "tags"] as const).map((key) => {
              const common = commonOf(key);
              return common.length > 0 ? (
                <div key={key} style={{ padding: "10px 18px", borderBottom: `0.5px solid ${C.n[100]}`, background: C.pri[50] }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.pri[600], textTransform: "uppercase", letterSpacing: "0.04em" }}>Shared {key}: </span>
                  {common.map((v) => (
                    <span key={v} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: C.n[0], color: C.pri[600], border: `0.5px solid ${C.pri[100]}`, marginRight: 5 }}>{v}</span>
                  ))}
                </div>
              ) : null;
            })}

            <div style={{ display: "grid", gridTemplateColumns: `repeat(${selectedPatients.length}, minmax(180px, 1fr))`, gap: 0 }}>
              {selectedPatients.map((p, i) => (
                <div key={p.id} style={{ padding: "12px 16px", borderRight: i < selectedPatients.length - 1 ? `0.5px solid ${C.n[100]}` : "none" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.n[900], marginBottom: 2 }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: C.n[500], marginBottom: 10 }}>{p.age != null ? `${p.age}y` : "—"} · {p.sex ?? "—"} · {p.mobile ?? "—"}</div>
                  <div style={{ fontSize: 9.5, fontWeight: 600, color: C.n[600], textTransform: "uppercase", marginBottom: 4 }}>Diseases</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                    {p.diseases.length ? p.diseases.map((d) => <span key={d} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: C.danger[50], color: C.danger[800], border: `0.5px solid ${C.danger[100]}` }}>🩺 {d}</span>) : <span style={{ fontSize: 10, color: C.n[400] }}>—</span>}
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 600, color: C.n[600], textTransform: "uppercase", marginBottom: 4 }}>Tags</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {p.tags.length ? p.tags.map((t) => <span key={t} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: C.n[100], color: C.n[800] }}># {t}</span>) : <span style={{ fontSize: 10, color: C.n[400] }}>—</span>}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: "12px 18px", borderTop: `0.5px solid ${C.n[200]}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={exportCsv} style={{ padding: "7px 16px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[800], fontSize: 12, cursor: "pointer", fontFamily: font }}>Export CSV</button>
              <button onClick={() => setShowCompare(false)} style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
