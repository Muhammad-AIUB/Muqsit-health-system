"use client";

import { useState } from "react";
import { C, font } from "@/theme";
import { inputSm, btnPrimary, btnDisabled, btnClose, shadowMenu } from "@/theme/styles";
import { useMedicineSearch } from "@/hooks/useMedicineSearch";
import { fmtMedicine } from "@/lib/rxShorthand";
import { isDuplicateDrugHistoryEntry, type DrugHistoryAddInput } from "@/lib/drugHistoryAdd";

// ⚕️ The "+ Add medicine" row on one Drug-history tab (physician's decision,
// 2026-10-14). Collapsed by default — nothing here is typeable until the
// doctor presses it, so the standing "offers nothing to type into" rule for
// an EXISTING stored row still holds: this row never reads or edits one, it
// only ever produces a brand-new line (client/CLAUDE.md, Drug history). Two
// instances render, one per tab (DrugHistoryField.tsx), each owning its own
// state; switching tabs drops whatever was mid-type here, same as any other
// draft in a popup that was closed rather than confirmed.

interface Props {
  /** Medicine-kind entries already in THIS tab, for the duplicate check. */
  existing: DrugHistoryAddInput[];
  /** The tab's own visible name, used only in the duplicate message. */
  tabLabel: string;
  onAdd: (entry: DrugHistoryAddInput) => void;
}

export default function AddMedicineRow({ existing, tabLabel, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [drug, setDrug] = useState("");
  const [dose, setDose] = useState("");
  const [food, setFood] = useState("");
  const [duration, setDuration] = useState("");
  const [dupMsg, setDupMsg] = useState("");
  const { results } = useMedicineSearch(drug);
  const showDropdown = results.length > 0 && drug.trim().length >= 2;

  const close = () => {
    setOpen(false);
    setDrug(""); setDose(""); setFood(""); setDuration(""); setDupMsg("");
  };

  const add = () => {
    const input: DrugHistoryAddInput = { drug, dose, food, duration };
    if (isDuplicateDrugHistoryEntry(input, existing)) {
      setDupMsg(`Already in ${tabLabel}`);
      return;
    }
    onAdd(input);
    setDrug(""); setDose(""); setFood(""); setDuration(""); setDupMsg("");
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ position: "relative", flex: "1 1 180px" }}>
          <input aria-label="Medicine name" value={drug}
            onChange={(e) => { setDrug(e.target.value); setDupMsg(""); }}
            placeholder="Medicine name" style={inputSm} />
          {showDropdown && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 6, marginTop: 2, maxHeight: 160, overflowY: "auto", boxShadow: shadowMenu }}>
              {results.map((m) => (
                <button key={m.id} type="button" onClick={() => { setDrug(fmtMedicine(m)); setDupMsg(""); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12.5, color: C.n[900], fontFamily: font }}>
                  {fmtMedicine(m)}
                </button>
              ))}
            </div>
          )}
        </div>
        <input aria-label="Dose" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="dose" style={{ ...inputSm, flex: "1 1 90px" }} />
        <input aria-label="Food" value={food} onChange={(e) => setFood(e.target.value)} placeholder="food" style={{ ...inputSm, flex: "1 1 90px" }} />
        <input aria-label="Duration" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="duration" style={{ ...inputSm, flex: "1 1 90px" }} />
        <button aria-label="Cancel adding a medicine" onClick={close} style={btnClose}>×</button>
      </div>
      {dupMsg && <div style={{ fontSize: 11, color: C.warn[600], marginTop: 6 }}>{dupMsg}</div>}
      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={add} disabled={!drug.trim()}
          style={{ ...btnPrimary("sm"), ...(drug.trim() ? null : { ...btnDisabled, cursor: "default" }) }}>
          Add
        </button>
      </div>
    </div>
  );
}
