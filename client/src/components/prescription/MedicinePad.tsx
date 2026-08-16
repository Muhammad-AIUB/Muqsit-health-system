"use client";

import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { C, font } from "@/theme";
import { useMedicineSearch } from "@/hooks/useMedicineSearch";
import { useRxHabits } from "@/hooks/useRxHabits";
import { fmtMedicine, looksLikeMedicine, parseDose, parseDuration, parseFood, FOOD_HINT } from "@/lib/rxShorthand";
import { parseFlexibleDate } from "@/lib/dateInput";
import { rxHabitsApi, type RxHabitGroup, type RxHabitItem } from "@/lib/api";
import {
  focusIndexAfterInsert,
  insertHabitRows,
  resolveGeneric,
  safeContLines,
  safeHabitText,
} from "@/lib/rxHabitRows";

// "Start From": type 170626 → "17 June 2026". Leaves non-date text untouched.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const formatSF = (v: string): string => {
  const iso = parseFlexibleDate(v);
  if (!iso) return v;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : v;
};

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
  sf?: string; // "Start From" date (IPD pad) — display e.g. "17 June 2026"
  // Generic name, carried only when the line was picked from the medicines
  // table. `drug` holds the BRAND ("Tablet. Entaliv 0.5mg"), so without this a
  // safety rule written against the generic could never see the drug. Cleared
  // the moment the doctor edits the text by hand — a stale generic attached to
  // a different medicine is worse than none.
  generic?: string;
  // This line was inserted from a "Your usual" suggestion rather than typed.
  // Measurement only — `RxItemDto` does not declare it, so ValidationPipe
  // strips it before it can reach `PrescriptionItem`. See `RxItem.fromHabit`.
  fromHabit?: boolean;
}
export const emptyRow = (): Row => ({ drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false });
export const contRow = (): Row => ({ drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: true, continuation: true });

const ROW_H = 40;

// Dose / food / duration cell: an auto-growing textarea so long instructions
// like "2-4 tea spoon full at night, can take 2-3 times a day" wrap onto extra
// lines (growing that row) instead of being clipped to a fixed-width box.
const cellArea: CSSProperties = {
  border: "none", outline: "none", background: "transparent",
  fontSize: 13.5, color: C.n[900], fontFamily: font,
  padding: "7px 4px", lineHeight: 1.35, resize: "none", overflow: "hidden",
  textAlign: "center", display: "block", boxSizing: "border-box",
  minHeight: ROW_H - 8,
};

function AutoCell({ value, onChange, onBlur, onKeyDown, placeholder, title, refCb, style }: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  title?: string;
  refCb: (el: HTMLTextAreaElement | null) => void;
  style: CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const resize = () => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  };
  // Re-measure on every render: the cell's width can change when a sibling
  // (dose/food/duration) gains or loses text and the flexible widths rebalance,
  // which changes how many lines this value wraps to — so height must follow.
  useEffect(resize);
  return (
    <textarea
      ref={(el) => { ref.current = el; refCb(el); }}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      title={title}
      style={style}
    />
  );
}

// ── Prescribing habit suggestions ("Your usual") ────────────
//
// ⚕️ Every character offered here is echoed from a prescription THIS DOCTOR
// already saved and printed. Nothing is generated, nothing is auto-filled — a
// suggestion reaches the pad only by an explicit click.

