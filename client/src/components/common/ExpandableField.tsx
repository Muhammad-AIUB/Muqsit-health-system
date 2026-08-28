"use client";

import { useState, useRef, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { C } from "@/theme";
import { useFieldRecents } from "@/hooks/useFieldRecents";
import { useMuqsit } from "@/context/MuqsitContext";

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
  // Opt-in (Final diagnosis): "✎ Edit" opens a box on every entry in place
  // instead of the popup, and Enter in any of them finishes the edit.
  inlineEdit?: boolean;
  // Opt-in (Final diagnosis): the "P.D" panel beside the popup — this patient's
  // diagnoses from past visits, ticked to carry them into today's list.
  previousItems?: string[];
}

export default function ExpandableField({ label, items, setItems, suggestions, allFields, checkboxOptions, onAdd, itemNotes, onItemNote, notePlaceholder, inlineEdit, previousItems }: ExpandableFieldProps) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");
  // Inline edit (inlineEdit only): every line is open at once, staged here
  // until Enter. `editFocus` is the box that takes the caret when it opens.
  const [editOpen, setEditOpen] = useState(false);
  const [editLines, setEditLines] = useState<string[]>([]);
  const [editFocus, setEditFocus] = useState(0);
  // Staged items: edits live here until the user presses Done.
  const [draft, setDraft] = useState<string[]>([]);
  // Per-doctor "recently typed" entries for this field (server-backed).
  const { getRecents, addRecents } = useFieldRecents();
  const recents = getRecents(label);
  const inputRef = useRef<HTMLInputElement>(null);
  // When an assistant lacks this section's permission, it's visible but locked.
  const { canEditLabel } = useMuqsit();
  const editable = canEditLabel(label);
  // This patient's past final diagnoses, offered as ticks in the popup.
  const pd = previousItems ?? [];

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
      // Anything already offered as its own tick — a checkbox quick-pick or a
      // P.D line — is not repeated down here.
      .filter((s) => !draft.includes(s.text) && !(checkboxOptions || []).includes(s.text) && !pd.includes(s.text))
      .slice(0, 10);
  };

  // --- P.D panel (Final diagnosis only) -----------------------------------
  const pdChosen = pd.filter((d) => draft.includes(d));
  const allPdChosen = pd.length > 0 && pdChosen.length === pd.length;

  // Ticking carries a past diagnosis into today's list; unticking takes it back
  // out of the staged list only — the past prescription is never touched.
  const togglePd = (d: string) => {
    if (draft.includes(d)) setDraft(draft.filter((x) => x !== d));
    else setDraft([...draft, d]);
  };

  // "Select all" / "Clear" move only the P.D lines; whatever else is staged
  // stays put. They are two plain actions rather than one tickbox, so nothing
  // in this panel can look ticked unless the doctor ticked it.
  const selectAllPd = () => setDraft([...draft, ...pd.filter((d) => !draft.includes(d))]);
  const clearAllPd = () => setDraft(draft.filter((x) => !pd.includes(x)));

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
    if (!editable) return; // locked for this assistant — view only
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

  // --- Inline edit: every line at once ------------------------------------
  //
  // ✎ Edit opens a box on EVERY entry, not one at a time, so a doctor
  // correcting a list reads and fixes it as a list. Enter in any box finishes
  // the whole edit; Escape abandons it. Nothing reaches the field until then —
  // the boxes are a staged copy, exactly like the + popup's.
  const startInlineEdit = (focus = 0) => {
    if (!editable || !inlineEdit) return;
    setEditLines([...items]);
    setEditFocus(focus);
    setEditOpen(true);
  };

  const commitInlineEdit = () => {
    if (!editOpen) return;
    setEditOpen(false);
    // A blanked box is a mis-key, not a deletion: that line keeps what it had.
    // Removing an entry stays a deliberate act in the + popup.
    const next = items.map((it, i) => editLines[i]?.trim() || it);
    if (next.every((v, i) => v === items[i])) return;
    setItems(next);
    const fresh = next.filter((v) => !items.includes(v));
    if (fresh.length) {
      addRecents(label, fresh);
      fresh.forEach((v) => onAdd?.(v));
    }
  };

  const cancelInlineEdit = () => setEditOpen(false);

  const filteredSugs = getFiltered();

  const greenTag: CSSProperties = { fontSize: 11, color: C.pri[600], background: C.pri[50], padding: "4px 10px 4px 12px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 6, border: `0.5px solid ${C.pri[100]}` };

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Collapsed row: label + add button, then selected items as a bullet list */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 28 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.n[800], cursor: editable ? "pointer" : "default" }} onClick={editable ? handleOpen : undefined}>{label}</span>
        {editable ? (
          <button onClick={handleOpen} style={{ width: 20, height: 20, borderRadius: "50%", border: `1px solid ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = C.n[300]; }}>+</button>
        ) : (
          <span title="View only — you don't have access to edit this section" style={{ fontSize: 10, color: C.n[400] }}>🔒</span>
        )}
        {editable && items.length > 0 && (
          // Same button in both shapes, one line apart in behaviour: the popup
          // for every other field, the in-place boxes for an inlineEdit one.
          <button
            // Counted as part of the edit group, so clicking it does NOT trip
            // the boxes' "left the group → save" blur first. It used to: the
            // blur closed the edit, React re-rendered the button back into its
            // "✎ Edit" role, and the click that followed re-opened the boxes —
            // pressing Done looked like it did nothing.
            {...(inlineEdit ? { "data-inline-edit-group": "" } : {})}
            onClick={inlineEdit ? (editOpen ? commitInlineEdit : () => startInlineEdit(0)) : handleOpen}
            title={inlineEdit ? (editOpen ? "Finish editing (or press Enter)" : "Edit every line here") : undefined}
            style={{ fontSize: 11, color: C.pri[600], background: C.pri[50], border: `0.5px solid ${editOpen ? C.pri[400] : C.pri[100]}`, borderRadius: 6, padding: "2px 10px", cursor: "pointer", fontFamily: "inherit" }}
          >{inlineEdit && editOpen ? "✓ Done" : "✎ Edit"}</button>
        )}
      </div>
      {items.length > 0 && (
        <div data-inline-edit-group style={{ paddingLeft: 14, marginTop: 1, marginBottom: 4 }}>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.n[800], padding: "1.5px 0" }}>
              <span style={{ color: C.n[500], lineHeight: 1.45, flexShrink: 0 }}>•</span>
              {editOpen ? (
                <input
                  autoFocus={idx === editFocus}
                  data-testid={`edit-${idx}`}
                  value={editLines[idx] ?? ""}
                  onChange={(e) => setEditLines((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))}
                  onKeyDown={(e) => {
                    // Enter anywhere finishes the whole edit — the doctor is
                    // done with the list, not with one line of it.
                    if (e.key === "Enter") { e.preventDefault(); commitInlineEdit(); }
                    else if (e.key === "Escape") { e.preventDefault(); cancelInlineEdit(); }
                  }}
                  // Moving between the boxes keeps the edit open; leaving the
                  // group altogether saves it. A correction typed and then
                  // clicked away from must not evaporate.
                  onBlur={(e) => {
                    const to = e.relatedTarget as HTMLElement | null;
                    if (to && to.closest("[data-inline-edit-group]")) return;
                    commitInlineEdit();
                  }}
                  style={{ flex: itemNotes ? "0 0 auto" : 1, minWidth: 0, padding: "1px 6px", borderRadius: 5, border: `0.5px solid ${C.pri[400]}`, fontSize: 12, fontFamily: "inherit", color: C.n[900], background: C.n[0], outline: "none", lineHeight: 1.45 }}
                />
              ) : (
                <span
                  onDoubleClick={inlineEdit ? () => startInlineEdit(idx) : undefined}
                  title={inlineEdit && editable ? "Double-click, or press ✎ Edit, to correct these" : undefined}
                  style={{ flex: itemNotes ? "0 0 auto" : 1, lineHeight: 1.45, cursor: inlineEdit && editable ? "text" : undefined }}
                >{item}</span>
              )}
              {itemNotes && (
                <input
                  value={itemNotes[item] ?? ""}
                  onChange={(e) => onItemNote?.(item, e.target.value)}
                  placeholder={notePlaceholder ?? ""}
                  disabled={!editable}
                  style={{ flex: 1, minWidth: 0, marginLeft: 4, padding: "3px 8px", borderRadius: 5, border: `0.5px solid ${C.n[300]}`, fontSize: 11.5, fontFamily: "inherit", color: C.n[900], outline: "none", background: editable ? C.n[0] : C.n[50] }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* POPUP MODAL */}
      {open && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, padding: 16,
          background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000,
        }} onClick={cancel}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: `min(${pd.length > 0 ? 760 : 520}px, 100%)`, maxWidth: "100%", maxHeight: "80vh", background: C.n[0], borderRadius: 14,
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

            {/* Modal body — with the P.D panel beside it when there is one */}
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            <div style={{ padding: "16px 20px", flex: 1, minWidth: 0, overflowY: "auto" }}>
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

            {/* P.D — this patient's diagnoses from past visits. Read-only text:
                ticking one carries it into today's list, nothing is written back
                to the visit it came from. */}
            {pd.length > 0 && (
              <div style={{ width: 240, flexShrink: 0, borderLeft: `0.5px solid ${C.n[200]}`, background: C.n[50], display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
                <div style={{ padding: "16px 18px 0", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.n[900], letterSpacing: "-0.01em" }}>Previous diagnosis</div>
                <div style={{ fontSize: 10.5, color: C.n[500], marginTop: 2, marginBottom: 10 }}>From this patient&apos;s past visits</div>

                {/* Actions, deliberately NOT a "select all" checkbox: a tickbox
                    that mirrors the rows below reads as though the doctor
                    pressed it when they only picked one diagnosis. */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 8, marginBottom: 10, borderBottom: `0.5px solid ${C.n[200]}` }}>
                  <button onClick={selectAllPd} disabled={allPdChosen} style={{
                    background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: 11.5,
                    color: allPdChosen ? C.n[400] : C.pri[600], cursor: allPdChosen ? "default" : "pointer",
                    textDecoration: allPdChosen ? "none" : "underline", textUnderlineOffset: 2,
                  }}>Select all</button>
                  {pdChosen.length > 0 && (
                    <button onClick={clearAllPd} style={{
                      background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: 11.5,
                      color: C.n[600], cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2,
                    }}>Clear</button>
                  )}
                  <span style={{ fontSize: 10.5, color: C.n[500], marginLeft: "auto" }}>{pdChosen.length}/{pd.length}</span>
                </div>
                </div>

                {/* Only the list scrolls — a long history must not push the
                    heading and the Select all / Clear actions off the panel. */}
                <div data-testid="pd-list" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 18px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {pd.map((d) => (
                    <label key={d} data-testid={`pd-${d}`} style={{ display: "flex", alignItems: "flex-start", gap: 7, cursor: "pointer", userSelect: "none" }}>
                      <input
                        type="checkbox"
                        checked={draft.includes(d)}
                        onChange={() => togglePd(d)}
                        style={{ width: 15, height: 15, marginTop: 1, flexShrink: 0, accentColor: C.pri[400], cursor: "pointer" }}
                      />
                      <span style={{ fontSize: 12, color: draft.includes(d) ? C.pri[600] : C.n[800], lineHeight: 1.35 }}>{d}</span>
                    </label>
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
