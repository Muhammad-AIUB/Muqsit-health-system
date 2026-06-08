"use client";

import { C } from "@/theme";
import { inputSm } from "@/theme/styles";
import { useMuqsit } from "@/context/MuqsitContext";
import Pill from "@/components/common/Pill";

export default function DrugPicker({ mobile }: { mobile?: boolean }) {
  const { showDrugPicker, setShowDrugPicker, drugSearch, setDrugSearch, filteredDrugs, rxItems, addDrug } = useMuqsit();

  if (!showDrugPicker) return null;

  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.2)", display: "flex", alignItems: mobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, borderRadius: 12 }} onClick={() => setShowDrugPicker(false)}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: mobile ? "100%" : 440, maxHeight: mobile ? "70%" : 440, background: C.n[0], borderRadius: mobile ? "16px 16px 0 0" : 12, border: `0.5px solid ${C.n[200]}`, padding: 16, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 14, fontWeight: 500 }}>Add drug</span><button onClick={() => setShowDrugPicker(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.n[600] }}>×</button></div>
        <input autoFocus value={drugSearch} onChange={(e) => setDrugSearch(e.target.value)} placeholder="Search drug name or category..." style={{ ...inputSm, marginBottom: 10 }} />
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredDrugs.map((d) => { const added = rxItems.find((r) => r.drug === d.name); return (
            <div key={d.name} onClick={() => !added && addDrug(d.name)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 6px", cursor: added ? "default" : "pointer", borderBottom: `0.5px solid ${C.n[100]}` }}>
              <div><div style={{ fontSize: 12, fontWeight: 500 }}>{d.name}</div><div style={{ fontSize: 10, color: C.n[600] }}>{d.cat} · ৳{d.price}/unit</div></div>
              {added ? <Pill bg={C.pri[50]} fg={C.pri[600]}>Added</Pill> : <span style={{ fontSize: 18, color: C.pri[400] }}>+</span>}
            </div>); })}
        </div>
      </div>
    </div>
  );
}
