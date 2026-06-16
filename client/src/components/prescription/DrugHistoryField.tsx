"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import MedicinePad, { emptyRow, type Row } from "@/components/prescription/MedicinePad";

// ── Categories (stored in one drugHistory[] with a prefix) ───
const CATS = [
  { key: "Current", label: "Current medications" },
  { key: "Past", label: "Distant past medication" },
] as const;
type CatKey = (typeof CATS)[number]["key"];

const prefixOf = (s: string): CatKey => (s.startsWith("Past") ? "Past" : "Current");
const isNoteStored = (s: string) => /^(Current|Past)\(note\):/.test(s);
const isContStored = (s: string) => /^(Current|Past)\(cont\):/.test(s);
const stripPrefix = (s: string) => s.replace(/^(Current|Past)(\(note\)|\(cont\))?:\s*/, "");

// Stored, position-based (food slot). Older 3-part data still parses.
function toRow(stored: string): Row {
  const body = stripPrefix(stored);
  if (isNoteStored(stored)) {
    return { drug: body, dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false };
  }
  const p = body.split(" — ").map((x) => x.trim());
  if (isContStored(stored)) {
    const [dose = "", food = "", duration = ""] = p.length >= 3 ? p : [p[0] ?? "", "", p[1] ?? ""];
    return { drug: "", dose, food, duration, checked: true, isMedicine: true, continuation: true };
  }
  const [drug = "", dose = "", food = "", duration = ""] = p.length >= 4 ? p : [p[0] ?? "", p[1] ?? "", "", p[2] ?? ""];
  return { drug, dose, food, duration, checked: true, isMedicine: true, continuation: false };
}
function serialize(cat: CatKey, r: Row): string {
  if (!r.isMedicine) return `${cat}(note): ${r.drug.trim()}`;
  if (r.continuation) return `${cat}(cont): ${r.dose.trim()} — ${r.food.trim()} — ${r.duration.trim()}`;
  return `${cat}: ${r.drug.trim()} — ${r.dose.trim()} — ${r.food.trim()} — ${r.duration.trim()}`;
}

interface Props {
  items: string[];
  setItems: Dispatch<SetStateAction<string[]>>;
  // Logs a newly added drug (name only) to the activity feed.
  onAdd?: (drug: string) => void;
}

export default function DrugHistoryField({ items, setItems, onAdd }: Props) {
  const { setRxItems } = useMuqsit();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<CatKey>("Current");
  const [current, setCurrent] = useState<Row[]>([emptyRow()]);
  const [past, setPast] = useState<Row[]>([emptyRow()]);
  const [rxMsg, setRxMsg] = useState("");

  const rows = tab === "Current" ? current : past;
  const setRows = tab === "Current" ? setCurrent : setPast;

  const handleOpen = () => {
    setCurrent([...items.filter((i) => prefixOf(i) === "Current").map(toRow), emptyRow()]);
    setPast([...items.filter((i) => prefixOf(i) === "Past").map(toRow), emptyRow()]);
    setTab("Current");
    setOpen(true);
  };

  const cancel = () => setOpen(false);
  const done = () => {
    const ser = (cat: CatKey, list: Row[]) =>
      list.filter((r) => r.drug.trim() || r.dose.trim() || r.food.trim() || r.duration.trim()).map((r) => serialize(cat, r));
    const next = [...ser("Current", current), ...ser("Past", past)];
    // Log newly added drugs — drug name only, no dose/food/duration.
    const prevSet = new Set(items);
    next.forEach((entry) => {
      if (prevSet.has(entry) || isNoteStored(entry) || isContStored(entry)) return;
      const drug = stripPrefix(entry).split(" — ")[0].trim();
      if (drug) onAdd?.(drug);
    });
    setItems(next);
    setOpen(false);
  };

  // Push the ticked medicines (+ their tapering lines) into the main ℞.
  const addToRx = () => {
    const collect = (list: Row[]) => {
      const out: { drug: string; dose: string; duration: string; instruction: string }[] = [];
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        if (r.isMedicine && !r.continuation && r.checked && r.drug.trim()) {
          out.push({ drug: r.drug.trim(), dose: r.dose.trim() || "1+0+1", duration: r.duration.trim() || "Continue", instruction: r.food.trim() || "After meal" });
          for (let j = i + 1; j < list.length && list[j].continuation; j++) {
            const c = list[j];
            if (c.dose.trim() || c.duration.trim()) {
              // Empty drug = tapering line belonging to the medicine above.
              out.push({ drug: "", dose: c.dose.trim() || "", duration: c.duration.trim() || "Continue", instruction: c.food.trim() || "After meal" });
            }
          }
        }
      }
      return out;
    };
    const picked = [...collect(current), ...collect(past)];
    if (picked.length === 0) { setRxMsg("Tick the medicines you want to add"); setTimeout(() => setRxMsg(""), 2500); return; }
    let added = 0;
    setRxItems((prev) => {
      const key = (x: { drug: string; dose: string; duration: string }) => `${x.drug}|${x.dose}|${x.duration}`;
      const seen = new Set(prev.map(key));
      // Continuations (empty drug) always tag along; named drugs dedupe.
      const additions = picked.filter((x) => x.drug === "" || !seen.has(key(x)));
      added = additions.length;
      return [...prev, ...additions];
    });
    setRxMsg(added > 0 ? `Added ${added} to prescription ✓` : "Already in prescription");
    setTimeout(() => setRxMsg(""), 2500);
  };

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
          <div onClick={(e) => e.stopPropagation()} style={{ width: 680, maxWidth: "95vw", height: "82vh", maxHeight: "82vh", background: C.n[0], borderRadius: 14, border: `0.5px solid ${C.n[200]}`, boxShadow: "0 12px 40px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
                const count = (c.key === "Current" ? current : past).filter((r) => r.isMedicine && !r.continuation && r.drug.trim()).length;
                return (
                  <button key={c.key} onClick={() => setTab(c.key)}
                    style={{ padding: "8px 16px", borderRadius: 999, border: `1px solid ${active ? C.pri[400] : C.n[200]}`, background: active ? C.pri[50] : C.n[0], color: active ? C.pri[600] : C.n[600], fontSize: 12.5, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: font }}>
                    {c.label}{count > 0 ? ` (${count})` : ""}
                  </button>
                );
              })}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 20px" }}>
              <MedicinePad rows={rows} setRows={setRows} />
            </div>

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 20px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50] }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={addToRx} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.pri[400]}`, background: C.pri[50], color: C.pri[600], fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font, whiteSpace: "nowrap" }}>
                  ℞ Add to main Rx
                </button>
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
