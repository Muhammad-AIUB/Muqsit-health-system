"use client";

import { useState } from "react";
import { C, font } from "@/theme";
import { btnPrimary, btnSecondary, btnDisabled } from "@/theme/styles";
import MedicinePad, { emptyRow, type Row } from "@/components/prescription/MedicinePad";
import { drugHistoryEntriesFromPad, unwritableLines, type DrugHistoryAddInput } from "@/lib/drugHistoryAdd";

// ⚕️ The "+ Add medicine" row on one Drug-history tab (physician's decision,
// 2026-10-14). Collapsed by default — nothing here is typeable until the
// doctor presses it, so the standing "offers nothing to type into" rule for
// an EXISTING stored row still holds: this row never reads or edits one, it
// only ever produces brand-new lines (client/CLAUDE.md, Drug history). Two
// instances render, one per tab (DrugHistoryField.tsx), each owning its own
// state; switching tabs drops whatever was mid-type here, same as any other
// draft in a popup that was closed rather than confirmed.
//
// Since the physician's sheet of 15/10/2026 (item 1: "2 jaigai e add medicine
// er philosophy prescription er idea follow korbe") it is the ℞ pad itself —
// the same typing line, medicine list, shorthand and Enter-to-the-next-box —
// on rows of its own. "Your usual" stays off (`showHabits` defaults to false):
// a patient's medication is not the doctor's prescribing habit. Add writes the
// typed lines to the history and empties the pad.

interface Props {
  /** Medicine-kind entries already in THIS tab, for the duplicate check. */
  existing: DrugHistoryAddInput[];
  /** The tab's own visible name, used only in the duplicate message. */
  tabLabel: string;
  /** The date this tab stamps: the visit's, or the no-date marker. */
  date: string;
  /** Called once per press with every new entry, in pad order. False: they
   *  were not taken (the caller has said why), and the pad keeps them. */
  onAdd: (entries: string[]) => boolean;
}

const fresh = (): Row[] => [emptyRow()];

export default function AddMedicineRow({ existing, tabLabel, date, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(fresh);
  const [msg, setMsg] = useState("");
  // Anything typed at all, so that Add can be pressed and say what is wrong
  // with a line it cannot write rather than sit greyed out with no reason.
  const typed = rows.some((r) => r.drug.trim() || r.dose.trim() || r.food.trim() || r.duration.trim());

  const close = () => {
    setOpen(false);
    setRows(fresh());
    setMsg("");
  };

  const add = () => {
    // ⚕️ A line the history cannot write is never dropped in silence: nothing
    // is added and nothing is cleared until it is fixed.
    const lost = unwritableLines(rows);
    if (lost) {
      setMsg(`Nothing added: ${lost === 1 ? "a line has" : `${lost} lines have`} a dose, food or duration but no medicine. Write the medicine's name, or clear ${lost === 1 ? "that line" : "those lines"}.`);
      return;
    }
    const { entries, skipped } = drugHistoryEntriesFromPad(rows, date, existing);
    if (entries.length && !onAdd(entries)) return;
    if (entries.length) setRows(fresh());
    setMsg(skipped.length ? `Already in ${tabLabel}: ${skipped.join(", ")}` : "");
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ height: 22, borderRadius: 999, border: `1px solid ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 11, padding: "0 10px", cursor: "pointer", fontFamily: font, marginBottom: 8 }}>
        + Add medicine
      </button>
    );
  }

  return (
    <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 8, padding: 10, marginBottom: 10, background: C.n[50] }}>
      <MedicinePad
        rows={rows}
        setRows={(next) => { setRows(next); setMsg(""); }}
        showCheck={false}
        bangla
        minHeight={96}
      />
      {msg && <div role="status" style={{ fontSize: 11.5, color: C.warn[800], marginTop: 6 }}>{msg}</div>}
      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={close} style={btnSecondary("sm")}>Cancel</button>
        <button onClick={add} disabled={!typed} aria-label="Add to Drug history"
          style={{ ...btnPrimary("sm"), ...(typed ? null : { ...btnDisabled, cursor: "default" }) }}>
          Add
        </button>
      </div>
    </div>
  );
}