// "last 15 Aug". `lastUsedAt` is an ISO timestamp from the server, so a plain
// Date parse is correct here — unlike the app's stored dd/mm/yyyy strings, which
// must never go through `new Date(str)` (see client/CLAUDE.md).
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function lastUsedLabel(iso: unknown): string {
  if (typeof iso !== "string") return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return `last ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

// The instruction, exactly as saved. A blank field is simply absent — never
// filled in with a guess.
const instructionLine = (dose: unknown, food: unknown, duration: unknown): string =>
  [safeHabitText(dose), safeHabitText(food), safeHabitText(duration)]
    .map((v) => v.trim())
    .filter(Boolean)
    .join(" · ");

function HabitRow({ habit, dim, onPick, onHide, onRestore }: {
  habit: RxHabitItem;
  dim?: boolean;
  onPick?: () => void;
  onHide?: () => void;
  onRestore?: () => void;
}) {
  const cont = safeContLines(habit?.contLines);
  const n = Number(habit?.patientCount);
  // The count means DISTINCT PATIENTS. It reads "7 patients", never "7×" — a
  // bare × invites the reader to supply their own meaning for the number, and
  // the number is the only thing separating a routine dose from a one-off.
  const patients = Number.isFinite(n) && n > 0 ? `${n} patient${n === 1 ? "" : "s"}` : "";
  const when = lastUsedLabel(habit?.lastUsedAt);
  const meta = [patients, when].filter(Boolean).join(" · ");

  return (
    <div className="habit-row" style={{ display: "flex", alignItems: "flex-start", gap: 6, opacity: dim ? 0.55 : 1 }}>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onPick?.(); }}
        disabled={!onPick}
        style={{
          flex: 1, textAlign: "left", padding: "8px 4px 8px 14px", border: "none",
          background: "transparent", cursor: onPick ? "pointer" : "default", fontFamily: font, minWidth: 0,
        }}
      >
        <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.n[900] }}>{safeHabitText(habit?.drugLabel)}</span>
          <span style={{ fontSize: 12.5, color: C.n[700] }}>
            {instructionLine(habit?.dose, habit?.food, habit?.duration)}
          </span>
        </span>
        {/* Tapering lines preview with the same ↳ the pad uses, so what is shown
            is literally what gets inserted. */}
        {cont.map((c, i) => (
          <span key={i} style={{ display: "block", fontSize: 12, color: C.n[600], paddingLeft: 12 }}>
            ↳ {instructionLine(c.dose, c.food, c.duration)}
          </span>
        ))}
        {meta && <span style={{ display: "block", fontSize: 10.5, color: C.n[500], marginTop: 2 }}>{meta}</span>}
      </button>
      {onHide && (
        <button
          type="button"
          className="habit-x"
          title="Remove this suggestion (your prescriptions are not changed)"
          aria-label="Remove this suggestion"
          onMouseDown={(e) => { e.preventDefault(); onHide(); }}
          style={{ background: "none", border: "none", color: C.n[400], cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "9px 10px", flexShrink: 0, fontFamily: font }}
        >
          ✕
        </button>
      )}
      {onRestore && (
        <button
          type="button"
          title="Bring this suggestion back"
          aria-label="Restore this suggestion"
          onMouseDown={(e) => { e.preventDefault(); onRestore(); }}
          style={{ background: "none", border: "none", color: C.pri[600], cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "9px 10px", flexShrink: 0, fontFamily: font }}
        >
          ↺
        </button>
      )}
    </div>
  );
}

interface Props {
  rows: Row[];
  setRows: Dispatch<SetStateAction<Row[]>>;
  minHeight?: number;
  noteText?: string;      // placeholder for the trailing empty line
  showCheck?: boolean;    // per-row checkboxes + "Select all" (default true)
  showSF?: boolean;       // "Start From" date box before each medicine (IPD)
  // Show the doctor's learned "Your usual" suggestions above the medicine
  // results. OPD prescription pad ONLY (v1 wedge, design D5): the IPD order
  // sheet, the Drug-history pad and the template editor all render this same
  // component and must NOT inherit outpatient dose suggestions. Defaults to
  // false so a new caller can never pick them up silently.
  showHabits?: boolean;
}

export default function MedicinePad({ rows, setRows, minHeight, noteText, showCheck = true, showSF = false, showHabits = false }: Props) {
  const [acRow, setAcRow] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const drugRefs = useRef<(HTMLInputElement | null)[]>([]);
  const doseRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const foodRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const durRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const acQuery = acRow != null ? rows[acRow]?.drug ?? "" : "";
  const { results: acItems } = useMedicineSearch(acQuery);
  const { groups: habitGroups, refresh: refreshHabits } = useRxHabits(showHabits ? acQuery : "");

  // Which medicine's hidden suggestions the doctor has chosen to reveal.
  const [showHiddenFor, setShowHiddenFor] = useState<string | null>(null);
  // Transient "Removed …" bar. It lives OUTSIDE the dropdown on purpose: the
  // dropdown closes the moment the doctor clicks, so an Undo rendered inside it
  // would disappear with it — leaving ✕ as a one-way door.
  const [habitUndo, setHabitUndo] = useState<{ id: string; label: string } | null>(null);

  // Hiding is not destructive (the prescription record is never touched), so a
  // failure is reported by simply putting the suggestion back where it was —
  // never by an error a doctor could read as "you have no habits".
  const setHabitHidden = (habit: RxHabitItem, hidden: boolean) => {
    const id = safeHabitText(habit?.id);
    if (!id) return;
    rxHabitsApi
      .setFlags(id, { hidden })
      .catch(() => undefined)
      .finally(() => refreshHabits());
    if (hidden) {
      const label = [safeHabitText(habit?.drugLabel), instructionLine(habit?.dose, habit?.food, habit?.duration)]
        .filter(Boolean)
        .join("  ");
      setHabitUndo({ id, label });
    } else {
      setHabitUndo(null);
    }
  };

  // Click-to-insert: the whole block lands in one `setRows`, nothing already on
  // the pad is overwritten, and the caret goes to the NEXT medicine row (the
  // clicked row is already complete, so focusing `dose` would be wrong).
  const pickHabit = (idx: number, habit: RxHabitItem) => {
    const generic = resolveGeneric(safeHabitText(habit?.drugLabel), acItems);
    setRows((prev) => insertHabitRows(prev, idx, habit, generic));
    setAcRow(null);
    setShowHiddenFor(null);
    const next = focusIndexAfterInsert(idx, habit);
    setTimeout(() => drugRefs.current[next]?.focus(), 30);
  };

  const hasHabits = (g: RxHabitGroup) => g.items.length > 0 || g.hiddenCount > 0;
  const visibleHabitGroups = showHabits ? habitGroups.filter(hasHabits) : [];

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
          background: C.n[0],
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
            <div key={idx} style={{ position: "relative", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, rowGap: 4, minHeight: ROW_H, borderBottom: `0.5px solid ${C.n[200]}`, zIndex: acRow === idx ? 5 : undefined }}>
              {/* Checkbox (optional) + serial — only for medicine head rows */}
              <div style={{ width: showCheck ? 44 : 26, display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                {isHead && (
                  <>
                    {showCheck && <input type="checkbox" checked={row.checked} onChange={(e) => updateRow(idx, { checked: e.target.checked })} style={{ width: 14, height: 14, accentColor: C.pri[400], cursor: "pointer" }} />}
                    <span style={{ fontSize: 12, color: C.n[500], width: 18, textAlign: "right" }}>{medNumbers[idx]}.</span>
                  </>
                )}
              </div>

              {/* Start From date box — before each medicine (IPD pad only) */}
              {showSF && isHead && (
                <span style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }} title="Start From — type a date like 170626">
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.pri[600] }}>SF:</span>
                  <input
                    value={row.sf ?? ""}
                    onChange={(e) => updateRow(idx, { sf: e.target.value })}
                    onBlur={() => updateRow(idx, { sf: formatSF(row.sf ?? "") })}
                    placeholder="date"
                    style={{ width: 96, padding: "3px 7px", borderRadius: 5, border: `0.5px solid ${C.n[300]}`, fontSize: 11, fontFamily: font, color: C.n[900], outline: "none", background: C.n[0] }}
                  />
                </span>
              )}

              {/* Medicine column: name (or indent) + >>> tapering button */}
              <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
                {isCont ? (
                  <span style={{ flex: 1, color: C.n[400], fontSize: 13, paddingLeft: 6 }}>↳</span>
                ) : (
                  <input
                    ref={(el) => { drugRefs.current[idx] = el; }}
                    value={row.drug}
                    onChange={(e) => { updateRow(idx, { drug: e.target.value, generic: undefined, fromHabit: undefined }); setAcRow(idx); }}
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

                {!isCont && acRow === idx && (acItems.length > 0 || visibleHabitGroups.length > 0 || (looksLikeMedicine(row.drug) && !row.isMedicine)) && (
                  <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, minWidth: 200, maxWidth: "min(520px, 92vw)", background: C.n[0], border: `1px solid ${C.n[300]}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.22)", zIndex: 50, maxHeight: 320, overflowY: "auto" }}>
                    {/* "Your usual" — this doctor's own past instructions for the
                        medicine being typed. Renders NOTHING when there are none:
                        on a clinical screen an empty state and a failed lookup
                        must not look alike, and the safe rendering of both is
                        silence plus a working dropdown. */}
                    {visibleHabitGroups.length > 0 && (
                      <div style={{ borderBottom: `1px solid ${C.n[200]}`, background: C.pri[50] + "22" }}>
                        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: C.n[500], padding: "8px 14px 4px" }}>
                          Your usual
                        </div>
                        {visibleHabitGroups.map((g) => (
                          <div key={g.drugKey} style={{ paddingBottom: 4 }}>
                            {g.items.map((h) => (
                              <HabitRow
                                key={h.id}
                                habit={h}
                                onPick={() => pickHabit(idx, h)}
                                onHide={() => setHabitHidden(h, true)}
                              />
                            ))}
                            {g.hiddenCount > 0 && (
                              showHiddenFor === g.drugKey ? (
                                <>
                                  {g.hidden.map((h) => (
                                    <HabitRow key={h.id} habit={h} dim onRestore={() => setHabitHidden(h, false)} />
                                  ))}
                                  <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); setShowHiddenFor(null); }}
                                    style={{ background: "none", border: "none", color: C.n[500], cursor: "pointer", fontSize: 11, padding: "4px 14px 8px", fontFamily: font }}
                                  >
                                    Hide again
                                  </button>
                                </>
                              ) : (
                                // The permanent way back. Without it ✕ is a
                                // one-way door: a doctor who dismisses the Undo
                                // bar and changes their mind the next day would
                                // have no route to the suggestion, and no way to
                                // learn why it stopped appearing.
                                <button
                                  type="button"
                                  onMouseDown={(e) => { e.preventDefault(); setShowHiddenFor(g.drugKey); }}
                                  style={{ background: "none", border: "none", color: C.n[500], cursor: "pointer", fontSize: 11, padding: "2px 14px 8px", fontFamily: font, textAlign: "left" }}
                                >
                                  {g.hiddenCount} hidden — show
                                </button>
                              )
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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
                          updateRow(idx, { drug: fmtMedicine(m), isMedicine: true, generic: m.genericName ?? undefined });
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

              {/* Dose + food + duration share a flexible region: each cell's
                  width follows its content length, so a long value borrows room
                  from its emptier neighbours (and vice versa) and stays on as
                  few lines as possible instead of stacking in a narrow column. */}
              {row.isMedicine && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "1 1 240px", minWidth: 0 }}>
                  <AutoCell
                    refCb={(el) => { doseRefs.current[idx] = el; }}
                    value={row.dose}
                    onChange={(v) => updateRow(idx, { dose: v })}
                    onBlur={() => updateRow(idx, { dose: parseDose(row.dose) })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); updateRow(idx, { dose: parseDose(row.dose) }); foodRefs.current[idx]?.focus(); } }}
                    placeholder="dose"
                    style={{ ...cellArea, flex: `${Math.max(10, row.dose.length)} 1 0`, minWidth: 52 }}
                  />
                  <AutoCell
                    refCb={(el) => { foodRefs.current[idx] = el; }}
                    value={row.food}
                    onChange={(v) => updateRow(idx, { food: v })}
                    onBlur={() => updateRow(idx, { food: parseFood(row.food) })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); updateRow(idx, { food: parseFood(row.food) }); durRefs.current[idx]?.focus(); } }}
                    placeholder="food"
                    title={FOOD_HINT}
                    style={{ ...cellArea, flex: `${Math.max(10, row.food.length)} 1 0`, minWidth: 52 }}
                  />
                  <AutoCell
                    refCb={(el) => { durRefs.current[idx] = el; }}
                    value={row.duration}
                    onChange={(v) => updateRow(idx, { duration: v })}
                    onBlur={() => updateRow(idx, { duration: parseDuration(row.duration) })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); updateRow(idx, { duration: parseDuration(row.duration) }); drugRefs.current[idx + 1]?.focus(); } }}
                    placeholder="duration"
                    style={{ ...cellArea, flex: `${Math.max(10, row.duration.length)} 1 0`, minWidth: 52 }}
                  />
                </div>
              )}

              {editMode && (started || isCont) && (
                <button onClick={() => removeRow(idx)} style={{ background: "none", border: "none", color: C.danger[400], cursor: "pointer", fontSize: 15, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>×</button>
              )}
            </div>
          );
        })}
      </div>

      {/* Undo for a hidden suggestion. Outside the dropdown, because the
          dropdown closes on the very click that raises this. */}
      {habitUndo && (
        <div className="habit-undo" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, fontSize: 12.5, color: C.n[700], background: C.n[0], border: `1px solid ${C.n[200]}`, borderRadius: 10, padding: "10px 14px", boxShadow: "0 2px 8px rgba(15,23,32,0.06)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.danger[400], flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Removed suggestion <b style={{ fontWeight: 600, color: C.n[900] }}>{habitUndo.label}</b>
            </span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button
              className="habit-undo-btn"
              onClick={() => {
                const id = habitUndo.id;
                setHabitUndo(null);
                rxHabitsApi.setFlags(id, { hidden: false }).catch(() => undefined).finally(() => refreshHabits());
              }}
            >
              ↺ Undo
            </button>
            <button onClick={() => setHabitUndo(null)} title="Dismiss" aria-label="Dismiss" style={{ background: "none", border: "none", color: C.n[400], cursor: "pointer", fontSize: 17, lineHeight: 1, padding: "2px 5px", borderRadius: 6 }}>×</button>
          </span>
        </div>
      )}

      {showHabits && (
        <style>{`
          .habit-row .habit-x{opacity:0;transition:opacity .12s ease}
          .habit-row:hover .habit-x,.habit-row .habit-x:focus-visible{opacity:1}
          .habit-row:hover{background:${C.pri[50]}}
          .habit-x:hover{color:${C.danger[400]}}
          .habit-undo{animation:habitUndoIn .18s ease}
          @keyframes habitUndoIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
          .habit-undo-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid ${C.pri[400]};background:${C.n[0]};
            color:${C.pri[600]};font-weight:600;font-size:12.5px;padding:6px 15px;border-radius:999px;cursor:pointer;
            font-family:inherit;transition:all .12s ease}
          .habit-undo-btn:hover{background:${C.pri[50]}}
          /* Touch devices have no hover, so the ✕ must be permanently visible
             or hiding a suggestion would be unreachable on a phone. */
          @media (hover:none){.habit-row .habit-x{opacity:1}}
        `}</style>
      )}
    </div>
  );
}
