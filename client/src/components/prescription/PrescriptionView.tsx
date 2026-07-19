"use client";

import { useMemo } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { useAuth } from "@/context/AuthContext";
import { buildPrescriptionHtml } from "@/lib/prescriptionDoc";
import { uploadImage } from "@/lib/api";
import { usePrescriptionLayout } from "@/hooks/usePrescriptionLayout";
import { useActivityFeed, useActivityLog } from "@/hooks/useActivity";
import { usePatientChat } from "@/hooks/useChat";
import { formatActivityTime } from "@/lib/activityFormat";
import { formatPc } from "@/lib/previousComplaints";
import { isoToDdmmyyyy } from "@/lib/dateInput";
import LeftColumn from "./LeftColumn";
import RightColumn from "./RightColumn";
import PatientGate from "./PatientGate";
import PatientChat from "./PatientChat";

// Render the printable prescription HTML to a PNG File via an off-screen iframe
// (isolates the print stylesheet from the app). Returns null if it can't render.
async function capturePrescriptionImage(html: string): Promise<File | null> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:1300px;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    if (!doc) return null;
    doc.open(); doc.write(html); doc.close();
    await new Promise((r) => setTimeout(r, 350));            // let layout settle
    if (doc.fonts) { try { await doc.fonts.ready; } catch { /* ignore */ } }
    await Promise.all(Array.from(doc.images).map((img) =>    // wait for the logo
      img.complete ? null : new Promise((res) => { img.onload = img.onerror = () => res(null); })));
    const sheet = (doc.querySelector(".sheet") as HTMLElement) ?? doc.body;
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: 900, windowHeight: Math.max(1300, sheet.scrollHeight) });
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/png", 0.95));
    if (!blob) return null;
    return new File([blob], `prescription-${Date.now()}.png`, { type: "image/png" });
  } finally {
    document.body.removeChild(iframe);
  }
}

export default function PrescriptionView({ mobile }: { mobile?: boolean }) {
  const m = useMuqsit();
  const { savePrescription, savedMsg } = m;
  const { user } = useAuth();
  const { data: layout } = usePrescriptionLayout();
  const logActivity = useActivityLog();
  // 3.docx: a patient must be chosen (via the mobile lookup) before anything can
  // be written or saved.
  const gateOpen = !!m.currentPatientId;
  // Assistants need the "Save and print" grant to save a prescription.
  const canSave = m.can("rx.savePrint") && gateOpen;

  // Build the printable prescription HTML from the current editor state.
  const buildHtml = () => {
    const followUp =
      m.followUpNum && Number(m.followUpNum) > 0
        ? `${m.followUpNum} ${m.followUpUnit}${Number(m.followUpNum) > 1 ? "s" : ""}${m.followUpMandatory ? " (mandatory)" : ""}`
        : "";

    return buildPrescriptionHtml({
      doctorName: user?.displayName?.trim() || user?.name || "Doctor",
      patient: {
        name: m.ptName, age: m.ptAge, gender: m.ptGender,
        address: m.ptAddress, weight: m.ptWeight, date: isoToDdmmyyyy(m.ptDate), phone: m.ptPhone,
      },
      clinical: [
        { label: "Chief complaints", items: m.chiefComplaints },
        { label: "Previous complaints", items: m.previousComplaints.map(formatPc) },
        { label: "History", items: m.history },
        { label: "Investigation findings", items: m.investigation.filter((s) => !s.includes("[image attached]") && !/^\d{2}\/\d{2}\/\d{4}:Report \d+(:|$)/i.test(s)) },
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
      // Page size + margins from Prescription settings (falls back to A4).
      page: layout ? {
        unit: layout.unit,
        width: layout.totalWidth,
        height: layout.totalHeight,
        marginLeft: layout.leftMargin,
        marginRight: layout.rightMargin,
        headerHeight: layout.headerHeight,
        footerHeight: layout.footerHeight,
      } : undefined,
    });
  };

  // Save, record on the activity feed, then snapshot the printed prescription as
  // an image into the patient's "All prescriptions" gallery. The snapshot is
  // best-effort — a capture/upload failure never undoes a successful save.
  const handleSave = async () => {
    const ok = await savePrescription();
    if (!ok) return;
    logActivity("Prescription", `Prescription for ${m.ptName.trim() || "patient"}`, "saved");
    try {
      const file = await capturePrescriptionImage(buildHtml());
      if (file) {
        const url = await uploadImage(file);
        m.saveRxImages([...m.rxImages, url]);
      }
    } catch { /* ignore — image snapshot is optional */ }
  };

  const previewPdf = () => {
    const w = window.open("", "_blank", "width=860,height=1000");
    if (!w) {
      window.alert("Please allow pop-ups to preview the prescription.");
      return;
    }
    w.document.write(buildHtml());
    w.document.close();
  };

  if (mobile) {
    return (
      <>
        <PatientGate open={gateOpen}>
          <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.n[200]}`, color: C.n[800] }}>Clinical assessment</div><LeftColumn /></div>
          <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.pri[400]}`, color: C.pri[600] }}>Prescription</div><RightColumn mobile /></div>
        </PatientGate>
        <button onClick={handleSave} disabled={!canSave} title={canSave ? undefined : gateOpen ? "You don't have permission to save & print" : "Select a patient (enter a mobile number) first"} style={{ width: "100%", padding: "11px 20px", borderRadius: 8, border: "none", background: canSave ? C.pri[400] : C.n[200], color: canSave ? "#fff" : C.n[500], fontSize: 13, fontWeight: 500, cursor: canSave ? "pointer" : "not-allowed", fontFamily: font }}>Save &amp; print</button>
        {savedMsg && <div style={{ textAlign: "center", fontSize: 12, color: C.pri[400], fontWeight: 500, marginTop: 6 }}>{savedMsg}</div>}
        {gateOpen && <><ReportsSection /><PatientChat /></>}
      </>
    );
  }

  return (
    <>
      <PatientGate open={gateOpen}>
        <div className="rxEditorGrid" style={{ display: "grid", gridTemplateColumns: "0.6fr 0.5px 1.4fr", gap: 0 }}>
          <div style={{ paddingRight: 12, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.n[200]}`, color: C.n[800] }}>Clinical assessment</div><LeftColumn /></div>
          <div className="rxEditorDivider" style={{ background: C.n[200] }} />
          <div style={{ paddingLeft: 16, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.pri[400]}`, color: C.pri[600] }}>Prescription</div><RightColumn /></div>
        </div>
        <style>{`
          /* Tablet & below: stack the two editor columns — the desktop grid gets
             too cramped (left column ~220px) at ~768px. Phones already use the
             mobile single-column layout via the mobile prop. */
          @media (max-width: 860px) {
            .rxEditorGrid { grid-template-columns: 1fr !important; }
            .rxEditorGrid > .rxEditorDivider { display: none; }
            .rxEditorGrid > div { padding-left: 0 !important; padding-right: 0 !important; }
          }
        `}</style>
      </PatientGate>
      <div style={{ display: "flex", gap: 10, marginTop: 18, paddingTop: 14, borderTop: `0.5px solid ${C.n[200]}` }}>
        <button onClick={handleSave} disabled={!canSave} title={canSave ? undefined : gateOpen ? "You don't have permission to save & print" : "Select a patient (enter a mobile number) first"} style={{ flex: 1, padding: "11px 20px", borderRadius: 8, border: "none", background: canSave ? C.pri[400] : C.n[200], color: canSave ? "#fff" : C.n[500], fontSize: 13, fontWeight: 500, cursor: canSave ? "pointer" : "not-allowed", fontFamily: font }}>Save &amp; print prescription</button>
        <button onClick={previewPdf} style={{ padding: "11px 20px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: font }}>Preview PDF</button>
      </div>
      {savedMsg && <div style={{ textAlign: "center", fontSize: 12, color: C.pri[400], fontWeight: 500, marginTop: 8 }}>{savedMsg}</div>}
      {gateOpen && <><ReportsSection /><PatientChat /></>}
    </>
  );
}

