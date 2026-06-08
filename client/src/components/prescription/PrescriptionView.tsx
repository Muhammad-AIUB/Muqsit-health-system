"use client";

import { C, font } from "@/theme";
import { useMedCare } from "@/context/MedCareContext";
import LeftColumn from "./LeftColumn";
import RightColumn from "./RightColumn";

const NOTIFICATIONS = [
  { type: "alert", icon: "!", color: C.danger, text: "Nusrat Jahan (B-7) critical — vitals deteriorating, needs immediate review", time: "2 min ago" },
  { type: "update", icon: "i", color: C.info, text: "Lab results ready for Fatima Khatun — CBC, CRP reports available", time: "15 min ago" },
  { type: "suggestion", icon: "S", color: C.pri, text: "Consider checking HbA1c for Akhtar Rahman — diabetic, last checked 3 months ago", time: "1 hr ago" },
];

export default function PrescriptionView({ mobile }: { mobile?: boolean }) {
  const { savePrescription, savedMsg } = useMedCare();

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

      {/* Notifications, updates, suggestions & chats bar */}
      <div style={{ marginTop: 14, background: C.n[0], border: "0.5px solid " + C.n[200], borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "0.5px solid " + C.n[200], background: C.n[50] }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.danger[400] }}></div>
            <span style={{ fontSize: 12, fontWeight: 500, color: C.n[900] }}>Notifications and updates, suggestions and chats</span>
          </div>
          <span style={{ fontSize: 10, color: C.n[500] }}>3 new</span>
        </div>
        <div style={{ padding: "0 14px" }}>
          {NOTIFICATIONS.map((n, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: i < 2 ? "0.5px solid " + C.n[200] : "none" }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: n.color[50], color: n.color[800] || n.color[600], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, flexShrink: 0, marginTop: 1 }}>{n.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: C.n[800], lineHeight: 1.4 }}>{n.text}</div>
                <div style={{ fontSize: 9, color: C.n[500], marginTop: 2 }}>{n.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
