"use client";

import { useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { C, font } from "@/theme";
import { useMedicineSearch } from "@/hooks/useMedicineSearch";
import { fmtMedicine, looksLikeMedicine, parseDose, parseDuration, parseFood, FOOD_HINT } from "@/lib/rxShorthand";

// Small pill icon shown beside the "treat as medicine" suggestion.
const PillIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-45 12 12)" fill={C.pri[50]} stroke={C.pri[400]} strokeWidth="1.6" />
    <line x1="9.5" y1="14.5" x2="14.5" y2="9.5" stroke={C.pri[400]} strokeWidth="1.6" />
  </svg>
);

// One editable line. A medicine head has a name + checkbox + number; a
// continuation (tapering) line repeats the drug above with another dose; a
// note is plain free text.
export interface Row {
  drug: string;
  dose: string;
  food: string;
  duration: string;
  checked: boolean;
  isMedicine: boolean;
  continuation: boolean;
}
export const emptyRow = (): Row => ({ drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false });
export const contRow = (): Row => ({ drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: true, continuation: true });

const ROW_H = 40;

interface Props {
  rows: Row[];
  setRows: Dispatch<SetStateAction<Row[]>>;
  minHeight?: number;
  noteText?: string;      // placeholder for the trailing empty line
  showCheck?: boolean;    // per-row checkboxes + "Select all" (default true)
}

