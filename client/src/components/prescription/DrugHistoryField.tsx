"use client";

import { useState } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { isoToDdmmyyyy } from "@/lib/dateInput";
import { appendBlocks, blocksFromRows, moveSummary, type HistoryBlock } from "@/lib/drugHistorySelect";
import HideToggle from "@/components/common/HideToggle";

// ── Date-stamped drug history ───────────────────────────────
// One list, each entry stamped with the visit date it was added on:
//   "dd/mm/yyyy: Drug — dose — food — duration"   (medicine)
//   "dd/mm/yyyy(note): free text"                 (note line)
//   "dd/mm/yyyy(cont): dose — food — duration"    (tapering line)
// The Current vs Distant-past split is DERIVED, not stored: entries dated on the
// current visit are "Current medications"; everything older auto-moves to
// "Distant past medication" once the visit date advances.
//
// ⚕️ Neither tab is EDITABLE (physician's decision, 2026-09-07, still in force).
// Current medications is a VIEW of what is on today's ℞: the pad writes it
// through the mirror in `MuqsitContext` (lib/rxDrugHistory.ts), and the pad is
// where it is corrected. This modal has no medicine pad and no way to change a
// stored entry. Do not re-add an editor here without asking: two writable
// surfaces over one list is how a typed correction silently loses to the mirror.
//
// What it DOES offer, since 2026-09-21 (physician's decision), is SELECTION.
// Every medicine row carries a checkbox; "Select all" ticks the tab, and
// "Move to Rx" appends the ticked blocks to today's ℞ pad — the same write the
// per-row "↻ Rx" button did until now, one press instead of twenty. The rules of
// that write live in `lib/drugHistorySelect.ts`: it invents no dose, sends a
// taper only with the medicine it belongs to, and skips only a line already on
// the pad. The controls render solely for `rx.medicines` — an assistant who may
// read the history but not write medicines sees the list exactly as it was.
const DATE_RE = /^(\d{2}\/\d{2}\/\d{4})(\(note\)|\(cont\))?:\s*(.*)$/;
const OLD_RE = /^(Current|Past)(\(note\)|\(cont\))?:\s*(.*)$/; // legacy entries
const PAST_MARKER = "01/01/2000";

type Kind = "med" | "note" | "cont";
interface Parsed { date: string; kind: Kind; body: string; }

const kindOf = (suffix?: string): Kind => (suffix === "(note)" ? "note" : suffix === "(cont)" ? "cont" : "med");

function parseEntry(s: string, currentDate: string): Parsed {
  let m = s.match(DATE_RE);
  if (m) return { date: m[1], kind: kindOf(m[2]), body: m[3] };
  m = s.match(OLD_RE);
  if (m) return { date: m[1] === "Past" ? PAST_MARKER : currentDate, kind: kindOf(m[2]), body: m[3] };
  return { date: currentDate, kind: "med", body: s };
}

const ts = (d: string): number => { const [dd, mm, yy] = d.split("/").map(Number); return new Date(yy || 0, (mm || 1) - 1, dd || 1).getTime() || 0; };

/** "Drug — dose — food — duration" → the cells, blanks kept as blanks. */
const cells = (body: string): string[] => body.split(" — ").map((x) => x.trim());

const ROW_COLS = "26px minmax(0,1.7fr) 0.75fr 0.75fr 0.75fr";
/** The same grid with a leading column for the tick. */
const ROW_COLS_PICK = `20px ${ROW_COLS}`;

/** rowIndex → the block it belongs to, and whether it is that block's head. */
function tickMap(blocks: HistoryBlock[]): Map<number, { key: string; head: boolean }> {
  const m = new Map<number, { key: string; head: boolean }>();
  for (const b of blocks) b.rows.forEach((r, i) => m.set(r, { key: b.key, head: i === 0 }));
  return m;
}

/** One row's tick. A taper's is dimmed and fixed: it travels with its medicine. */
function Tick({ checked, dim, label, onToggle }: { checked: boolean; dim?: boolean; label: string; onToggle?: () => void }) {
  return (
    <input
      type="checkbox" checked={checked} disabled={dim} aria-label={label}
      onChange={() => onToggle?.()}
      style={{ width: 13, height: 13, margin: 0, accentColor: C.pri[400], cursor: dim ? "default" : "pointer", opacity: dim ? 0.4 : 1 }}
    />
  );
}

interface Props {
  items: string[];
  /** True when the whole Drug history section is kept off the printed sheet. */
  hidden?: boolean;
  /** Opt-in: given, the ⊘ Hide toggle renders beside the badge. */
  onHidden?: (next: boolean) => void;
}

