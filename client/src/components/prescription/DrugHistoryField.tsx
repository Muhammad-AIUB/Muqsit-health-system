"use client";

import { useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { C } from "@/theme";

// Drug history is split into two categories. Items are stored in the single
// `drugHistory` string[] with a "Current:" / "Past:" prefix so the rest of the
// app (and the saved prescription) needs no schema change.
const CATS = [
  { key: "Current", label: "Current medications" },
  { key: "Past", label: "Distant past medication" },
] as const;
type CatKey = (typeof CATS)[number]["key"];

const prefixOf = (s: string): CatKey => (s.startsWith("Past: ") ? "Past" : "Current");
const stripPrefix = (s: string) => s.replace(/^(Current|Past):\s*/, "");

interface Props {
  items: string[];
  setItems: Dispatch<SetStateAction<string[]>>;
  suggestions: string[];
}

export default function DrugHistoryField({ items, setItems, suggestions }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<CatKey>("Current");
  const [inputVal, setInputVal] = useState("");
  // Staged per-category lists (committed on Done).
  const [current, setCurrent] = useState<string[]>([]);
  const [past, setPast] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const draft = tab === "Current" ? current : past;
  const setDraft = tab === "Current" ? setCurrent : setPast;

  const handleOpen = () => {
    // Split existing items back into the two categories.
    setCurrent(items.filter((i) => prefixOf(i) === "Current").map(stripPrefix));
    setPast(items.filter((i) => prefixOf(i) === "Past").map(stripPrefix));
    setTab("Current");
    setInputVal("");
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const addToDraft = (text: string) => {
    const v = text.trim();
    if (v && !draft.includes(v)) setDraft([...draft, v]);
    setInputVal("");
    inputRef.current?.focus();
  };
  const removeFromDraft = (idx: number) => setDraft(draft.filter((_, i) => i !== idx));

  const cancel = () => { setOpen(false); setInputVal(""); };
  const done = () => {
    const cur = inputVal.trim() && tab === "Current" && !current.includes(inputVal.trim()) ? [...current, inputVal.trim()] : current;
    const pst = inputVal.trim() && tab === "Past" && !past.includes(inputVal.trim()) ? [...past, inputVal.trim()] : past;
    setItems([...cur.map((t) => `Current: ${t}`), ...pst.map((t) => `Past: ${t}`)]);
    setOpen(false);
    setInputVal("");
  };

  const filteredSugs = suggestions
    .filter((s) => !draft.includes(s))
    .filter((s) => !inputVal || s.toLowerCase().includes(inputVal.toLowerCase()))
    .slice(0, 12);

  // Items shown in the collapsed row (with a tiny C/P badge).
  const tagStyle: CSSProperties = { fontSize: 11, color: C.n[800], background: C.n[100], padding: "2px 8px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4 };
  const greenTag: CSSProperties = { fontSize: 11, color: C.pri[600], background: C.pri[50], padding: "4px 10px 4px 12px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 6, border: `0.5px solid ${C.pri[100]}` };

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
              <span key={idx} style={tagStyle}>
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
          <div onClick={(e) => e.stopPropagation()} style={{ width: 540, maxWidth: "95vw", maxHeight: "82vh", background: C.n[0], borderRadius: 14, border: `0.5px solid ${C.n[200]}`, boxShadow: "0 12px 40px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `0.5px solid ${C.n[200]}` }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, color: C.n[900] }}>Drug history</div>
                <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Add items, then press Done to apply</div>
              </div>
              <button onClick={cancel} style={{ width: 28, height: 28, borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 8, padding: "12px 20px 0" }}>
              {CATS.map((c) => {
                const active = tab === c.key;
                const count = (c.key === "Current" ? current : past).length;
                return (
                  <button key={c.key} onClick={() => { setTab(c.key); setInputVal(""); setTimeout(() => inputRef.current?.focus(), 30); }}
                    style={{ padding: "8px 16px", borderRadius: 999, border: `1px solid ${active ? C.pri[400] : C.n[200]}`, background: active ? C.pri[50] : C.n[0], color: active ? C.pri[600] : C.n[600], fontSize: 12.5, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                    {c.label}{count > 0 ? ` (${count})` : ""}
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div style={{ padding: "14px 20px", flex: 1, overflowY: "auto" }}>
              {draft.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Added ({draft.length})</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {draft.map((item, idx) => (
                      <span key={idx} style={greenTag}>
                        {item}
                        <button onClick={() => removeFromDraft(idx)} style={{ background: "none", border: "none", color: C.pri[400], cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input ref={inputRef} value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && inputVal.trim()) addToDraft(inputVal); }}
                  placeholder={`Type ${tab === "Current" ? "current medication" : "past medication"} and press Enter...`}
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 8, fontSize: 13, border: `0.5px solid ${C.n[200]}`, outline: "none", background: C.n[50], color: C.n[900], fontFamily: "inherit" }} />
                <button onClick={() => { if (inputVal.trim()) addToDraft(inputVal); }} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>Add</button>
              </div>

              {filteredSugs.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Suggestions</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {filteredSugs.map((s) => (
                      <button key={s} onClick={() => addToDraft(s)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer", border: `0.5px solid ${C.n[200]}`, background: C.n[50], color: C.n[800], fontFamily: "inherit", lineHeight: 1.3 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; e.currentTarget.style.color = C.pri[600]; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = C.n[50]; e.currentTarget.style.borderColor = C.n[200]; e.currentTarget.style.color = C.n[800]; }}
                      >{s}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50] }}>
              <button onClick={cancel} style={{ padding: "8px 20px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={done} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
