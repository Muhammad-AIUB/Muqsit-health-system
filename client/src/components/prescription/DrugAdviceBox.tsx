"use client";

// ⚕️ The ℞ pad's ••• box: the doctor's own special advice for one medicine
// (physician's design, 2026-09-24).
//
//  • Instruction names the medicine it was opened from, exactly as written.
//  • Two scopes: "Only for this medicine" (strength included) and "For all drugs
//    of this group" (every brand of the same generic). A medicine with no
//    generic on record — typed by hand — cannot take group advice.
//  • Every line carries a tick, ticked by default. The tick is THIS VISIT's:
//    a ticked line sits in the prescription's Advice section, an unticked one
//    does not, and the next patient gets every line ticked again.
//  • Edit makes the lines editable; Save stores them for this doctor. The save
//    is NOT optimistic — the box stays open with the text if it fails, so
//    advice that was never stored can't look saved.
//
// Nothing here writes to the prescription directly: the Advice-section mirror
// in MuqsitContext (lib/rxDrugAdvice.ts) does that from the saved lines and
// the ticks, and it only ever withdraws lines it added itself.

import { useEffect, useMemo, useRef, useState } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { useSaveDrugAdvice } from "@/hooks/useDrugAdvice";
import { adviceLines, drugKeyOf, offKey, savedAdviceFor, type AdviceScope } from "@/lib/rxDrugAdvice";
import { BANGLA_ATTR } from "@/lib/banglaInput";
import { ApiError } from "@/lib/api";

interface Line { text: string; checked: boolean }

const MAX_LINES = 30;