export default function MedicinePad({ rows, setRows, minHeight, noteText, showCheck = true }: Props) {
  const [acRow, setAcRow] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const drugRefs = useRef<(HTMLInputElement | null)[]>([]);
  const doseRefs = useRef<(HTMLInputElement | null)[]>([]);
  const foodRefs = useRef<(HTMLInputElement | null)[]>([]);
  const durRefs = useRef<(HTMLInputElement | null)[]>([]);

  const { results: acItems } = useMedicineSearch(acRow != null ? rows[acRow]?.drug ?? "" : "");

  const filledRows = rows.filter((r) => r.isMedicine && !r.continuation && r.drug.trim());
  const allChecked = filledRows.length > 0 && filledRows.every((r) => r.checked);
  const medNumbers = (() => { let n = 0; return rows.map((r) => (r.isMedicine && !r.continuation ? ++n : 0)); })();

  const toggleAll = (val: boolean) =>
    setRows((prev) => prev.map((r) => (r.isMedicine && !r.continuation ? { ...r, checked: val } : r)));

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => {
      const next = prev.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      const last = next[next.length - 1];
      if (last.drug.trim() || last.dose.trim() || last.food.trim() || last.duration.trim()) next.push(emptyRow());
      return next;
    });
  };

  const removeRow = (idx: number) =>
    setRows((prev) => {
      const filled = prev.filter((_, i) => i !== idx).filter((r) => r.drug.trim() || r.dose.trim() || r.food.trim() || r.duration.trim());
      return [...filled, emptyRow()];
    });

  const addContinuation = (idx: number) => {
    setRows((prev) => {
      let at = idx + 1;
      while (at < prev.length && prev[at].continuation) at++;
      return [...prev.slice(0, at), contRow(), ...prev.slice(at)];
    });
    setTimeout(() => doseRefs.current[idx + 1]?.focus(), 30);
  };

  const lineInput: CSSProperties = { border: "none", outline: "none", background: "transparent", fontSize: 13.5, color: C.n[900], fontFamily: font, padding: "0 4px", height: ROW_H - 8 };

  return (
    <div>
      {/* Toolbar — select all (optional) + edit (reveal × buttons) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 6px" }}>
        {showCheck ? (
          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12.5, color: C.n[700], userSelect: "none" }}>
            <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} disabled={filledRows.length === 0} style={{ width: 15, height: 15, accentColor: C.pri[400], cursor: filledRows.length === 0 ? "default" : "pointer" }} />
            Select all
          </label>
        ) : (
          <span />
        )}
        <button
          onClick={() => setEditMode((m) => !m)}
          style={{ padding: "5px 14px", borderRadius: 7, border: `1px solid ${editMode ? C.pri[400] : C.n[200]}`, background: editMode ? C.pri[50] : C.n[0], color: editMode ? C.pri[600] : C.n[700], fontSize: 12, fontWeight: editMode ? 600 : 400, cursor: "pointer", fontFamily: font }}
        >
          {editMode ? "✓ Done editing" : "✎ Edit"}
        </button>
      </div>

      {/* Notebook writing pad */}
      <div
        style={{
          background: `repeating-linear-gradient(${C.n[0]}, ${C.n[0]} ${ROW_H - 1}px, ${C.n[200]} ${ROW_H - 1}px, ${C.n[200]} ${ROW_H}px)`,
          minHeight: minHeight ?? "100%",
          paddingTop: 4,
        }}
      >
        {rows.map((row, idx) => {
          const isLastEmpty = idx === rows.length - 1 && !row.drug && !row.dose && !row.duration;
          const started = Boolean(row.drug || row.dose || row.duration);
          const isHead = row.isMedicine && !row.continuation;
          const isCont = row.continuation;
          return (
            <div key={idx} style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, height: ROW_H, zIndex: acRow === idx ? 5 : undefined }}>
              {/* Checkbox (optional) + serial — only for medicine head rows */}
              <div style={{ width: showCheck ? 44 : 26, display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                {isHead && (
                  <>
                    {showCheck && <input type="checkbox" checked={row.checked} onChange={(e) => updateRow(idx, { checked: e.target.checked })} style={{ width: 14, height: 14, accentColor: C.pri[400], cursor: "pointer" }} />}
                    <span style={{ fontSize: 12, color: C.n[500], width: 18, textAlign: "right" }}>{medNumbers[idx]}.</span>
                  </>
                )}
              </div>

              {/* Medicine column: name (or indent) + >>> tapering button */}
              <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
                {isCont ? (
                  <span style={{ flex: 1, color: C.n[400], fontSize: 13, paddingLeft: 6 }}>↳</span>
                ) : (
                  <input
                    ref={(el) => { drugRefs.current[idx] = el; }}
                    value={row.drug}
                    onChange={(e) => { updateRow(idx, { drug: e.target.value }); setAcRow(idx); }}
                    onFocus={() => setAcRow(idx)}
                    onBlur={() => setTimeout(() => setAcRow((r) => (r === idx ? null : r)), 150)}
                    placeholder={isLastEmpty ? (noteText ?? "Start typing a medicine or note…") : ""}
                    autoComplete="off"
                    style={{ ...lineInput, flex: 1, opacity: !row.isMedicine || row.checked ? 1 : 0.5, color: row.isMedicine ? C.n[900] : C.n[700], fontStyle: row.isMedicine ? "normal" : "italic" }}
                  />
                )}

                {row.isMedicine && (isHead ? row.drug.trim() : true) && (
                  <button
                    title="Add subsequent dose and duration for this drug"
                    onClick={() => addContinuation(idx)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.n[400], fontSize: 12, fontWeight: 700, letterSpacing: -1, padding: "0 4px", flexShrink: 0, fontFamily: font }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = C.pri[600])}
                    onMouseLeave={(e) => (e.currentTarget.style.color = C.n[400])}
                  >
                    &gt;&gt;&gt;
                  </button>
                )}

                {!isCont && acRow === idx && (acItems.length > 0 || (looksLikeMedicine(row.drug) && !row.isMedicine)) && (
                  <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, minWidth: 320, maxWidth: 440, background: C.n[0], border: `1px solid ${C.n[300]}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.22)", zIndex: 50, maxHeight: 240, overflowY: "auto" }}>
                    {/* Not in the database, but it looks like a medicine — offer to treat it as one. */}
                    {looksLikeMedicine(row.drug) && !row.isMedicine && (
                      <button
                        onMouseDown={(e) => {
                          e.preventDefault();
                          updateRow(idx, { isMedicine: true });
                          setAcRow(null);
                          setTimeout(() => doseRefs.current[idx]?.focus(), 30);
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 14px", border: "none", borderBottom: acItems.length > 0 ? `1px solid ${C.n[200]}` : "none", background: C.pri[50] + "55", cursor: "pointer", fontFamily: font }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = C.pri[50])}
                        onMouseLeave={(e) => (e.currentTarget.style.background = C.pri[50] + "55")}
                      >
                        <PillIcon />
                        <span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.pri[600] }}>Treat “{row.drug.trim()}” as medicine</span>
                          <span style={{ display: "block", fontSize: 11, color: C.n[500] }}>Not in database — add dose, food &amp; duration yourself</span>
                        </span>
                      </button>
                    )}
                    {acItems.map((m, mi) => (
                      <button
                        key={m.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          updateRow(idx, { drug: fmtMedicine(m), isMedicine: true });
                          setAcRow(null);
                          setTimeout(() => doseRefs.current[idx]?.focus(), 30);
                        }}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", border: "none", borderTop: mi === 0 ? "none" : `0.5px solid ${C.n[100]}`, background: C.n[0], cursor: "pointer", fontFamily: font }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = C.pri[50])}
                        onMouseLeave={(e) => (e.currentTarget.style.background = C.n[0])}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.n[900] }}>{fmtMedicine(m)}</div>
                        {m.genericName && <div style={{ fontSize: 11, color: C.n[500] }}>{m.genericName}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Dose + food + duration — medicine rows */}
              {row.isMedicine && (
                <>
                  <input
                    ref={(el) => { doseRefs.current[idx] = el; }}
                    value={row.dose}
                    onChange={(e) => updateRow(idx, { dose: e.target.value })}
                    onBlur={() => updateRow(idx, { dose: parseDose(row.dose) })}
                    onKeyDown={(e) => { if (e.key === "Enter") { updateRow(idx, { dose: parseDose(row.dose) }); foodRefs.current[idx]?.focus(); } }}
                    placeholder="dose"
                    style={{ ...lineInput, width: 88, textAlign: "center" }}
                  />
                  <input
                    ref={(el) => { foodRefs.current[idx] = el; }}
                    value={row.food}
                    onChange={(e) => updateRow(idx, { food: e.target.value })}
                    onBlur={() => updateRow(idx, { food: parseFood(row.food) })}
                    onKeyDown={(e) => { if (e.key === "Enter") { updateRow(idx, { food: parseFood(row.food) }); durRefs.current[idx]?.focus(); } }}
                    placeholder="food"
                    title={FOOD_HINT}
                    style={{ ...lineInput, width: 132, textAlign: "center" }}
                  />
                  <input
                    ref={(el) => { durRefs.current[idx] = el; }}
                    value={row.duration}
                    onChange={(e) => updateRow(idx, { duration: e.target.value })}
                    onBlur={() => updateRow(idx, { duration: parseDuration(row.duration) })}
                    onKeyDown={(e) => { if (e.key === "Enter") { updateRow(idx, { duration: parseDuration(row.duration) }); drugRefs.current[idx + 1]?.focus(); } }}
                    placeholder="duration"
                    style={{ ...lineInput, width: 96, textAlign: "center" }}
                  />
                </>
              )}

              {editMode && (started || isCont) && (
                <button onClick={() => removeRow(idx)} style={{ background: "none", border: "none", color: C.danger[400], cursor: "pointer", fontSize: 15, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>×</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
