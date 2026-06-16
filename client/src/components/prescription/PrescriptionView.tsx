"use client";

import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { useAuth } from "@/context/AuthContext";
import { buildPrescriptionHtml } from "@/lib/prescriptionDoc";
import { usePrescriptionLayout } from "@/hooks/usePrescriptionLayout";
import { useActivityFeed, useActivityLog } from "@/hooks/useActivity";
import { formatActivityTime } from "@/lib/activityFormat";
import { formatPc } from "@/lib/previousComplaints";
import { isoToDdmmyyyy } from "@/lib/dateInput";
import LeftColumn from "./LeftColumn";
import RightColumn from "./RightColumn";

export default function PrescriptionView({ mobile }: { mobile?: boolean }) {
  const m = useMuqsit();
  const { savePrescription, savedMsg } = m;
  const { user } = useAuth();
  const { data: layout } = usePrescriptionLayout();
  const logActivity = useActivityLog();

  // Save, then record it on the activity feed (only if the save succeeded).
  const handleSave = async () => {
    const ok = await savePrescription();
    if (ok) logActivity("Prescription", `Prescription for ${m.ptName.trim() || "patient"}`, "saved");
  };

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
      extraPrivacyPage: layout?.rxType === "opd" && layout?.opdLayout === "extra",
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
        <button onClick={handleSave} style={{ width: "100%", padding: "11px 20px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: font }}>Save & print</button>
        {savedMsg && <div style={{ textAlign: "center", fontSize: 12, color: C.pri[400], fontWeight: 500, marginTop: 6 }}>{savedMsg}</div>}
        <ReportsSection />
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
        <button onClick={handleSave} style={{ flex: 1, padding: "11px 20px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: font }}>Save & print prescription</button>
        <button onClick={previewPdf} style={{ padding: "11px 20px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: font }}>Preview PDF</button>
      </div>
      {savedMsg && <div style={{ textAlign: "center", fontSize: 12, color: C.pri[400], fontWeight: 500, marginTop: 8 }}>{savedMsg}</div>}
      <ReportsSection />
    </>
  );
}

// ── Notification, Charts & Reports ──────────────────────────
// Live activity feed: who (doctor / assistant) added or saved what, with the
// date + time. Polled, so it stays current without a manual refresh.
function ReportsSection() {
  const { data: feed = [], isLoading } = useActivityFeed();

  return (
    <div style={{ marginTop: 22, paddingTop: 16, borderTop: `0.5px solid ${C.n[200]}` }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.n[800], textAlign: "center", marginBottom: 12 }}>Notification, Charts &amp; Reports</div>

      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, maxHeight: 260, overflowY: "auto" }}>
        {isLoading && feed.length === 0 ? (
          <div style={{ padding: "16px", fontSize: 12, color: C.n[500], textAlign: "center" }}>Loading activity…</div>
        ) : feed.length === 0 ? (
          <div style={{ padding: "16px", fontSize: 12, color: C.n[500], textAlign: "center" }}>No activity yet — adds and saves will show here with name, date &amp; time.</div>
        ) : (
          feed.map((a, i) => (
            <div key={a.id} style={{ display: "flex", gap: 10, padding: "9px 14px", borderTop: i === 0 ? "none" : `0.5px solid ${C.n[100]}` }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.action === "saved" ? C.pri[400] : C.info[400], flexShrink: 0, marginTop: 5 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: C.n[800], lineHeight: 1.5 }}>
                  <b style={{ color: C.n[900] }}>{a.actorName}</b> {a.action === "saved" ? "saved" : "added"} <span style={{ fontWeight: 600 }}>{a.detail}</span>
                  <span style={{ color: C.n[500] }}> · {a.section}</span>
                  {a.patientName && <span style={{ color: C.n[600] }}> · {a.patientName}</span>}
                </div>
                <div style={{ fontSize: 11, color: C.n[500], marginTop: 1 }}>{formatActivityTime(a.createdAt)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