// ── Notifications, Chats & Reports ──────────────────────────
// One live feed merging the activity log (who added/saved what, with the detail)
// and the team chat, newest first. Polled, so it stays current without refresh.
function ReportsSection() {
  // Only the loaded patient's activity — this section renders only when a
  // patient is selected, so currentPatientId is always set here.
  const { currentPatientId } = useMuqsit();
  const { data: feed = [], isLoading } = useActivityFeed(currentPatientId);
  const { data: chat = [] } = usePatientChat(currentPatientId);

  const items = useMemo(() => {
    const acts = feed.map((a) => ({
      id: a.id, createdAt: a.createdAt, kind: "activity" as const,
      name: a.actorName, action: a.action, section: a.section, detail: a.detail, imageUrl: a.imageUrl,
    }));
    const msgs = chat.map((c) => ({
      id: `chat-${c.id}`, createdAt: c.createdAt, kind: "chat" as const,
      name: c.authorName, body: c.body, attachmentUrl: c.attachmentUrl,
    }));
    return [...acts, ...msgs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [feed, chat]);

  return (
    <div style={{ marginTop: 22, paddingTop: 16, borderTop: `0.5px solid ${C.n[200]}` }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.n[800], textAlign: "center", marginBottom: 12 }}>Notifications, Chats &amp; Reports</div>

      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, maxHeight: 300, overflowY: "auto" }}>
        {isLoading && items.length === 0 ? (
          <div style={{ padding: "16px", fontSize: 12, color: C.n[500], textAlign: "center" }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: "16px", fontSize: 12, color: C.n[500], textAlign: "center" }}>Nothing yet — adds, saves &amp; chat messages will show here with name, date &amp; time.</div>
        ) : (
          items.map((it, idx) => (
            <div key={it.id} style={{ display: "flex", gap: 10, padding: "9px 14px", borderTop: idx === 0 ? "none" : `0.5px solid ${C.n[100]}` }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: it.kind === "chat" ? C.info[400] : it.action === "saved" ? C.pri[400] : C.warn[800], flexShrink: 0, marginTop: 6 }} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.n[800], lineHeight: 1.55 }}>
                <span style={{ color: C.n[500] }}>{formatActivityTime(it.createdAt)}: </span>
                <b style={{ color: C.n[900] }}>{it.name}</b>{" "}
                {it.kind === "chat" ? (
                  <>: message : <span style={{ fontStyle: "italic", color: C.n[700] }}>“{it.body || "(attachment)"}”</span>
                    {it.attachmentUrl && <> <a href={it.attachmentUrl} target="_blank" rel="noreferrer" style={{ color: C.info[800], textDecoration: "none", fontWeight: 500 }}>📎</a></>}
                  </>
                ) : (
                  <>{it.action === "saved" ? "saved" : "added"} {it.section}: <span style={{ fontWeight: 600 }}>{it.detail}</span>
                    {it.imageUrl && <> <a href={it.imageUrl} target="_blank" rel="noreferrer" style={{ color: C.info[800], textDecoration: "none", fontWeight: 500 }}>📎 View image</a></>}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
