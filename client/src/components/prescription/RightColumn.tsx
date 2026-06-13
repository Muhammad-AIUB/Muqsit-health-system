"use client";

import { useState, type CSSProperties } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { templateRx, DOSE_OPTIONS, DURATION_OPTIONS, INSTRUCTION_OPTIONS } from "@/data/drugs";
import { adviceSuggestions, advisedTestSuggestions } from "@/data/suggestions";
import ExpandableField from "@/components/common/ExpandableField";
import type { RxItem } from "@/types";

// Prescription table columns. Each cell is a free-text input backed by a
// <datalist> of common values, so the user can either type or pick.
const RX_COLS: { f: keyof RxItem; label: string; opts: string[]; list: string }[] = [
  { f: "dose", label: "Dose", opts: DOSE_OPTIONS, list: "rx-dose" },
  { f: "duration", label: "Duration", opts: DURATION_OPTIONS, list: "rx-duration" },
  { f: "instruction", label: "Instruction", opts: INSTRUCTION_OPTIONS, list: "rx-instruction" },
];

const BLANK_RX: RxItem = { drug: "", dose: "", duration: "", instruction: "" };

const rxTh: CSSProperties = { padding: "6px 8px", fontSize: 10, fontWeight: 600, color: C.n[600], whiteSpace: "nowrap", position: "sticky", top: 0, background: C.n[50], textAlign: "left", borderBottom: `0.5px solid ${C.n[200]}` };
const rxTd: CSSProperties = { padding: "1px 3px", verticalAlign: "middle" };
const rxCell: CSSProperties = { width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 11, color: C.n[900], fontFamily: font, padding: "5px 4px", boxSizing: "border-box" };