export default function DrugAdviceBox({ drug, generic, onClose }: { drug: string; generic?: string; onClose: () => void }) {
  const { savedDrugAdvice, rxAdviceOff, setRxAdviceOff, can } = useMuqsit();
  const save = useSaveDrugAdvice();
  const mayEdit = can("rx.advice");
  const dk = drugKeyOf(drug);
  const genericName = (generic ?? "").trim();

  const saved = useMemo(() => savedAdviceFor({ drug, generic: genericName }, savedDrugAdvice), [drug, genericName, savedDrugAdvice]);
  const offSet = useMemo(() => new Set(rxAdviceOff), [rxAdviceOff]);
  const fromSaved = (scope: AdviceScope): Line[] =>
    adviceLines(scope === "medicine" ? saved.medicine : saved.generic).map((text) => ({ text, checked: !offSet.has(offKey(dk, text)) }));

  const [scope, setScope] = useState<AdviceScope>(() => (!saved.medicine && saved.generic ? "generic" : "medicine"));
  const [editing, setEditing] = useState(false);
  // One working copy per scope, so switching the radio never loses typing.
  const [drafts, setDrafts] = useState<Record<AdviceScope, Line[]>>(() => ({ medicine: fromSaved("medicine"), generic: fromSaved("generic") }));
  const [dirty, setDirty] = useState<Record<AdviceScope, boolean>>({ medicine: false, generic: false });
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const focusLast = useRef(false);
  const anyDirty = dirty.medicine || dirty.generic;
  const listRef = useRef<HTMLDivElement>(null);

  // While NOT editing, the view follows what is stored — a tick changed here
  // or on another device shows up straight away.
  useEffect(() => {
    if (editing || anyDirty) return;
    setDrafts({ medicine: fromSaved("medicine"), generic: fromSaved("generic") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, offSet, editing, anyDirty]);

  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    const inputs = listRef.current?.querySelectorAll<HTMLInputElement>("input[type=text]");
    inputs?.[inputs.length - 1]?.focus();
  });

  const lines = drafts[scope];
  const setLines = (next: Line[]) => {
    setDrafts((d) => ({ ...d, [scope]: next }));
    setDirty((d) => ({ ...d, [scope]: true }));
    setConfirmClose(false);
  };

  // A tick outside Edit is this visit's choice and applies at once.
  const toggleNow = (text: string, checked: boolean) => {
    const k = offKey(dk, text);
    setRxAdviceOff((prev) => (checked ? prev.filter((x) => x !== k) : prev.includes(k) ? prev : [...prev, k]));
  };

  const addLine = () => {
    if (lines.length >= MAX_LINES) return;
    setEditing(true);
    focusLast.current = true;
    setLines([...lines, { text: "", checked: true }]);
  };

  const requestClose = () => {
    if (editing && anyDirty && !confirmClose) { setConfirmClose(true); return; }
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const doSave = async () => {
    setError("");
    const scopes = (["medicine", "generic"] as AdviceScope[]).filter((s) => dirty[s]);
    try {
      for (const s of scopes) {
        if (s === "generic" && !genericName) continue;
        const clean = drafts[s].map((l) => ({ ...l, text: l.text.trim() })).filter((l) => l.text);
        await save.mutateAsync({ scope: s, label: s === "medicine" ? drug : genericName, lines: clean.map((l) => l.text) });
      }
    } catch (e) {
      setError(e instanceof ApiError ? `Advice NOT saved: ${e.message}` : "Advice NOT saved. Is the connection up?");
      return; // box stays open with every line — nothing is lost
    }
    // Stored — now this visit's ticks for the lines just written.
    const all = [...drafts.medicine, ...drafts.generic].map((l) => ({ ...l, text: l.text.trim() })).filter((l) => l.text);
    setRxAdviceOff((prev) => {
      const next = new Set(prev);
      for (const l of all) {
        const k = offKey(dk, l.text);
        if (l.checked) next.delete(k); else next.add(k);
      }
      return [...next];
    });
    onClose();
  };

  const radio = (value: AdviceScope, label: string, disabled: boolean, hint?: string) => (
    <label
      title={hint}
      style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: disabled ? C.n[500] : C.n[800], cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <input type="radio" name="drug-advice-scope" checked={scope === value} disabled={disabled} onChange={() => setScope(value)} style={{ accentColor: C.pri[400], width: 15, height: 15, margin: 0 }} />
      {label}
    </label>
  );

  const btn = (primary: boolean) => ({
    padding: "7px 18px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, fontFamily: font, cursor: "pointer",
    border: `1px solid ${primary ? C.pri[400] : C.n[300]}`, background: primary ? C.pri[400] : C.n[0], color: primary ? C.n[0] : C.n[800],
  });

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div role="dialog" aria-modal="true" aria-label="Special advice" style={{ width: "min(520px, 92vw)", maxHeight: "86vh", display: "flex", flexDirection: "column", background: C.n[0], borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.18)", fontFamily: font }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px 10px", borderBottom: `0.5px solid ${C.n[200]}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.n[900] }}>Special advice</div>
          <button type="button" onClick={requestClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 18, lineHeight: 1, color: C.n[500], cursor: "pointer", padding: "2px 6px" }}>×</button>
        </div>

        <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.n[500], textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Instruction</div>
            <div style={{ padding: "8px 10px", borderRadius: 7, background: C.n[50], border: `0.5px solid ${C.n[200]}`, fontSize: 13.5, color: C.n[900] }}>{drug}</div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 22px" }}>
            {radio("medicine", "Only for this medicine", false)}
            {radio(
              "generic",
              genericName ? `For all drugs of this group (${genericName})` : "For all drugs of this group",
              !genericName,
              genericName ? undefined : "No generic is on record for this line — pick the medicine from the list to give advice to its whole group.",
            )}
          </div>
          {!genericName && (
            <div style={{ fontSize: 11.5, color: C.n[500], marginTop: -6 }}>
              No generic is on record for this line, so group advice is not available. Pick the medicine from the medicine list to use it.
            </div>
          )}

          {/* Lines */}
          <div ref={listRef} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {lines.length === 0 && (
              <div style={{ fontSize: 12.5, color: C.n[500], padding: "6px 0" }}>
                {scope === "medicine" ? "No advice for this medicine yet." : "No advice for this group yet."}
              </div>
            )}
            {lines.map((l, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={l.checked}
                  disabled={!mayEdit || (editing ? false : !l.text)}
                  title={l.checked ? "Included in this prescription's Advice — untick to leave it out" : "Left out of this prescription — tick to include"}
                  onChange={(e) => {
                    if (editing) setLines(lines.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)));
                    else toggleNow(l.text, e.target.checked);
                  }}
                  style={{ width: 15, height: 15, accentColor: C.pri[400], flexShrink: 0, cursor: "pointer" }}
                />
                {editing ? (
                  <>
                    <input
                      type="text"
                      {...BANGLA_ATTR}
                      value={l.text}
                      maxLength={400}
                      placeholder="Write the advice…"
                      onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLine(); } }}
                      style={{ flex: 1, minWidth: 0, padding: "6px 9px", borderRadius: 6, border: `0.5px solid ${C.n[300]}`, fontSize: 13, fontFamily: font, color: C.n[900], outline: "none" }}
                    />
                    <button
                      type="button"
                      aria-label="Remove this line"
                      title="Remove this line"
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                      style={{ width: 22, height: 22, borderRadius: "50%", border: "none", background: C.danger[50], color: C.danger[800], cursor: "pointer", fontSize: 12, lineHeight: 1, flexShrink: 0 }}
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <span style={{ flex: 1, fontSize: 13, color: l.checked ? C.n[900] : C.n[500], textDecoration: l.checked ? undefined : "line-through" }}>{l.text}</span>
                )}
              </div>
            ))}
          </div>

          {mayEdit && (
            <button
              type="button"
              onClick={addLine}
              disabled={lines.length >= MAX_LINES || (scope === "generic" && !genericName)}
              style={{ alignSelf: "flex-start", padding: "6px 12px", borderRadius: 7, border: `1px dashed ${C.pri[400]}`, background: C.pri[50], color: C.pri[800], fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: font }}
            >
              + Add Advice
            </button>
          )}
          {!mayEdit && (
            <div style={{ fontSize: 11.5, color: C.n[500] }}>You do not have permission to edit advice in this practice.</div>
          )}
        </div>

        {/* Footer: Edit + Save, and anything that went wrong beside them */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderTop: `0.5px solid ${C.n[200]}` }}>
          <div style={{ flex: 1, fontSize: 12, color: error || confirmClose ? C.danger[800] : C.n[500] }}>
            {error || (confirmClose ? (
              <span>Unsaved advice. <button type="button" onClick={onClose} style={{ border: "none", background: "none", color: C.danger[800], textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 12, fontFamily: font }}>Discard it</button> or Save.</span>
            ) : "")}
          </div>
          {mayEdit && (
            <>
              <button type="button" onClick={() => setEditing(true)} disabled={editing} style={{ ...btn(false), opacity: editing ? 0.55 : 1, cursor: editing ? "default" : "pointer" }}>Edit</button>
              <button type="button" onClick={doSave} disabled={save.isPending || !anyDirty} style={{ ...btn(true), opacity: save.isPending || !anyDirty ? 0.55 : 1, cursor: save.isPending || !anyDirty ? "default" : "pointer" }}>
                {save.isPending ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
