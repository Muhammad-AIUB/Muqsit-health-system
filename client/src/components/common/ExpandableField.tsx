"use client";

import { useState, useRef, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { C } from "@/theme";
import { useFieldRecents } from "@/hooks/useFieldRecents";

interface ExpandableFieldProps {
  label: string;
  items: string[];
  setItems: Dispatch<SetStateAction<string[]>>;
  suggestions?: string[];
  allFields?: Record<string, string[]>;
  // Fixed quick-pick checkboxes shown under the input (e.g. Associated illness).
  checkboxOptions?: string[];
  // Called for each newly committed item (used for the activity feed).
  onAdd?: (item: string) => void;
  // Optional inline text box after each item (keyed by item text). When
  // provided, every bullet gets an editable box beside it.
  itemNotes?: Record<string, string>;
  onItemNote?: (item: string, note: string) => void;
  notePlaceholder?: string;
}

export default function ExpandableField({ label, items, setItems, suggestions, allFields, checkboxOptions, onAdd, itemNotes, onItemNote, notePlaceholder }: ExpandableFieldProps) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");
  // Staged items: edits live here until the user presses Done.
  const [draft, setDraft] = useState<string[]>([]);
  // Per-doctor "recently typed" entries for this field (server-backed).
  const { getRecents, addRecents } = useFieldRecents();
  const recents = getRecents(label);
  const inputRef = useRef<HTMLInputElement>(null);

  const getFiltered = () => {
    // Recent entries first, then the static suggestion list.
    const sugs = [...recents.filter((r) => !(suggestions || []).includes(r)), ...(suggestions || [])];
    const allText = Object.values(allFields || {}).flat().join(" ").toLowerCase();
    let scored = sugs.map((s, i) => {
      let score = 0;
      if (inputVal && s.toLowerCase().includes(inputVal.toLowerCase())) score += 10;
      if (allText.includes("fever") && (s.toLowerCase().includes("fever") || s.toLowerCase().includes("temp"))) score += 3;
      if (allText.includes("cough") && (s.toLowerCase().includes("cough") || s.toLowerCase().includes("lung"))) score += 3;
      if (allText.includes("diabetes") && (s.toLowerCase().includes("diab") || s.toLowerCase().includes("sugar"))) score += 3;
      if (allText.includes("hypertension") && (s.toLowerCase().includes("hypertens") || s.toLowerCase().includes("bp"))) score += 3;
      if (!inputVal) score += 1;
      if (i < recents.length) score += 2; // recents rank above static suggestions
      return { text: s, score };
    });
    if (inputVal) scored = scored.filter((s) => s.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored
      .filter((s) => !draft.includes(s.text) && !(checkboxOptions || []).includes(s.text))
      .slice(0, 10);
  };

  // Checkbox quick-picks: tick → goes to the Added list, untick → removed.
  const toggleOption = (opt: string) => {
    if (draft.includes(opt)) setDraft(draft.filter((d) => d !== opt));
    else setDraft([...draft, opt]);
  };

  const addToDraft = (text: string) => {
    const v = text.trim();
    if (v && !draft.includes(v)) setDraft([...draft, v]);
    setInputVal("");
    inputRef.current && inputRef.current.focus();
  };

  // Suggestions with a "_" blank (e.g. "Fever for _ days") need a value
  // typed in first — clicking them fills the input with the cursor on the
  // blank instead of adding directly.
  const pickSuggestion = (text: string) => {
    if (text.includes("_")) {
      setInputVal(text);
      setTimeout(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        const i = text.indexOf("_");
        el.setSelectionRange(i, i + 1); // select the blank so typing replaces it
      }, 50);
    } else {
      addToDraft(text);
    }
  };
  const removeFromDraft = (idx: number) => setDraft(draft.filter((_, i) => i !== idx));

  const handleOpen = () => {
    setDraft([...items]); // stage a copy — the real field is untouched until Done
    setOpen(true);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 100);
  };

  const cancel = () => {
    setOpen(false);
    setInputVal("");
  };

  const done = () => {
    // Anything still in the input counts too.
    const finalDraft = inputVal.trim() && !draft.includes(inputVal.trim()) ? [...draft, inputVal.trim()] : draft;
    setItems(finalDraft);
    // Remember newly typed entries for future suggestions, and log them to the
    // activity feed.
    const newOnes = finalDraft.filter((d) => !items.includes(d));
    if (newOnes.length) addRecents(label, newOnes);
    newOnes.forEach((n) => onAdd?.(n));
    setOpen(false);
    setInputVal("");
  };

  const filteredSugs = getFiltered();

  const greenTag: CSSProperties = { fontSize: 11, color: C.pri[600], background: C.pri[50], padding: "4px 10px 4px 12px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 6, border: `0.5px solid ${C.pri[100]}` };

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Collapsed row: label + add button, then selected items as a bullet list */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 28 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.n[800], cursor: "pointer" }} onClick={handleOpen}>{label}</span>
        <button onClick={handleOpen} style={{ width: 20, height: 20, borderRadius: "50%", border: `1px solid ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.12s" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = C.n[300]; }}>+</button>
        {items.length > 0 && (
          <button onClick={handleOpen} style={{ fontSize: 11, color: C.pri[600], background: C.pri[50], border: `0.5px solid ${C.pri[100]}`, borderRadius: 6, padding: "2px 10px", cursor: "pointer", fontFamily: "inherit" }}>✎ Edit</button>
        )}
      </div>
      {items.length > 0 && (
        <div style={{ paddingLeft: 14, marginTop: 1, marginBottom: 4 }}>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.n[800], padding: "1.5px 0" }}>
              <span style={{ color: C.n[500], lineHeight: 1.45, flexShrink: 0 }}>•</span>
              <span style={{ flex: itemNotes ? "0 0 auto" : 1, lineHeight: 1.45 }}>{item}</span>
              {itemNotes && (
                <input
                  value={itemNotes[item] ?? ""}
                  onChange={(e) => onItemNote?.(item, e.target.value)}
                  placeholder={notePlaceholder ?? ""}
                  style={{ flex: 1, minWidth: 0, marginLeft: 4, padding: "3px 8px", borderRadius: 5, border: `0.5px solid ${C.n[300]}`, fontSize: 11.5, fontFamily: "inherit", color: C.n[900], outline: "none", background: C.n[0] }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* POPUP MODAL */}
      {open && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000,
        }} onClick={cancel}>
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
                <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Add items, then press Done to apply</div>
              </div>
              <button onClick={cancel} style={{
                width: 28, height: 28, borderRadius: 6, border: `0.5px solid ${C.n[200]}`,
                background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>×</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: "16px 20px", flex: 1, overflowY: "auto" }}>
              {/* Staged items — live above the input, committed on Done.
                  Checkbox picks stay as (checked) checkboxes; typed/suggestion
                  items show as tags. */}
              {draft.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Added ({draft.length})</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "center" }}>
                    {draft.map((item, idx) =>
                      (checkboxOptions || []).includes(item) ? (
                        <label key={idx} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none", background: C.pri[50], border: `0.5px solid ${C.pri[100]}`, borderRadius: 6, padding: "4px 12px" }}>
                          <input
                            type="checkbox"
                            checked
                            onChange={() => toggleOption(item)}
                            style={{ width: 15, height: 15, accentColor: C.pri[400], cursor: "pointer" }}
                          />
                          <span style={{ fontSize: 12.5, color: C.pri[600], fontWeight: 600 }}>{item}</span>
                        </label>
                      ) : (
                        <span key={idx} style={greenTag}>
                          {item}
                          <button onClick={() => removeFromDraft(idx)} style={{ background: "none", border: "none", color: C.pri[400], cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}

              {/* Input row */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input ref={inputRef} value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && inputVal.trim()) addToDraft(inputVal); }}
                  placeholder={`Type ${label.toLowerCase()} and press Enter...`}
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 8, fontSize: 13,
                    border: `0.5px solid ${C.n[200]}`, outline: "none", background: C.n[50],
                    color: C.n[900], fontFamily: "inherit",
                  }} />
                <button onClick={() => { if (inputVal.trim()) addToDraft(inputVal); }} style={{
                  padding: "10px 18px", borderRadius: 8, border: "none",
                  background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}>Add</button>
              </div>

              {/* Fixed quick-pick checkboxes — ticked ones move up to Added */}
              {checkboxOptions && checkboxOptions.some((o) => !draft.includes(o)) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", marginBottom: 14 }}>
                  {checkboxOptions.filter((o) => !draft.includes(o)).map((opt) => (
                    <label key={opt} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none" }}>
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => toggleOption(opt)}
                        style={{ width: 15, height: 15, accentColor: C.pri[400], cursor: "pointer" }}
                      />
                      <span style={{ fontSize: 12.5, color: C.n[800] }}>{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Suggestions (recent entries first, then the standard list) */}
              {filteredSugs.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Suggestions</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {filteredSugs.map((s) => {
                      const isRecent = recents.includes(s.text);
                      return (
                        <button key={s.text} onClick={() => pickSuggestion(s.text)} style={{
                          padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                          border: `0.5px solid ${isRecent ? C.pri[100] : C.n[200]}`,
                          background: isRecent ? C.pri[50] : C.n[50],
                          color: isRecent ? C.pri[600] : C.n[800],
                          transition: "all 0.12s", fontFamily: "inherit", lineHeight: 1.3,
                        }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; e.currentTarget.style.color = C.pri[600]; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = isRecent ? C.pri[50] : C.n[50]; e.currentTarget.style.borderColor = isRecent ? C.pri[100] : C.n[200]; e.currentTarget.style.color = isRecent ? C.pri[600] : C.n[800]; }}
                        >{isRecent ? "↺ " : ""}{s.text}</button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{
              display: "flex", justifyContent: "flex-end", gap: 8,
              padding: "12px 20px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50],
            }}>
              <button onClick={cancel} style={{
                padding: "8px 20px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`,
                background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}>Cancel</button>
              <button onClick={done} style={{
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