export default function RightColumn({ mobile }: { mobile?: boolean }) {
  const {
    activeTemplate, loadTemplate, rxItems, setRxItems, addDrug, removeDrug, updateRx,
    advice, setAdvice, adviceTest, setAdviceTest, allFieldValues,
    followUpNum, setFollowUpNum, followUpUnit, setFollowUpUnit, followUpMandatory, setFollowUpMandatory,
  } = useMuqsit();

  // Free-text drug entry inside the ℞ box.
  const [drugInput, setDrugInput] = useState("");
  const submitDrug = () => {
    const v = drugInput.trim();
    if (!v) return;
    addDrug(v);
    setDrugInput("");
  };
  const addRow = () => setRxItems([...rxItems, { ...BLANK_RX }]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 8 : 10 }}>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {Object.keys(templateRx).map((t) => (<button key={t} onClick={() => loadTemplate(t)} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 10, cursor: "pointer", border: `0.5px solid ${activeTemplate === t ? C.pri[400] : C.n[200]}`, background: activeTemplate === t ? C.pri[50] : C.n[0], color: activeTemplate === t ? C.pri[600] : C.n[600], fontFamily: font }}>{t}</button>))}
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, color: C.pri[400], fontStyle: "italic" }}>℞</div>
      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Write a drug directly — adds a row to the table */}
        <div style={{ display: "flex", gap: 8, padding: mobile ? "8px 10px" : "10px 14px", borderBottom: `0.5px solid ${C.n[200]}` }}>
          <input
            value={drugInput}
            onChange={(e) => setDrugInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitDrug(); }}
            placeholder="Write drug name and press Enter…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: C.n[900], fontFamily: font }}
          />
          {drugInput.trim() && (
            <button onClick={submitDrug} style={{ padding: "4px 14px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: font }}>
              Add
            </button>
          )}
        </div>

        {rxItems.length === 0 ? (
          <div style={{ minHeight: mobile ? 160 : 240, display: "flex", alignItems: "center", justifyContent: "center", color: C.n[500], fontSize: 12 }}>No drugs added yet</div>
        ) : (
          <div style={{ maxHeight: mobile ? 220 : 300, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: font }}>
              <thead>
                <tr>
                  <th style={{ ...rxTh, width: 28, textAlign: "center" }}>#</th>
                  <th style={{ ...rxTh, minWidth: 120 }}>Drug</th>
                  {RX_COLS.map((c) => <th key={c.f} style={{ ...rxTh, minWidth: 80 }}>{c.label}</th>)}
                  <th style={{ ...rxTh, width: 26 }} />
                </tr>
              </thead>
              <tbody>
                {rxItems.map((item, idx) => (
                  <tr key={idx} style={{ borderTop: `0.5px solid ${C.n[200]}` }}>
                    <td style={{ ...rxTd, textAlign: "center", fontSize: 11, color: C.n[500] }}>{idx + 1}</td>
                    <td style={rxTd}>
                      <input value={item.drug} onChange={(e) => updateRx(idx, "drug", e.target.value)} placeholder="Drug name" style={{ ...rxCell, fontWeight: 500 }} />
                    </td>
                    {RX_COLS.map((c) => (
                      <td key={c.f} style={rxTd}>
                        <input list={c.list} value={item[c.f]} onChange={(e) => updateRx(idx, c.f, e.target.value)} placeholder={c.label} style={rxCell} />
                      </td>
                    ))}
                    <td style={{ ...rxTd, textAlign: "center" }}>
                      <button onClick={() => removeDrug(idx)} title="Remove row" style={{ background: "none", border: "none", color: C.danger[400], cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add an empty row (type directly into the cells) */}
        <button onClick={addRow} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", border: "none", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50], color: C.pri[600], fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: font }}>
          + Add row
        </button>

        <datalist id="rx-dose">{DOSE_OPTIONS.map((o) => <option key={o} value={o} />)}</datalist>
        <datalist id="rx-duration">{DURATION_OPTIONS.map((o) => <option key={o} value={o} />)}</datalist>
        <datalist id="rx-instruction">{INSTRUCTION_OPTIONS.map((o) => <option key={o} value={o} />)}</datalist>
      </div>
      <ExpandableField label="Advice" items={advice} setItems={setAdvice} suggestions={adviceSuggestions} allFields={allFieldValues} />
      <ExpandableField label="Advised tests / investigation" items={adviceTest} setItems={setAdviceTest} suggestions={advisedTestSuggestions} allFields={allFieldValues} />
      <div>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.n[800] }}>Follow-up</span>
        <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input type="number" min="1" value={followUpNum} onChange={(e) => setFollowUpNum(e.target.value)}
            placeholder="No." style={{ width: 60, padding: "6px 8px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", background: C.n[0], color: C.n[900], fontFamily: "inherit", textAlign: "center" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: followUpUnit === "day" ? C.pri[600] : C.n[600], cursor: "pointer" }}>
            <input type="radio" name="fuUnit" checked={followUpUnit === "day"} onChange={() => setFollowUpUnit("day")} style={{ accentColor: C.pri[400] }} />
            Day
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: followUpUnit === "month" ? C.pri[600] : C.n[600], cursor: "pointer" }}>
            <input type="radio" name="fuUnit" checked={followUpUnit === "month"} onChange={() => setFollowUpUnit("month")} style={{ accentColor: C.pri[400] }} />
            Month
          </label>
          <div style={{ width: 1, height: 20, background: C.n[200], margin: "0 2px" }}></div>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: followUpMandatory ? C.danger[800] : C.n[600], cursor: "pointer", fontWeight: followUpMandatory ? 500 : 400 }}>
            <input type="checkbox" checked={followUpMandatory} onChange={() => setFollowUpMandatory(!followUpMandatory)} style={{ accentColor: C.danger[400] }} />
            Mandatory
          </label>
        </div>
        {followUpMandatory && followUpNum && (
          <div style={{ marginTop: 5, fontSize: 9, color: C.warn[800], background: C.warn[50], padding: "4px 10px", borderRadius: 4, display: "inline-block" }}>
            Reminder will be sent 2 days before follow-up date
          </div>
        )}
      </div>
    </div>
  );
}
