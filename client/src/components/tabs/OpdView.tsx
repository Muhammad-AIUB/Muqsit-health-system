"use client";

import { C, colorOf, font } from "@/theme";
import { useMedCare } from "@/context/MedCareContext";
import { opdQueue } from "@/data/patients";
import Pill from "@/components/common/Pill";

export default function OpdView() {
  const { setPtName, setPtAge, setPtGender, setActiveTab, setRxItems, setActiveTemplate } = useMedCare();

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 14 }}>OPD queue management</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        <div style={{ background: C.n[100], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.n[600] }}>Total today</div><div style={{ fontSize: 22, fontWeight: 500 }}>24</div></div>
        <div style={{ background: C.pri[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.pri[600] }}>Completed</div><div style={{ fontSize: 22, fontWeight: 500, color: C.pri[600] }}>18</div></div>
        <div style={{ background: C.warn[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.warn[800] }}>Waiting</div><div style={{ fontSize: 22, fontWeight: 500, color: C.warn[800] }}>6</div></div>
      </div>
      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "4px 14px" }}>
        {opdQueue.map((p, i) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < opdQueue.length - 1 ? `0.5px solid ${C.n[200]}` : "none" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: colorOf(p.color).bg, color: colorOf(p.color).fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{p.init}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div><div style={{ fontSize: 11, color: C.n[600] }}>{p.phone} · {p.age}y/{p.gender}</div></div>
            <Pill bg={colorOf(p.color).bg} fg={colorOf(p.color).fg}>{p.type}</Pill>
            <Pill bg={C.n[100]} fg={C.n[800]}>{p.token}</Pill>
            <button onClick={() => { setPtName(p.name); setPtAge(String(p.age)); setPtGender(p.gender === "F" ? "Female" : "Male"); setActiveTab("prescription"); setRxItems([]); setActiveTemplate(null); }}
              style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 11, cursor: "pointer", fontFamily: font }}>Prescribe</button>
          </div>
        ))}
      </div>
    </div>
  );
}
