"use client";

import { useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { C, font } from "@/theme";
import { useMedicineSearch } from "@/hooks/useMedicineSearch";

// ── Categories (stored in one drugHistory[] with a prefix) ───
const CATS = [
  { key: "Current", label: "Current medications" },
  { key: "Past", label: "Distant past medication" },
] as const;
type CatKey = (typeof CATS)[number]["key"];

interface Row {
  drug: string;
  dose: string;
  duration: string;
  checked: boolean;
}
const emptyRow = (): Row => ({ drug: "", dose: "", duration: "", checked: true });

const prefixOf = (s: string): CatKey => (s.startsWith("Past:") ? "Past" : "Current");
const stripPrefix = (s: string) => s.replace(/^(Current|Past):\s*/, "");

// "Current: Tab. X — 1+0+1 — 7 days" → Row
function toRow(stored: string): Row {
  const [drug = "", dose = "", duration = ""] = stripPrefix(stored).split(" — ");
  return { drug: drug.trim(), dose: dose.trim(), duration: duration.trim(), checked: true };
}
function serialize(cat: CatKey, r: Row): string {
  const parts = [r.drug.trim(), r.dose.trim(), r.duration.trim()].filter(Boolean);
  return `${cat}: ${parts.join(" — ")}`;
}

// ── Dose shorthand: 101 → 1+0+1, 0.500.5 → 1/2+0+1/2 ─────────
function parseDose(raw: string): string {
  const s = raw.trim();
  if (!s || s.includes("+")) return s;
  const tokens: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s.slice(i, i + 3) === "0.5") { tokens.push("1/2"); i += 3; }
    else if (/\d/.test(s[i])) { tokens.push(s[i]); i += 1; }
    else { i += 1; }
  }
  return tokens.length === 3 ? tokens.join("+") : s;
}

// ── Duration shorthand: 7d → 7 days, c → Continue, 2m → 2 month
function parseDuration(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (/^c$/i.test(s)) return "Continue";
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d+)\s*d$/i))) return `${m[1]} days`;
  if ((m = s.match(/^(\d+)\s*m$/i))) return `${m[1]} month`;
  if ((m = s.match(/^(\d+)\s*w$/i))) return `${m[1]} week`;
  return s;
}

interface Props {
  items: string[];
  setItems: Dispatch<SetStateAction<string[]>>;
}

