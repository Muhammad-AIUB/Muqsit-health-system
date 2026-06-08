"use client";

import { C, font } from "@/theme";
import { inputSm } from "@/theme/styles";
import { useMedCare } from "@/context/MedCareContext";
import { templateRx, DOSE_OPTIONS, DURATION_OPTIONS, INSTRUCTION_OPTIONS } from "@/data/drugs";
import { adviceSuggestions, advisedTestSuggestions } from "@/data/suggestions";
import ExpandableField from "@/components/common/ExpandableField";
import type { RxItem } from "@/types";

const RX_SELECTS: { f: keyof RxItem; opts: string[] }[] = [
  { f: "dose", opts: DOSE_OPTIONS },
  { f: "duration", opts: DURATION_OPTIONS },
  { f: "instruction", opts: INSTRUCTION_OPTIONS },
];

export default function RightColumn({ mobile }: { mobile?: boolean }) {
  const {
    activeTemplate, loadTemplate, setShowDrugPicker, rxItems, removeDrug, updateRx,
    advice, setAdvice, adviceTest, setAdviceTest, allFieldValues,
    followUpNum, setFollowUpNum, followUpUnit, setFollowUpUnit, followUpMandatory, setFollowUpMandatory,
  } = useMedCare();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 8 : 10 }}>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {Object.keys(templateRx).map((t) => (<button key={t} onClick={() => loadTemplate(t)} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 10, cursor: "pointer", border: `0.5px solid ${activeTemplate === t ? C.pri[400] : C.n[200]}`, background: activeTemplate === t ? C.pri[50] : C.n[0], color: activeTemplate === t ? C.pri[600] : C.n[600], fontFamily: font }}>{t}</button>))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 22, fontWeight: 500, color: C.pri[400], fontStyle: "italic" }}>℞</div>
        <button onClick={() => setShowDrugPicker(true)} style={{ padding: "4px 12px", borderRadius: 6, border: `1px dashed ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: font }}>+ Add drug</button>
      </div>
      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 8 }}>
        {rxItems.length === 0 && <div style={{ textAlign: "center", padding: "24px 16px", color: C.n[500], fontSize: 11 }}>No drugs added yet</div>}
        {rxItems.map((item, idx) => (
          <div key={idx} style={{ padding: mobile ? "8px 10px" : "10px 14px", borderBottom: idx < rxItems.length - 1 ? `0.5px solid ${C.n[200]}` : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{idx + 1}. {item.drug}</span>
              <button onClick={() => removeDrug(idx)} style={{ background: "none", border: "none", color: C.danger[400], cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: "flex", gap: mobile ? 4 : 8, flexWrap: "wrap" }}>
              {RX_SELECTS.map(({ f, opts }) => (<select key={f} value={item[f]} onChange={(e) => updateRx(idx, f, e.target.value)} style={{ ...inputSm, fontSize: 10, padding: "3px 4px", flex: "1 1 70px", minWidth: 0 }}>{opts.map((o) => <option key={o}>{o}</option>)}</select>))}
            </div>
          </div>
        ))}
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
