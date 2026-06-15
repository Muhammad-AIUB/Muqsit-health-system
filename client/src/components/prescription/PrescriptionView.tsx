"use client";

import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { useAuth } from "@/context/AuthContext";
import { buildPrescriptionHtml } from "@/lib/prescriptionDoc";
import { getRxType, getOpdLayout } from "@/lib/rxPrivacy";
import { formatPc } from "@/lib/previousComplaints";
import { isoToDdmmyyyy } from "@/lib/dateInput";
import LeftColumn from "./LeftColumn";
import RightColumn from "./RightColumn";

export default function PrescriptionView({ mobile }: { mobile?: boolean }) {
  const m = useMuqsit();
  const { savePrescription, savedMsg } = m;
  const { user } = useAuth();

  const previewPdf = () => {
    const followUp =
      m.followUpNum && Number(m.followUpNum) > 0
        ? `${m.followUpNum} ${m.followUpUnit}${Number(m.followUpNum) > 1 ? "s" : ""}${m.followUpMandatory ? " (mandatory)" : ""}`
        : "";

    const html = buildPrescriptionHtml({
      doctorName: user?.displayName?.trim() || user?.name || "Doctor",
      patient: {
        name: m.ptName, age: m.ptAge, gender: m.ptGender,
        address: m.ptAddress, weight: m.ptWeight, date: isoToDdmmyyyy(m.ptDate), phone: m.ptPhone,
      },
      clinical: [
        { label: "Chief complaints", items: m.chiefComplaints },
        { label: "Previous complaints", items: m.previousComplaints.map(formatPc) },
        { label: "History", items: m.history },
        { label: "Investigation findings", items: m.investigation },
        { label: "Drug history", items: m.drugHistory },
        { label: "On examination", items: m.onExamination },
        { label: "Note / plan", items: m.note },
        { label: "Provisional diagnosis", items: m.provisionalDiagnosis },
        { label: "Associated illness", items: m.associatedIllness },
        { label: "Final diagnosis", items: m.finalDiagnosis },
      ],
      rx: m.rxItems,
      advice: m.advice,
      adviceTest: m.adviceTest,
      followUp,
      // OPD + "extra page" → append a masked privacy copy as a second page.
      extraPrivacyPage: getRxType() === "opd" && getOpdLayout() === "extra",
    });

    const w = window.open("", "_blank", "width=860,height=1000");
    if (!w) {
      window.alert("Please allow pop-ups to preview the prescription.");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

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
        <button onClick={previewPdf} style={{ padding: "11px 20px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: font }}>Preview PDF</button>
      </div>
      {savedMsg && <div style={{ textAlign: "center", fontSize: 12, color: C.pri[400], fontWeight: 500, marginTop: 8 }}>{savedMsg}</div>}
    </>
  );
}
