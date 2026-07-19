"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { isoToDdmmyyyy } from "@/lib/dateInput";
import MedicinePad, { emptyRow, type Row } from "@/components/prescription/MedicinePad";

// ── Date-stamped drug history ───────────────────────────────
// One list, each entry stamped with the visit date it was added on:
//   "dd/mm/yyyy: Drug — dose — food — duration"   (medicine)
//   "dd/mm/yyyy(note): free text"                 (note line)
//   "dd/mm/yyyy(cont): dose — food — duration"    (tapering line)
// The Current vs Distant-past split is DERIVED, not stored: entries dated on the
// current visit are "Current medications"; everything older auto-moves to
// "Distant past medication" once the visit date advances.
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

function toRow(p: Parsed): Row {
  if (p.kind === "note") return { drug: p.body, dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false };
  const parts = p.body.split(" — ").map((x) => x.trim());
  if (p.kind === "cont") {
    const [dose = "", food = "", duration = ""] = parts.length >= 3 ? parts : [parts[0] ?? "", "", parts[1] ?? ""];
    return { drug: "", dose, food, duration, checked: true, isMedicine: true, continuation: true };
  }
  const [drug = "", dose = "", food = "", duration = ""] = parts.length >= 4 ? parts : [parts[0] ?? "", parts[1] ?? "", "", parts[2] ?? ""];
  return { drug, dose, food, duration, checked: true, isMedicine: true, continuation: false };
}

function serialize(date: string, r: Row): string {
  if (!r.isMedicine) return `${date}(note): ${r.drug.trim()}`;
  if (r.continuation) return `${date}(cont): ${r.dose.trim()} — ${r.food.trim()} — ${r.duration.trim()}`;
  return `${date}: ${r.drug.trim()} — ${r.dose.trim()} — ${r.food.trim()} — ${r.duration.trim()}`;
}

const ts = (d: string): number => { const [dd, mm, yy] = d.split("/").map(Number); return new Date(yy || 0, (mm || 1) - 1, dd || 1).getTime() || 0; };
const filledRow = (r: Row) => r.drug.trim() || r.dose.trim() || r.food.trim() || r.duration.trim();

interface Props {
  items: string[];
  setItems: Dispatch<SetStateAction<string[]>>; // unused — persisted via saveDrugHistory
  onAdd?: (drug: string) => void;
}

