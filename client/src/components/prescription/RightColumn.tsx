"use client";

import { useEffect, useRef, useState } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { adviceSuggestions, advisedTestSuggestions } from "@/data/suggestions";
import ExpandableField from "@/components/common/ExpandableField";
import MedicinePad, { type Row } from "@/components/prescription/MedicinePad";
import { rowsFromRxItems as fromRxItems, rxItemsFromRows as toRxItems } from "@/lib/rxRows";
import { useTemplates } from "@/hooks/useTemplates";
import type { RxItem } from "@/types";

export default function RightColumn({ mobile }: { mobile?: boolean }) {
  const {
    rxItems, setRxItems,
    advice, setAdvice, adviceTest, setAdviceTest, allFieldValues,
    followUpNum, setFollowUpNum, followUpUnit, setFollowUpUnit, followUpMandatory, setFollowUpMandatory,
  } = useMuqsit();

  const [rows, setRows] = useState<Row[]>(() => fromRxItems(rxItems));
  const lastSync = useRef<string>(JSON.stringify(toRxItems(fromRxItems(rxItems))));

  // Quick templates: only the doctor's own saved OPD templates (from the server).
  const [tplSearch, setTplSearch] = useState("");
  const { data: allTemplates = [] } = useTemplates("opd");
  const shownTemplates = allTemplates.filter((t) => t.name.toLowerCase().includes(tplSearch.trim().toLowerCase()));

  // Clicking a template ADDS its medicines to the current prescription.
  const addTemplate = (items: RxItem[]) => {
    if (!items.length) return;
    setRxItems((prev) => [...prev, ...items.map((it) => ({ ...it }))]);
  };

  // Pad edits → prescription model.
  useEffect(() => {
    const items = toRxItems(rows);
    const sig = JSON.stringify(items);
    lastSync.current = sig;
    setRxItems((prev) => (JSON.stringify(prev) === sig ? prev : items));
  }, [rows, setRxItems]);

  // External changes (templates, prescribe-clear, "Add to main Rx") → pad.
  useEffect(() => {
    const sig = JSON.stringify(rxItems);
    if (sig !== lastSync.current) {
      lastSync.current = sig;
      setRows(fromRxItems(rxItems));
    }
  }, [rxItems]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 8 : 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, display: "flex", gap: 5, flexWrap: "wrap", minWidth: 0 }}>
          {shownTemplates.map((t, i) => (
            <button
              key={`${t.name}-${i}`}
              onClick={() => addTemplate(t.items)}
              title={`Add ${t.items.length} item(s) from “${t.name}” to this prescription`}
              style={{ padding: "4px 12px", borderRadius: 6, fontSize: 10, cursor: "pointer", border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontFamily: font }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.pri[400]; e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.color = C.pri[600]; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.n[200]; e.currentTarget.style.background = C.n[0]; e.currentTarget.style.color = C.n[600]; }}
            >
              {t.name}
            </button>
          ))}
          {shownTemplates.length === 0 && (
            <span style={{ fontSize: 10, color: C.n[500], padding: "4px 2px" }}>No matching template.</span>
          )}
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <input
            value={tplSearch}
            onChange={(e) => setTplSearch(e.target.value)}
            placeholder="Search templates…"
            style={{ width: 180, padding: "5px 28px 5px 10px", borderRadius: 7, border: `0.5px solid ${C.n[200]}`, fontSize: 11, fontFamily: font, color: C.n[900], background: C.n[0], outline: "none" }}
          />
          <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: C.n[500], fontSize: 12, pointerEvents: "none" }}>⌕</span>
        </div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, color: C.pri[400], fontStyle: "italic" }}>℞</div>

      {/* Notebook-style prescription pad (same editor as Drug history) */}
      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 8, padding: "8px 12px" }}>
        <MedicinePad rows={rows} setRows={setRows} minHeight={mobile ? 200 : 320} noteText="Start typing a medicine or note…" showCheck={false} />
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