export default function DrugHistoryField({ items, hidden, onHidden }: Props) {
  const { setRxItems, rxItems, ptDate, can } = useMuqsit();
  const cd = isoToDdmmyyyy(ptDate); // current visit date, dd/mm/yyyy
  // ⚕️ The ℞ pad's own key. Without it the pad is locked in RightColumn, so the
  // ticks and the Move button must not offer a way around that lock.
  const canRx = can("rx.medicines");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"current" | "past">("current");
  const [rxMsg, setRxMsg] = useState("");
  // Selection is per tab, so the number on the button is always what is ticked
  // in front of the doctor. Switching tabs keeps the other tab's ticks.
  const [selCurrent, setSelCurrent] = useState<Set<string>>(new Set());
  const [selPast, setSelPast] = useState<Set<string>>(new Set());

  const parsed = items.map((raw) => ({ raw, ...parseEntry(raw, cd) }));
  const todays = parsed.filter((p) => p.date === cd && p.body.trim());
  const currentMeds = todays.filter((p) => p.kind === "med");
  const pastParsed = parsed.filter((p) => p.date !== cd);
  const pastGroups = (() => {
    const map = new Map<string, Parsed[]>();
    for (const p of pastParsed) { const a = map.get(p.date); if (a) a.push(p); else map.set(p.date, [p]); }
    return Array.from(map.entries()).map(([date, list]) => ({ date, list })).sort((a, b) => ts(b.date) - ts(a.date));
  })();
  // Medicines are numbered as they are on the ℞; a tapering line belongs to the
  // medicine above it and takes no number of its own.
  const todaysNumbers = (() => { let n = 0; return todays.map((p) => (p.kind === "med" ? ++n : 0)); })();
  const pastCount = pastParsed.filter((p) => p.kind === "med").length;

  // The selectable blocks of each list. Distant past is blocked ONE DATE GROUP
  // at a time, so a tapering line can never attach itself to a medicine
  // prescribed on a different visit.
  const currentBlocks = blocksFromRows(todays, "current");
  const currentTicks = tickMap(currentBlocks);
  const pastGroupBlocks = pastGroups.map((g) => blocksFromRows(g.list, g.date));
  const pastTicks = pastGroupBlocks.map(tickMap);
  const pastBlocks = pastGroupBlocks.flat();

  const blocks = tab === "current" ? currentBlocks : pastBlocks;
  const sel = tab === "current" ? selCurrent : selPast;
  const setSel = tab === "current" ? setSelCurrent : setSelPast;
  const pickedCount = blocks.filter((b) => sel.has(b.key)).length;
  const allPicked = blocks.length > 0 && pickedCount === blocks.length;

  const clearPicks = () => { setSelCurrent(new Set()); setSelPast(new Set()); setRxMsg(""); };
  const handleOpen = () => { setTab("current"); clearPicks(); setOpen(true); };
  const close = () => { setOpen(false); clearPicks(); };

  const toggle = (key: string) => setSel((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleAll = () => setSel(allPicked ? new Set() : new Set(blocks.map((b) => b.key)));

  // Append every ticked block to today's ℞.
  //
  // ⚕️ Nothing here completes a stored entry. The button this replaced filled a
  // missing dose with `1+0+1`, food with `After meal` and duration with
  // `Continue`; a medicine recorded with no dose now reaches the pad with no
  // dose, and the doctor writes it there. `appendBlocks` holds the rest.
  const moveToRx = () => {
    const chosen = blocks.filter((b) => sel.has(b.key));
    if (!chosen.length) return;
    // Counted against the pad as it stands, for the message; applied against the
    // array React hands back, so a pad edit made meanwhile is never overwritten.
    const { added, skipped } = appendBlocks(chosen, rxItems);
    setRxItems((prev) => {
      const r = appendBlocks(chosen, prev);
      return r.items.length ? [...prev, ...r.items] : prev;
    });
    setSel(new Set());
    setRxMsg(moveSummary(added, skipped));
    setTimeout(() => setRxMsg(""), 4000);
  };

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Collapsed row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minHeight: 28 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.n[800], paddingTop: 4, cursor: "pointer" }} onClick={handleOpen}>Drug history</span>
        {items.length === 0 ? (
          <button onClick={handleOpen} title="View drug history"
            style={{ height: 22, borderRadius: 999, border: `1px solid ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 11, padding: "0 10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0, fontFamily: font }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = C.n[300]; }}>view</button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 2, flexWrap: "wrap" }}>
            <button onClick={handleOpen} title="View drug history"
              style={{ fontSize: 11, color: C.pri[600], background: C.pri[50], border: `0.5px solid ${C.pri[400]}`, padding: "2px 10px", borderRadius: 999, cursor: "pointer", fontFamily: font, display: "inline-flex", alignItems: "center", gap: 5 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.pri[100] ?? C.pri[50])}
              onMouseLeave={(e) => (e.currentTarget.style.background = C.pri[50])}>
              💊 {currentMeds.length} current{pastCount ? ` · ${pastCount} past` : ""} · view
            </button>
            {/* ⚕️ The whole section, on or off the printed sheet (physician's
                decision, 2026-09-21). No per-line ticks here, deliberately: the
                medicines are behind the modal, so a tick would mark something
                the doctor cannot see from this row. */}
            {onHidden && <HideToggle hidden={!!hidden} onToggle={() => onHidden(!hidden)} what="Drug history" />}
          </div>
        )}
      </div>

      {/* Modal */}
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={close}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 680, maxWidth: "95vw", height: "82vh", maxHeight: "82vh", background: C.n[0], borderRadius: 14, border: `0.5px solid ${C.n[200]}`, boxShadow: "0 12px 40px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `0.5px solid ${C.n[200]}` }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, color: C.n[900] }}>Drug history</div>
                <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Today&apos;s ℞ medicines show under <b>Current</b> ({cd}); they move to <b>Distant past</b> automatically on the next visit. Change them on the prescription.</div>
              </div>
              <button onClick={close} style={{ width: 28, height: 28, borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, rowGap: 8, padding: "12px 20px 4px" }}>
              <button onClick={() => setTab("current")}
                style={{ padding: "8px 16px", borderRadius: 999, border: `1px solid ${tab === "current" ? C.pri[400] : C.n[200]}`, background: tab === "current" ? C.pri[50] : C.n[0], color: tab === "current" ? C.pri[600] : C.n[600], fontSize: 12.5, fontWeight: tab === "current" ? 600 : 400, cursor: "pointer", fontFamily: font }}>
                Current medications{currentMeds.length ? ` (${currentMeds.length})` : ""}
              </button>
              <button onClick={() => setTab("past")}
                style={{ padding: "8px 16px", borderRadius: 999, border: `1px solid ${tab === "past" ? C.pri[400] : C.n[200]}`, background: tab === "past" ? C.pri[50] : C.n[0], color: tab === "past" ? C.pri[600] : C.n[600], fontSize: 12.5, fontWeight: tab === "past" ? 600 : 400, cursor: "pointer", fontFamily: font }}>
                Distant past medication{pastCount ? ` (${pastCount})` : ""}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 20px" }}>
              {tab === "current" ? (
                todays.length === 0 ? (
                  <>
                    <div style={{ fontSize: 12.5, color: C.n[500], padding: "14px 4px 6px" }}>
                      Nothing on today&apos;s prescription yet. Every medicine written on the ℞ appears here.
                    </div>
                    {/* Only when the most-recent past entry is from within the last
                        3 days — i.e. a resumed stale draft whose entries have just
                        moved to Distant past. A normal returning patient (last visit
                        weeks ago) would otherwise see it on every new visit. */}
                    {pastGroups.length > 0 && pastGroups[0].date !== PAST_MARKER &&
                      ts(pastGroups[0].date) > Date.now() - 3 * 86_400_000 && (
                      <div style={{ fontSize: 12, color: C.n[500], padding: "0 4px 6px", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>Previous visit&apos;s medications are in</span>
                        <button onClick={() => setTab("past")} style={{ color: C.pri[500], background: "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: font, padding: 0, textDecoration: "underline" }}>Distant Past →</button>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ paddingTop: 8 }}>
                    {todays.map((p, i) => {
                      const parts = cells(p.body);
                      const last = i === todays.length - 1;
                      const row = { display: "grid", gridTemplateColumns: canRx ? ROW_COLS_PICK : ROW_COLS, gap: 8, alignItems: "baseline", padding: "8px 0", borderBottom: last ? "none" : `0.5px solid ${C.n[100]}`, fontSize: 12.5 };
                      const tick = canRx ? currentTicks.get(i) : undefined;
                      const tickCell = canRx ? (
                        <span style={{ display: "flex", alignItems: "center", paddingTop: 2 }}>
                          {tick ? (
                            <Tick checked={sel.has(tick.key)} dim={!tick.head}
                              label={tick.head ? `Select ${parts[0]}` : "Part of the medicine above"}
                              onToggle={tick.head ? () => toggle(tick.key) : undefined} />
                          ) : null}
                        </span>
                      ) : null;
                      if (p.kind === "note") return (
                        <div key={i} style={row}>
                          {tickCell}
                          <span />
                          <i style={{ gridColumn: canRx ? "3 / -1" : "2 / -1", color: C.n[600] }}>{p.body}</i>
                        </div>
                      );
                      const isCont = p.kind === "cont";
                      // A tapering line repeats the medicine above it with another
                      // dose, so its three values sit in the same three columns.
                      const [dose, food, duration] = isCont
                        ? [parts[0] ?? "", parts[1] ?? "", parts[2] ?? ""]
                        : [parts[1] ?? "", parts[2] ?? "", parts[3] ?? ""];
                      return (
                        <div key={i} style={row}>
                          {tickCell}
                          <span style={{ color: C.n[400], fontSize: 11.5 }}>{isCont ? "↳" : `${todaysNumbers[i]}.`}</span>
                          <span style={{ color: C.n[900], fontWeight: isCont ? 400 : 500, overflowWrap: "anywhere" }}>{isCont ? "" : parts[0]}</span>
                          <span style={{ color: C.n[700] }}>{dose}</span>
                          <span style={{ color: C.n[700] }}>{food}</span>
                          <span style={{ color: C.n[700] }}>{duration}</span>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : pastGroups.length === 0 ? (
                <div style={{ fontSize: 12.5, color: C.n[500], padding: "14px 4px" }}>No earlier-visit medications yet. Whatever is prescribed today moves here on the patient&apos;s next visit.</div>
              ) : (
                <div style={{ paddingTop: 8 }}>
                  {pastGroups.map((g, gi) => (
                    <div key={g.date} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: C.n[400], letterSpacing: "0.03em", textTransform: "uppercase", paddingBottom: 4, borderBottom: `0.5px solid ${C.n[100]}` }}>
                        {g.date === PAST_MARKER ? "Earlier (no date)" : g.date}
                      </div>
                      {g.list.map((p, i) => {
                        const parts = cells(p.body);
                        const tick = canRx ? pastTicks[gi]?.get(i) : undefined;
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < g.list.length - 1 ? `0.5px solid ${C.n[100]}` : "none" }}>
                            {canRx && (
                              <span style={{ width: 13, flexShrink: 0, display: "flex", alignItems: "center" }}>
                                {tick ? (
                                  <Tick checked={sel.has(tick.key)} dim={!tick.head}
                                    label={tick.head ? `Select ${parts[0]}` : "Part of the medicine above"}
                                    onToggle={tick.head ? () => toggle(tick.key) : undefined} />
                                ) : null}
                              </span>
                            )}
                            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.n[800] }}>
                              {p.kind === "cont" ? <span style={{ color: C.n[400] }}>↳ </span> : null}
                              {p.kind === "note" ? <i style={{ color: C.n[600] }}>{p.body}</i> : (
                                <><b style={{ fontWeight: 600 }}>{parts[0]}</b>{parts.slice(1).filter(Boolean).length ? <span style={{ color: C.n[500] }}> · {parts.slice(1).filter(Boolean).join(" · ")}</span> : null}</>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer — nothing to save here. The ℞ pad owns Current medications
                and Distant past is a record; the only action is moving the
                ticked medicines onto today's prescription. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 20px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50], flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {canRx && blocks.length > 0 && (
                  <>
                    <button onClick={toggleAll}
                      style={{ padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${C.n[300]}`, background: C.n[0], color: C.n[700], fontSize: 11.5, cursor: "pointer", fontFamily: font }}>
                      {allPicked ? "Clear" : "Select all"}
                    </button>
                    <button onClick={moveToRx} disabled={pickedCount === 0}
                      title={pickedCount === 0 ? "Tick a medicine first" : "Add the ticked medicines to today's prescription"}
                      style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: pickedCount ? C.pri[400] : C.n[200], color: pickedCount ? "#fff" : C.n[500], fontSize: 11.5, fontWeight: 600, cursor: pickedCount ? "pointer" : "default", fontFamily: font }}>
                      Move to Rx{pickedCount ? ` (${pickedCount})` : ""}
                    </button>
                  </>
                )}
                <span style={{ fontSize: 11, color: C.pri[600] }}>{rxMsg}</span>
              </div>
              <button onClick={close} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
