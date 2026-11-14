"use client";

import { useState } from "react";
import { C, font } from "@/theme";
import { btnSecondary } from "@/theme/styles";
import Icon from "@/components/common/Icon";
import PatientStatistics from "@/components/statistics/PatientStatistics";
import DiseaseStatistics from "@/components/statistics/DiseaseStatistics";

type Tab = "patients" | "diseases";

const TABS: { id: Tab; name: string }[] = [
  { id: "patients", name: "Patient statistics" },
  { id: "diseases", name: "Disease statistics" },
];

// Settings → Statistics (physician's sheet, 11/11/2026): "Payment er nicha
// 'statistics' akta menu … oitai dhukle horizontal menu thakbe: Patient
// statistics, Disease statistics". Read only; the practice's assistants may open
// it too (physician's decision), and see the practice's numbers.
export default function StatisticsView({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("patients");

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button type="button" onClick={onBack} style={btnSecondary("sm")}><Icon name="arrowLeft" size={14} /> Back</button>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Statistics</div>
      </div>

      {/* the horizontal menu */}
      <div role="tablist" aria-label="Statistics" style={{ display: "flex", gap: 4, borderBottom: `0.5px solid ${C.n[200]}`, marginBottom: 16, overflowX: "auto" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`stats-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="stats-panel"
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 14px", border: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              background: "transparent", color: tab === t.id ? C.pri[600] : C.n[700],
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              borderBottom: `2px solid ${tab === t.id ? C.pri[400] : "transparent"}`, marginBottom: -0.5,
            }}
          >{t.name}</button>
        ))}
      </div>

      <div role="tabpanel" id="stats-panel" aria-labelledby={`stats-tab-${tab}`}>
        {tab === "patients" ? <PatientStatistics /> : <DiseaseStatistics />}
      </div>
    </div>
  );
}