export default function DrugHistoryField({ items, onAdd }: Props) {
  const { setRxItems, ptDate, saveDrugHistory } = useMuqsit();
  const cd = isoToDdmmyyyy(ptDate); // current visit date, dd/mm/yyyy
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"current" | "past">("current");
  const [current, setCurrent] = useState<Row[]>([emptyRow()]);
  const [rxMsg, setRxMsg] = useState("");

  const parsed = items.map((raw) => ({ raw, ...parseEntry(raw, cd) }));
  const currentMeds = parsed.filter((p) => p.date === cd && p.kind === "med" && p.body.trim());
  const pastParsed = parsed.filter((p) => p.date !== cd);
  const pastGroups = (() => {
    const map = new Map<string, Parsed[]>();
    for (const p of pastParsed) { const a = map.get(p.date); if (a) a.push(p); else map.set(p.date, [p]); }
    return Array.from(map.entries()).map(([date, list]) => ({ date, list })).sort((a, b) => ts(b.date) - ts(a.date));
  })();

  const handleOpen = () => {
    const rows = parsed.filter((p) => p.date === cd).map(toRow);
    setCurrent([...rows, emptyRow()]);
    setTab("current");
    setOpen(true);
  };

  const cancel = () => setOpen(false);
  const done = () => {
    const newCurrent = current.filter(filledRow).map((r) => serialize(cd, r));
    // Keep every entry not on the current visit date untouched — that preserves
    // each older visit's date so they stay in "Distant past".
    const keep = items.filter((i) => parseEntry(i, cd).date !== cd);
    const next = [...keep, ...newCurrent];
    const prevSet = new Set(items);
    newCurrent.forEach((entry) => {
      if (prevSet.has(entry) || /\(note\)|\(cont\)/.test(entry)) return;
      const drug = (entry.match(DATE_RE)?.[3] ?? "").split(" — ")[0].trim();
      if (drug) onAdd?.(drug);
    });
    saveDrugHistory(next);
    setOpen(false);
  };

  // Collect ticked medicines (+ their tapering lines) from a row list for the Rx.
  const collect = (list: Row[]) => {
    const out: { drug: string; dose: string; duration: string; instruction: string }[] = [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.isMedicine && !r.continuation && r.checked && r.drug.trim()) {
        out.push({ drug: r.drug.trim(), dose: r.dose.trim() || "1+0+1", duration: r.duration.trim() || "Continue", instruction: r.food.trim() || "After meal" });
        for (let j = i + 1; j < list.length && list[j].continuation; j++) {
          const c = list[j];
          if (c.dose.trim() || c.duration.trim()) out.push({ drug: "", dose: c.dose.trim() || "", duration: c.duration.trim() || "Continue", instruction: c.food.trim() || "After meal" });
        }
      }
    }
    return out;
  };
  const pushToRx = (picked: { drug: string; dose: string; duration: string; instruction: string }[]) => {
    if (picked.length === 0) { setRxMsg("Tick the medicines you want to add"); setTimeout(() => setRxMsg(""), 2500); return; }
    let added = 0;
    setRxItems((prev) => {
      const key = (x: { drug: string; dose: string; duration: string }) => `${x.drug}|${x.dose}|${x.duration}`;
      const seen = new Set(prev.map(key));
      const additions = picked.filter((x) => x.drug === "" || !seen.has(key(x)));
      added = additions.length;
      return [...prev, ...additions];
    });
    setRxMsg(added > 0 ? `Added ${added} to prescription ✓` : "Already in prescription");
    setTimeout(() => setRxMsg(""), 2500);
  };
  const addToRx = () => pushToRx(collect(current));

  // Re-prescribe a single distant-past medicine into the main Rx.
  const rePrescribe = (p: Parsed) => {
    const parts = p.body.split(" — ").map((x) => x.trim());
    const drug = parts[0] || "";
    if (!drug) return;
    pushToRx([{ drug, dose: parts[1] || "1+0+1", instruction: parts[2] || "After meal", duration: parts[3] || "Continue" }]);
  };

  const pastCount = pastParsed.filter((p) => p.kind === "med").length;

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
          <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 2, flexWrap: "wrap" }}>
            <button onClick={handleOpen} title="View / edit drug history"
              style={{ fontSize: 11, color: C.pri[600], background: C.pri[50], border: `0.5px solid ${C.pri[400]}`, padding: "2px 10px", borderRadius: 999, cursor: "pointer", fontFamily: font, display: "inline-flex", alignItems: "center", gap: 5 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.pri[100] ?? C.pri[50])}
              onMouseLeave={(e) => (e.currentTarget.style.background = C.pri[50])}>
              💊 {currentMeds.length} current{pastCount ? ` · ${pastCount} past` : ""} · view
            </button>
            <button onClick={handleOpen} style={{ width: 18, height: 18, borderRadius: "50%", border: `1px solid ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>+</button>
          </div>
        )}
      </div>

      {/* Modal */}
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={cancel}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 680, maxWidth: "95vw", height: "82vh", maxHeight: "82vh", background: C.n[0], borderRadius: 14, border: `0.5px solid ${C.n[200]}`, boxShadow: "0 12px 40px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `0.5px solid ${C.n[200]}` }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, color: C.n[900] }}>Drug history</div>
                <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Today&apos;s meds go to <b>Current</b> ({cd}); they move to <b>Distant past</b> automatically on the next visit.</div>
              </div>
              <button onClick={cancel} style={{ width: 28, height: 28, borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, rowGap: 8, padding: "12px 20px 4px" }}>
              <button onClick={() => setTab("current")}
                style={{ padding: "8px 16px", borderRadius: 999, border: `1px solid ${tab === "current" ? C.pri[400] : C.n[200]}`, background: tab === "current" ? C.pri[50] : C.n[0], color: tab === "current" ? C.pri[600] : C.n[600], fontSize: 12.5, fontWeight: tab === "current" ? 600 : 400, cursor: "pointer", fontFamily: font }}>
                Current medications{current.filter((r) => r.isMedicine && !r.continuation && r.drug.trim()).length ? ` (${current.filter((r) => r.isMedicine && !r.continuation && r.drug.trim()).length})` : ""}
              </button>
              <button onClick={() => setTab("past")}
                style={{ padding: "8px 16px", borderRadius: 999, border: `1px solid ${tab === "past" ? C.pri[400] : C.n[200]}`, background: tab === "past" ? C.pri[50] : C.n[0], color: tab === "past" ? C.pri[600] : C.n[600], fontSize: 12.5, fontWeight: tab === "past" ? 600 : 400, cursor: "pointer", fontFamily: font }}>
                Distant past medication{pastCount ? ` (${pastCount})` : ""}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 20px" }}>
              {tab === "current" ? (
                <MedicinePad rows={current} setRows={setCurrent} />
              ) : pastGroups.length === 0 ? (
                <div style={{ fontSize: 12.5, color: C.n[500], padding: "14px 4px" }}>No earlier-visit medications yet. Whatever you record today moves here on the patient&apos;s next visit.</div>
              ) : (
                <div style={{ paddingTop: 8 }}>
                  {pastGroups.map((g) => (
                    <div key={g.date} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.pri[600], marginBottom: 6 }}>{g.date === PAST_MARKER ? "Earlier" : g.date}</div>
                      {g.list.map((p, i) => {
                        const parts = p.body.split(" — ").map((x) => x.trim());
                        const isMed = p.kind === "med";
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < g.list.length - 1 ? `0.5px solid ${C.n[100]}` : "none" }}>
                            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.n[800] }}>
                              {p.kind === "cont" ? <span style={{ color: C.n[400] }}>↳ </span> : null}
                              {p.kind === "note" ? <i style={{ color: C.n[600] }}>{p.body}</i> : (
                                <><b style={{ fontWeight: 600 }}>{parts[0]}</b>{parts.slice(1).filter(Boolean).length ? <span style={{ color: C.n[500] }}> · {parts.slice(1).filter(Boolean).join(" · ")}</span> : null}</>
                              )}
                            </div>
                            {isMed && parts[0] && (
                              <button onClick={() => rePrescribe(p)} title="Add to current prescription" style={{ flexShrink: 0, padding: "3px 9px", borderRadius: 6, border: `0.5px solid ${C.pri[400]}`, background: C.pri[50], color: C.pri[600], fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: font }}>↻ Rx</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 20px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50] }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {tab === "current" && (
                  <button onClick={addToRx} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.pri[400]}`, background: C.pri[50], color: C.pri[600], fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font, whiteSpace: "nowrap" }}>
                    ℞ Add to main Rx
                  </button>
                )}
                {rxMsg && <span style={{ fontSize: 11, color: C.pri[600] }}>{rxMsg}</span>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={cancel} style={{ padding: "8px 20px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: font }}>Cancel</button>
                <button onClick={done} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font }}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
