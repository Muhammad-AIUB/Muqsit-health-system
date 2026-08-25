"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { useAuth } from "@/context/AuthContext";
import { buildPrescriptionHtml } from "@/lib/prescriptionDoc";
import { uploadImage } from "@/lib/api";
import { usePrescriptionLayout } from "@/hooks/usePrescriptionLayout";
import { useActivityFeed, useActivityLog } from "@/hooks/useActivity";
import { usePatientChat } from "@/hooks/useChat";
import { useRxAlertInput } from "@/hooks/useRxAlertInput";
import { formatActivityTime } from "@/lib/activityFormat";
import { formatPc } from "@/lib/previousComplaints";
import { isoToDdmmyyyy } from "@/lib/dateInput";
import { rxSnapshotKey } from "@/lib/rxSnapshot";
import LeftColumn from "./LeftColumn";
import RightColumn from "./RightColumn";
import PatientGate from "./PatientGate";
import PatientChat from "./PatientChat";
import RxAlerts from "./RxAlerts";
import PrintSheetModal from "./PrintSheetModal";

// Only ever emit an href for an http(s) URL. A javascript:/data: payload (e.g. a
// stored-XSS attempt planted on the shared practice feed) yields undefined so
// the link is inert.
const safeUrl = (u?: string | null): string | undefined =>
  u && /^https?:\/\//i.test(u) ? u : undefined;

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
  // ⚕️ ONE Save & print at a time. Two clicks a fraction apart used to run the
  // whole flow twice and record the consultation as TWO `Prescription` rows —
  // measured at 120ms apart, two rows 321ms apart. A ref, not state: both
  // clicks of a real double-press land before React has re-rendered, so a
  // state check would let the second one through. The state beside it is only
  // so the button can say what is happening; doctors press twice when nothing
  // appears to have happened.
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  // The printable sheet, shown in-app (see PrintSheetModal). `open` without
  // `html` is the interval between the doctor's click and the visit being
  // saved — the frame is on screen from the click, so nothing about printing
  // depends on a pop-up allowance any more.
  const [sheet, setSheet] = useState<{ open: boolean; html: string | null }>({ open: false, html: null });
  const closeSheet = useCallback(() => setSheet({ open: false, html: null }), []);
  // Assistants need the "Save and print" grant to save a prescription.
  const canSave = m.can("rx.savePrint") && gateOpen;
  // "Save to complete later" parks an unfinished visit. Deliberately NOT permission-gated:
  // it saves exactly what the background auto-save already writes for whoever is
  // typing, so gating it would only lose their work. It needs a patient and
  // something to save, and says which one is missing rather than going quiet.
  const canSaveDraft = gateOpen && m.hasRxContent;
  const draftTitle = !gateOpen
    ? "Select a patient (enter a mobile number) first"
    : !m.hasRxContent
      ? "Add a medicine or some clinical detail before saving."
      : "Save this unfinished prescription and start the next patient";

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
      // ⚕️ The ℞ lines exactly as the doctor entered them. Prescribing warnings
      // are deliberately NOT carried onto the sheet: they are a live aid while
      // writing, and the physician's decision (2026-08-17) is that the printed
      // and saved prescription shows what the doctor entered, not what the
      // system inferred. See lib/prescriptionDoc.ts.
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

  // Save, put the printable sheet on screen, record on the activity feed, then
  // snapshot that same sheet into the patient's "All prescriptions" gallery.
  // The sheet is the identical document "Preview PDF" opens — the doctor prints
  // it from the same modal toolbar; this route just persists the visit first.
  // The snapshot is best-effort: a capture/upload failure never undoes a
  // successful save.
  const handleSave = async () => {
    // A save is already running — this click is the second half of a
    // double-press. Do nothing at all: not a second window, not a second row.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await runSave();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const runSave = async () => {
    // Put the sheet's frame on screen at once, in its "saving" state. Skipped
    // for an empty form (hasRxContent mirrors savePrescription's own empty
    // check), which refuses to save anyway, so the modal can't flash open and
    // shut for nothing.
    const showing = m.hasRxContent;
    if (showing) setSheet({ open: true, html: null });

    // The save runs before anything that could throw. Nothing about rendering
    // the sheet may stand between the doctor's click and the visit being
    // persisted: a failure there must cost them the printout, never the record.
    const ok = await savePrescription();
    if (!ok) {
      // Never leave a printable prescription on screen for a visit that did not
      // save — the doctor could hand the patient a document the record has no
      // copy of. The failure reason is already shown under the buttons.
      closeSheet();
      return;
    }

    // Built once and used for both the on-screen sheet and the gallery snapshot,
    // so the stored image is provably the document that was printed. The editor is
    // untouched by the save, so this is still exactly what the doctor saw.
    let html: string;
    try {
      html = buildHtml();
    } catch {
      closeSheet();
      window.alert("Prescription saved, but the printable sheet could not be built. Open Preview PDF to print it.");
      logActivity("Prescription", `Prescription for ${m.ptName.trim() || "patient"}`, "saved");
      return;
    }

    // Only fill a frame that is still on screen: a doctor who pressed Close
    // while the save was in flight must not have the sheet reappear on them.
    setSheet((prev) => (prev.open ? { open: true, html } : prev));

    logActivity("Prescription", `Prescription for ${m.ptName.trim() || "patient"}`, "saved");
    // Snapshot the sheet into the patient's gallery — but only when it is a
    // sheet that gallery does not already hold. The doctor may press Save &
    // print any number of times on a visit they changed nothing on; that must
    // not file the same paper again (physician's decision, 2026-08-23). The
    // check is on the HTML, and it happens BEFORE the capture, so an unchanged
    // re-save also costs no render, no upload and no orphaned file on disk.
    try {
      const key = await rxSnapshotKey(html);
      if (m.claimRxSnapshot(key)) {
        try {
          const file = await capturePrescriptionImage(html);
          if (!file) throw new Error("capture produced no image");
          m.saveRxSnapshot(await uploadImage(file), key);
        } catch (e) {
          // Give the fingerprint back — an unchanged re-save must still be able
          // to file this sheet, since this attempt never reached the gallery.
          m.releaseRxSnapshot();
          throw e;
        }
      }
    } catch { /* ignore — image snapshot is optional */ }
  };

  const previewPdf = () => {
    try {
      setSheet({ open: true, html: buildHtml() });
    } catch {
      window.alert("The printable sheet could not be built.");
    }
  };

  if (mobile) {
    return (
      <>
        <PatientGate open={gateOpen}>
          <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.n[200]}`, color: C.n[800] }}>Clinical assessment</div><LeftColumn /></div>
          <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.pri[400]}`, color: C.pri[600] }}>Prescription</div><RightColumn mobile /></div>
        </PatientGate>
        <button onClick={() => { void m.saveDraftNow(); }} disabled={!canSaveDraft || saving} title={draftTitle} style={{ width: "100%", padding: "11px 20px", borderRadius: 8, marginBottom: 8, border: `0.5px solid ${canSaveDraft ? C.pri[100] : C.n[200]}`, background: canSaveDraft ? C.pri[50] : C.n[0], color: canSaveDraft ? C.pri[600] : C.n[500], fontSize: 13, fontWeight: 500, cursor: canSaveDraft ? "pointer" : "not-allowed", fontFamily: font }}>Save to complete later</button>
        <button onClick={handleSave} disabled={!canSave || saving} title={canSave ? undefined : gateOpen ? "You don't have permission to save & print" : "Select a patient (enter a mobile number) first"} style={{ width: "100%", padding: "11px 20px", borderRadius: 8, border: "none", background: canSave ? C.pri[400] : C.n[200], color: canSave ? "#fff" : C.n[500], fontSize: 13, fontWeight: 500, cursor: canSave ? "pointer" : "not-allowed", fontFamily: font }}>{saving ? "Saving…" : "Save & print"}</button>
        {savedMsg && <div style={{ textAlign: "center", fontSize: 12, color: C.pri[400], fontWeight: 500, marginTop: 6 }}>{savedMsg}</div>}
        {gateOpen && <><ReportsSection /><PatientChat /></>}
        {sheet.open && <PrintSheetModal html={sheet.html} onClose={closeSheet} />}
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
      {/* Wraps: "Save to complete later" is a long label, and this row also
          serves tablets (≥768px) where three buttons on one line get cramped. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18, paddingTop: 14, borderTop: `0.5px solid ${C.n[200]}` }}>
        <button onClick={() => { void m.saveDraftNow(); }} disabled={!canSaveDraft || saving} title={draftTitle} style={{ padding: "11px 20px", borderRadius: 8, border: `0.5px solid ${canSaveDraft ? C.pri[100] : C.n[200]}`, background: canSaveDraft ? C.pri[50] : C.n[0], color: canSaveDraft ? C.pri[600] : C.n[500], fontSize: 12, fontWeight: 500, cursor: canSaveDraft ? "pointer" : "not-allowed", whiteSpace: "nowrap", fontFamily: font }}>Save to complete later</button>
        <button onClick={handleSave} disabled={!canSave || saving} title={canSave ? undefined : gateOpen ? "You don't have permission to save & print" : "Select a patient (enter a mobile number) first"} style={{ flex: 1, padding: "11px 20px", borderRadius: 8, border: "none", background: canSave ? C.pri[400] : C.n[200], color: canSave ? "#fff" : C.n[500], fontSize: 13, fontWeight: 500, cursor: canSave ? "pointer" : "not-allowed", fontFamily: font }}>{saving ? "Saving…" : "Save & print prescription"}</button>
        <button onClick={previewPdf} style={{ padding: "11px 20px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: font }}>Preview PDF</button>
      </div>
      {savedMsg && <div style={{ textAlign: "center", fontSize: 12, color: C.pri[400], fontWeight: 500, marginTop: 8 }}>{savedMsg}</div>}
      {gateOpen && <><ReportsSection /><PatientChat /></>}
      {sheet.open && <PrintSheetModal html={sheet.html} onClose={closeSheet} />}
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

  // Live prescribing alerts, derived from what is in the editor right now.
  // Not persisted and not part of the feed sort: they sit above it, because
  // advice about the prescription being written must not scroll away under
  // chat messages.
  //
  // Only the INPUT is assembled here; the matching runs inside <RxAlerts>, so
  // its error boundary covers the computation too (see RxAlerts.tsx). The
  // assembly is shared with the ℞ pad's per-line bubbles so the two surfaces
  // can never disagree about what was checked.
  const alertInput = useRxAlertInput();

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

      <RxAlerts input={alertInput} />

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
                    {safeUrl(it.attachmentUrl) && <> <a href={safeUrl(it.attachmentUrl)} target="_blank" rel="noreferrer" style={{ color: C.info[800], textDecoration: "none", fontWeight: 500 }}>📎</a></>}
                  </>
                ) : (
                  <>{it.action === "saved" ? "saved" : "added"} {it.section}: <span style={{ fontWeight: 600 }}>{it.detail}</span>
                    {safeUrl(it.imageUrl) && <> <a href={safeUrl(it.imageUrl)} target="_blank" rel="noreferrer" style={{ color: C.info[800], textDecoration: "none", fontWeight: 500 }}>📎 View image</a></>}
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
