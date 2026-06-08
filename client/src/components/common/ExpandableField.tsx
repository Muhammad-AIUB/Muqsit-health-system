"use client";

import { useState, useRef, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { C } from "@/theme";

interface ExpandableFieldProps {
  label: string;
  items: string[];
  setItems: Dispatch<SetStateAction<string[]>>;
  suggestions?: string[];
  allFields?: Record<string, string[]>;
}

export default function ExpandableField({ label, items, setItems, suggestions, allFields }: ExpandableFieldProps) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [showSugs, setShowSugs] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const getFiltered = () => {
    const sugs = suggestions || [];
    const allText = Object.values(allFields || {}).flat().join(" ").toLowerCase();
    let scored = sugs.map((s) => {
      let score = 0;
      if (inputVal && s.toLowerCase().includes(inputVal.toLowerCase())) score += 10;
      if (allText.includes("fever") && (s.toLowerCase().includes("fever") || s.toLowerCase().includes("temp"))) score += 3;
      if (allText.includes("cough") && (s.toLowerCase().includes("cough") || s.toLowerCase().includes("lung"))) score += 3;
      if (allText.includes("diabetes") && (s.toLowerCase().includes("diab") || s.toLowerCase().includes("sugar"))) score += 3;
      if (allText.includes("hypertension") && (s.toLowerCase().includes("hypertens") || s.toLowerCase().includes("bp"))) score += 3;
      if (!inputVal) score += 1;
      return { text: s, score };
    });
    if (inputVal) scored = scored.filter((s) => s.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.filter((s) => !items.includes(s.text)).slice(0, 8);
  };

  const addItem = (text: string) => {
    if (text.trim() && !items.includes(text.trim())) setItems([...items, text.trim()]);
    setInputVal("");
    setShowSugs(true);
    inputRef.current && inputRef.current.focus();
  };
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const handleOpen = () => {
    setOpen(true);
    setShowSugs(true);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 100);
  };
  const filteredSugs = getFiltered();

  const tagStyle: CSSProperties = { fontSize: 11, color: C.n[800], background: C.n[100], padding: "2px 8px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4 };
  const greenTag: CSSProperties = { fontSize: 11, color: C.pri[600], background: C.pri[50], padding: "4px 10px 4px 12px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 6, border: `0.5px solid ${C.pri[100]}` };

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Collapsed row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minHeight: 28 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.n[800], paddingTop: 4, cursor: "pointer" }} onClick={handleOpen}>{label}</span>
        {items.length === 0 && (
          <button onClick={handleOpen} style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0, transition: "all 0.12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = C.n[300]; }}>+</button>
        )}
        {items.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1, alignItems: "center", paddingTop: 2 }}>
            {items.map((item, idx) => (
              <span key={idx} style={tagStyle}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item}</span>
                <button onClick={(e) => { e.stopPropagation(); removeItem(idx); }} style={{ background: "none", border: "none", color: C.n[500], cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button></span>
            ))}
            <button onClick={handleOpen} style={{ width: 18, height: 18, borderRadius: "50%", border: `1px solid ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>+</button>
          </div>
        )}
      </div>

      {/* POPUP MODAL */}
      {open && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000,
        }} onClick={() => { setOpen(false); setShowSugs(false); }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: 520, maxHeight: "80vh", background: C.n[0], borderRadius: 14,
            border: `0.5px solid ${C.n[200]}`, boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* Modal header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderBottom: `0.5px solid ${C.n[200]}`,
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, color: C.n[900] }}>{label}</div>
                <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Add or edit items for this field</div>
              </div>
              <button onClick={() => { setOpen(false); setShowSugs(false); }} style={{
                width: 28, height: 28, borderRadius: 6, border: `0.5px solid ${C.n[200]}`,
                background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>×</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: "16px 20px", flex: 1, overflowY: "auto" }}>
              {/* Added items */}
              {items.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Added ({items.length})</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {items.map((item, idx) => (
                      <span key={idx} style={greenTag}>
                        {item}
                        <button onClick={() => removeItem(idx)} style={{ background: "none", border: "none", color: C.pri[400], cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Input row */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input ref={inputRef} value={inputVal}
                  onChange={(e) => { setInputVal(e.target.value); setShowSugs(true); }}
                  onFocus={() => setShowSugs(true)}
                  onKeyDown={(e) => { if (e.key === "Enter" && inputVal.trim()) addItem(inputVal); }}
                  placeholder={`Type ${label.toLowerCase()} and press Enter...`}
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 8, fontSize: 13,
                    border: `0.5px solid ${C.n[200]}`, outline: "none", background: C.n[50],
                    color: C.n[900], fontFamily: "inherit",
                  }} />
                <button onClick={() => { if (inputVal.trim()) addItem(inputVal); }} style={{
                  padding: "10px 18px", borderRadius: 8, border: "none",
                  background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}>Add</button>
              </div>

              {/* Suggestions */}
              {showSugs && filteredSugs.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Suggestions</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {filteredSugs.map((s) => (
                      <button key={s.text} onClick={() => addItem(s.text)} style={{
                        padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                        border: `0.5px solid ${C.n[200]}`, background: C.n[50], color: C.n[800],
                        transition: "all 0.12s", fontFamily: "inherit", lineHeight: 1.3,
                      }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; e.currentTarget.style.color = C.pri[600]; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = C.n[50]; e.currentTarget.style.borderColor = C.n[200]; e.currentTarget.style.color = C.n[800]; }}
                      >{s.text}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{
              display: "flex", justifyContent: "flex-end", gap: 8,
              padding: "12px 20px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50],
            }}>
              <button onClick={() => { setOpen(false); setShowSugs(false); }} style={{
                padding: "8px 20px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`,
                background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}>Cancel</button>
              <button onClick={() => { setOpen(false); setShowSugs(false); }} style={{
                padding: "8px 24px", borderRadius: 8, border: "none",
                background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