export default function DrugHistoryField({ items, setItems }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<CatKey>("Current");
  const [current, setCurrent] = useState<Row[]>([emptyRow()]);
  const [past, setPast] = useState<Row[]>([emptyRow()]);
  // Active drug-name autocomplete: which row index is showing a dropdown.
  const [acRow, setAcRow] = useState<number | null>(null);
  const drugRefs = useRef<(HTMLInputElement | null)[]>([]);

  const rows = tab === "Current" ? current : past;
  const setRows = tab === "Current" ? setCurrent : setPast;

  const handleOpen = () => {
    const cur = items.filter((i) => prefixOf(i) === "Current").map(toRow);
    const pst = items.filter((i) => prefixOf(i) === "Past").map(toRow);
    setCurrent([...cur, emptyRow()]);
    setPast([...pst, emptyRow()]);
    setTab("Current");
    setAcRow(null);
    setOpen(true);
  };

  // Keep exactly one trailing empty row.
  const normalize = (list: Row[]): Row[] => {
    const filled = list.filter((r) => r.drug.trim() || r.dose.trim() || r.duration.trim());
    return [...filled, emptyRow()];
  };

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => {
      const next = prev.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      // If the user just started typing in the last row, append a fresh one.
      const last = next[next.length - 1];
      if (last.drug.trim() || last.dose.trim() || last.duration.trim()) next.push(emptyRow());
      return next;
    });
  };

  const removeRow = (idx: number) => setRows((prev) => normalize(prev.filter((_, i) => i !== idx)));

  const cancel = () => { setOpen(false); setAcRow(null); };
  const done = () => {
    const ser = (cat: CatKey, list: Row[]) =>
      list.filter((r) => r.drug.trim()).map((r) => serialize(cat, r));
    setItems([...ser("Current", current), ...ser("Past", past)]);
    setOpen(false);
    setAcRow(null);
  };

  const { results: acItems } = useMedicineSearch(acRow != null ? rows[acRow]?.drug ?? "" : "");

  // ── Styles ──
  const lineInput: CSSProperties = { border: "none", outline: "none", background: "transparent", fontSize: 13, color: C.n[900], fontFamily: font, padding: "0 2px" };

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Collapsed row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minHeight: 28 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.n[800], paddingTop: 4, cursor: "pointer" }} onClick={handleOpen}>Drug history</span>
        {items.length === 0 ? (
          <button onClick={handleOpen} style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = C.n[300]; }}>+</button>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1, alignItems: "center", paddingTop: 2 }}>
            {items.map((item, idx) => (
              <span key={idx} style={{ fontSize: 11, color: C.n[800], background: C.n[100], padding: "2px 8px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: prefixOf(item) === "Current" ? C.pri[600] : C.warn[800], background: prefixOf(item) === "Current" ? C.pri[50] : C.warn[50], padding: "1px 4px", borderRadius: 3 }}>{prefixOf(item) === "Current" ? "C" : "P"}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stripPrefix(item)}</span>
                <button onClick={(e) => { e.stopPropagation(); setItems(items.filter((_, i) => i !== idx)); }} style={{ background: "none", border: "none", color: C.n[500], cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
            <button onClick={handleOpen} style={{ width: 18, height: 18, borderRadius: "50%", border: `1px solid ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>+</button>
          </div>
        )}
      </div>

      {/* Modal */}
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={cancel}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 600, maxWidth: "95vw", maxHeight: "82vh", background: C.n[0], borderRadius: 14, border: `0.5px solid ${C.n[200]}`, boxShadow: "0 12px 40px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `0.5px solid ${C.n[200]}` }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, color: C.n[900] }}>Drug history</div>
                <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Write each medicine on a line · Done to apply</div>
              </div>
              <button onClick={cancel} style={{ width: 28, height: 28, borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 8, padding: "12px 20px 4px" }}>
              {CATS.map((c) => {
                const active = tab === c.key;
                const count = (c.key === "Current" ? current : past).filter((r) => r.drug.trim()).length;
                return (
                  <button key={c.key} onClick={() => { setTab(c.key); setAcRow(null); }}
                    style={{ padding: "8px 16px", borderRadius: 999, border: `1px solid ${active ? C.pri[400] : C.n[200]}`, background: active ? C.pri[50] : C.n[0], color: active ? C.pri[600] : C.n[600], fontSize: 12.5, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: font }}>
                    {c.label}{count > 0 ? ` (${count})` : ""}
                  </button>
                );
              })}
            </div>

            {/* Lined pad */}
            <div style={{ padding: "8px 20px 16px", flex: 1, overflowY: "auto" }}>
              <div style={{ display: "flex", fontSize: 9, fontWeight: 600, color: C.n[500], textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 0 4px 52px" }}>
                <div style={{ flex: 1 }}>Medicine (trade name)</div>
                <div style={{ width: 96 }}>Dose</div>
                <div style={{ width: 96 }}>Duration</div>
              </div>

              {rows.map((row, idx) => {
                const isLastEmpty = idx === rows.length - 1 && !row.drug && !row.dose && !row.duration;
                const started = Boolean(row.drug || row.dose || row.duration);
                return (
                  <div key={idx} style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, borderBottom: `1px dashed ${C.n[200]}`, padding: "7px 0", minHeight: 34 }}>
                    {/* Checkbox + serial — appear once the line has content */}
                    <div style={{ width: 46, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {started && (
                        <>
                          <input type="checkbox" checked={row.checked} onChange={(e) => updateRow(idx, { checked: e.target.checked })} style={{ width: 14, height: 14, accentColor: C.pri[400], cursor: "pointer" }} />
                          <span style={{ fontSize: 11, color: C.n[500], width: 16, textAlign: "right" }}>{idx + 1}.</span>
                        </>
                      )}
                    </div>

                    {/* Drug name + autocomplete */}
                    <div style={{ flex: 1, position: "relative" }}>
                      <input
                        ref={(el) => { drugRefs.current[idx] = el; }}
                        value={row.drug}
                        onChange={(e) => { updateRow(idx, { drug: e.target.value }); setAcRow(idx); }}
                        onFocus={() => setAcRow(idx)}
                        onBlur={() => setTimeout(() => setAcRow((r) => (r === idx ? null : r)), 150)}
                        placeholder={isLastEmpty ? "Type medicine name…" : ""}
                        style={{ ...lineInput, width: "100%", opacity: row.checked ? 1 : 0.5 }}
                      />
                      {acRow === idx && acItems.length > 0 && (
                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 30, marginTop: 2, maxHeight: 200, overflowY: "auto" }}>
                          {acItems.map((m) => (
                            <button
                              key={m.id}
                              onMouseDown={(e) => { e.preventDefault(); updateRow(idx, { drug: m.brandName }); setAcRow(null); }}
                              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer", fontFamily: font }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = C.pri[50])}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.n[900] }}>{m.brandName}</div>
                              <div style={{ fontSize: 11, color: C.n[500] }}>{[m.genericName, m.strength, m.dosageForm].filter(Boolean).join(" · ")}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Dose (101 → 1+0+1) */}
                    <input
                      value={row.dose}
                      onChange={(e) => updateRow(idx, { dose: e.target.value })}
                      onBlur={() => updateRow(idx, { dose: parseDose(row.dose) })}
                      onKeyDown={(e) => { if (e.key === "Enter") updateRow(idx, { dose: parseDose(row.dose) }); }}
                      placeholder="1+0+1"
                      style={{ ...lineInput, width: 96, textAlign: "center", opacity: row.checked ? 1 : 0.5 }}
                    />

                    {/* Duration (7d → 7 days) */}
                    <input
                      value={row.duration}
                      onChange={(e) => updateRow(idx, { duration: e.target.value })}
                      onBlur={() => updateRow(idx, { duration: parseDuration(row.duration) })}
                      onKeyDown={(e) => { if (e.key === "Enter") updateRow(idx, { duration: parseDuration(row.duration) }); }}
                      placeholder="7 days"
                      style={{ ...lineInput, width: 96, textAlign: "center", opacity: row.checked ? 1 : 0.5 }}
                    />

                    {/* Remove */}
                    {started && (
                      <button onClick={() => removeRow(idx)} style={{ background: "none", border: "none", color: C.danger[400], cursor: "pointer", fontSize: 15, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>×</button>
                    )}
                  </div>
                );
              })}

              <div style={{ fontSize: 10, color: C.n[500], marginTop: 10, lineHeight: 1.6 }}>
                Shortcuts — dose: <b>101</b>→1+0+1, <b>0.500.5</b>→1/2+0+1/2 · duration: <b>7d</b>→7 days, <b>2m</b>→2 month, <b>c</b>→Continue
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50] }}>
              <button onClick={cancel} style={{ padding: "8px 20px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: font }}>Cancel</button>
              <button onClick={done} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
