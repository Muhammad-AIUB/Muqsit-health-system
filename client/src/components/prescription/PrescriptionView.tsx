"use client";

import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import LeftColumn from "./LeftColumn";
import RightColumn from "./RightColumn";

export default function PrescriptionView({ mobile }: { mobile?: boolean }) {
  const { savePrescription, savedMsg } = useMuqsit();

  if (mobile) {
    return (
      <>
        <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.n[200]}`, color: C.n[800] }}>Clinical assessment</div><LeftColumn /></div>
        <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.pri[400]}`, color: C.pri[600] }}>Prescription</div><RightColumn mobile /></div>
        <button onClick={savePrescription} style={{ width: "100%", padding: "11px 20px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: font }}>Save & print</button>
        {savedMsg && <div style={{ textAlign: "center", fontSize: 12, color: C.pri[400], fontWeight: 500, marginTop: 6 }}>{savedMsg}</div>}
      </>
    );
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "0.6fr 0.5px 1.4fr", gap: 0 }}>
        <div style={{ paddingRight: 12 }}><div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.n[200]}`, color: C.n[800] }}>Clinical assessment</div><LeftColumn /></div>
        <div style={{ background: C.n[200] }} />
        <div style={{ paddingLeft: 16 }}><div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.pri[400]}`, color: C.pri[600] }}>Prescription</div><RightColumn /></div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, paddingTop: 14, borderTop: `0.5px solid ${C.n[200]}` }}>
        <button onClick={savePrescription} style={{ flex: 1, padding: "11px 20px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: font }}>Save & print prescription</button>
        <button style={{ padding: "11px 20px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: font }}>Preview PDF</button>
      </div>
      {savedMsg && <div style={{ textAlign: "center", fontSize: 12, color: C.pri[400], fontWeight: 500, marginTop: 8 }}>{savedMsg}</div>}
    </>
  );
}
