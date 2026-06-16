"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import MedicinePad, { type Row } from "@/components/prescription/MedicinePad";
import { rowsFromRxItems, rxItemsFromRows } from "@/lib/rxRows";
import ExpandableField from "@/components/common/ExpandableField";
import InvestigationFindingsField from "@/components/investigation/InvestigationFindingsField";
import { suggestionDB, advisedTestSuggestions } from "@/data/suggestions";
import { useIpdEvents, useAddIpdEvent, useUpdateIpd, type IpdAdmission } from "@/hooks/useIpd";
import type { IpdClinical, IpdFollowUp, IpdFollowUpEntry } from "@/lib/api";

const fmtAdmit = (iso: string) =>
  new Date(iso).toLocaleDateString("default", { day: "numeric", month: "short", year: "numeric" });
const fmtTs = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const dayOfStay = (iso: string) =>
  Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) + 1);

const p2 = (n: number) => String(n).padStart(2, "0");
// Split a follow-up entry into a time label and the vitals summary, e.g.
// time "16:34 · 17.06.26", vitals "BP 110/80 · HR 67 b/m · O₂ 98% · U/O 200 ml".
const followUpParts = (e: IpdFollowUpEntry): { time: string; vitals: string; note?: string } => {
  const d = new Date(e.ts);
  const time = `${p2(d.getHours())}:${p2(d.getMinutes())} · ${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
  const parts: string[] = [];
  if (e.bp) parts.push(`BP ${e.bp}`);
  if (e.hr) parts.push(`HR ${e.hr} b/m`);
  if (e.temp) parts.push(`T ${e.temp}`);
  if (e.spo2) parts.push(`O₂ ${e.spo2}%`);
  if (e.urineOutput) parts.push(`U/O ${e.urineOutput} ml`);
  if (e.fluidIntake) parts.push(`F/I ${e.fluidIntake} ml`);
  if (e.bloodSugar) parts.push(`BS ${e.bloodSugar}`);
  return { time, vitals: parts.join(" · "), note: e.note?.trim() || undefined };
};

export default function IpdDetailView({ admission, onBack }: { admission: IpdAdmission; onBack: () => void }) {
  const update = useUpdateIpd();
  const { data: events = [] } = useIpdEvents(admission.id);
  const addEvent = useAddIpdEvent();

  // The Investigation popup is a global singleton wired to these context fields.
  // We borrow them for this admission while the detail is open (loading the
  // admission's findings on enter, restoring the prescription draft on leave),
  // so the IPD investigation field is the *same* popup as the prescription page.
  const { investigation, setInvestigation, invImages, setInvImages, setShowInvPopup } = useMuqsit();

  const c = admission.clinical ?? {};
  const [age, setAge] = useState(admission.age != null ? String(admission.age) : "");
  const [sex, setSex] = useState(admission.sex ?? "");

  const snapRef = useRef<{ inv: string[]; img: Record<string, string> } | null>(null);
  useEffect(() => {
    snapRef.current = { inv: investigation, img: invImages };
    setInvestigation(admission.clinical?.investigation ?? []);
    setInvImages({});
    return () => {
      if (snapRef.current) { setInvestigation(snapRef.current.inv); setInvImages(snapRef.current.img); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admission.id]);

  // Chip-list sections (same UX as the prescription page).
  const [diagnosis, setDiagnosis] = useState<string[]>(c.diagnosis ?? (admission.diagnosis ? [admission.diagnosis] : []));
  const [chiefComplaints, setChief] = useState<string[]>(c.chiefComplaints ?? []);
  const [procedure, setProc] = useState<string[]>(c.procedure ?? []);
  const [plan, setPlan] = useState<string[]>(c.plan ?? []);
  const [adviceTests, setAdvice] = useState<string[]>(c.adviceTests ?? []);

  // Follow Up — a timestamped log. `draft` is the in-progress vitals; pressing
  // the Follow-Up "Save" appends it as an entry shown in short form below.
  const [followUps, setFollowUps] = useState<IpdFollowUpEntry[]>(c.followUps ?? []);
  const [draft, setDraft] = useState<IpdFollowUp>({});
  const setFu = (k: keyof IpdFollowUp, v: string) => setDraft((p) => ({ ...p, [k]: v }));
  const draftHasValue = Object.values(draft).some((v) => (v ?? "").trim());

  const [rows, setRows] = useState<Row[]>(() => rowsFromRxItems(c.rxItems ?? []));

  const [savedMsg, setSavedMsg] = useState("");
  const [eventMsg, setEventMsg] = useState("");

  // Cross-field map ExpandableField uses for "@field" references.
  const allFields: Record<string, string[]> = {
    Diagnosis: diagnosis, "Chief Complaints": chiefComplaints,
    "Investigation Reports findings": investigation, Procedure: procedure,
    Plan: plan, "Advice tests": adviceTests,
  };

  const buildClinical = (followUpsOverride?: IpdFollowUpEntry[]): IpdClinical => ({
    diagnosis, chiefComplaints, investigation, procedure, plan, adviceTests,
    followUps: followUpsOverride ?? followUps,
    rxItems: rxItemsFromRows(rows),
  });

  const persist = async (clinical: IpdClinical) => {
    try {
      await update.mutateAsync({
        id: admission.id,
        input: { age: age ? Number(age) : undefined, sex: sex || undefined, diagnosis: diagnosis.join(", "), clinical },
      });
      setSavedMsg("Saved!");
    } catch {
      setSavedMsg("Save failed");
    }
    setTimeout(() => setSavedMsg(""), 2500);
  };

  // Top "Save" — also commits a non-empty follow-up draft so it isn't lost.
  const save = () => {
    const next = draftHasValue ? [...followUps, { ...draft, ts: new Date().toISOString() }] : followUps;
    if (draftHasValue) { setFollowUps(next); setDraft({}); }
    void persist(buildClinical(next));
  };

  // Follow-Up "Save" — append the current draft as a timestamped entry.
  const saveFollowUp = () => {
    if (!draftHasValue) return;
    const next = [...followUps, { ...draft, ts: new Date().toISOString() }];
    setFollowUps(next);
    setDraft({});
    void persist(buildClinical(next));
  };


  const sendEvent = async () => {
    const msg = eventMsg.trim();
    if (!msg) return;
    await addEvent.mutateAsync({ id: admission.id, note: msg });
    setEventMsg("");
  };

  return (
    <div style={{ fontFamily: font }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <button onClick={onBack} style={btnBack}>← Back to ward</button>
        <div style={{ flex: 1 }} />
        {savedMsg && <span style={{ fontSize: 12, color: savedMsg === "Saved!" ? C.pri[600] : C.danger[800] }}>{savedMsg}</span>}
        <button onClick={() => void save()} disabled={update.isPending} style={btnSave}>{update.isPending ? "Saving…" : "Save"}</button>
      </div>

      {/* Admission header */}
      <div style={{ border: `1px solid ${C.n[300]}`, borderRadius: 8, padding: "14px 18px", marginBottom: 16, background: C.n[0] }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px" }}>
          <HField label="Name of the patient" value={admission.name} />
          <HField label="Age"><input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="—" style={hInp(46)} /></HField>
          <HField label="Sex"><select value={sex} onChange={(e) => setSex(e.target.value)} style={hInp(80)}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></HField>
          <HField label="Date of admission" value={fmtAdmit(admission.admittedAt)} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", marginTop: 10 }}>
          <HField label="Mobile number" value={admission.mobile} />
          <HField label="Hospital ID" value={admission.hospitalId} />
          <HField label="Ward/Cabin" value={admission.wardNo} />
          <HField label="Bed no" value={admission.bed} />
          <HField label="Floor/Building" value={admission.floorBuilding} />
        </div>
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <span style={{ color: C.n[600] }}>Length of stay: </span>
          <b style={{ color: C.pri[600] }}>Day {dayOfStay(admission.admittedAt)}</b>
        </div>
      </div>

      {/* Body: left clinical sheet + right prescription */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 340px", minWidth: 300 }}>
          <ExpandableField label="Diagnosis" items={diagnosis} setItems={setDiagnosis} suggestions={suggestionDB["Provisional diagnosis"]} allFields={allFields} />
          <ExpandableField label="Chief Complaints" items={chiefComplaints} setItems={setChief} suggestions={suggestionDB["Chief complaints"]} allFields={allFields} />
          <div style={{ marginBottom: 12 }}>
            <InvestigationFindingsField label="Investigation report findings" items={investigation} invImages={invImages} onOpen={() => setShowInvPopup(true)} />
          </div>
          <ExpandableField label="Procedure" items={procedure} setItems={setProc} allFields={allFields} />

          {/* Follow Up — structured vitals, saved as a timestamped log */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.n[800], marginBottom: 6 }}>Follow Up</div>
            <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 8, padding: 12, background: C.n[0] }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <Vital label="Blood pressure" placeholder="120/80 mmHg" value={draft.bp ?? ""} onChange={(v) => setFu("bp", v)} />
                <Vital label="Heart Rate" placeholder="bpm" value={draft.hr ?? ""} onChange={(v) => setFu("hr", v)} />
                <Vital label="Temperature" placeholder="°F" value={draft.temp ?? ""} onChange={(v) => setFu("temp", v)} />
                <Vital label="Oxygen saturation" placeholder="SpO₂ %" value={draft.spo2 ?? ""} onChange={(v) => setFu("spo2", v)} />
                <Vital label="Urine output" placeholder="mL" value={draft.urineOutput ?? ""} onChange={(v) => setFu("urineOutput", v)} />
                <Vital label="Fluid Intake/Given" placeholder="mL" value={draft.fluidIntake ?? ""} onChange={(v) => setFu("fluidIntake", v)} />
                <Vital label="Blood sugar level" placeholder="mmol/L" value={draft.bloodSugar ?? ""} onChange={(v) => setFu("bloodSugar", v)} />
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={vLbl}>Specific Note</div>
                <textarea value={draft.note ?? ""} onChange={(e) => setFu("note", e.target.value)} rows={2}
                  style={{ width: "100%", boxSizing: "border-box", resize: "vertical", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, padding: "8px 10px", fontSize: 12.5, fontFamily: font, color: C.n[900], outline: "none", lineHeight: 1.5, background: C.n[0] }} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button onClick={saveFollowUp} disabled={!draftHasValue || update.isPending} style={{ ...btnSave, padding: "6px 16px", opacity: draftHasValue ? 1 : 0.5, cursor: draftHasValue ? "pointer" : "default" }}>Save follow up</button>
              </div>
            </div>

            {/* Saved follow-up log */}
            {followUps.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {followUps.map((e) => {
                  const fp = followUpParts(e);
                  return (
                    <div key={e.ts} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "8px 12px", borderRadius: 8, background: C.n[50], borderLeft: `3px solid ${C.pri[400]}` }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: C.pri[600], letterSpacing: "0.05em", flexShrink: 0 }}>F/U</span>
                      <span style={{ fontSize: 11, color: C.n[500], flexShrink: 0, whiteSpace: "nowrap" }}>{fp.time}</span>
                      <span style={{ flex: 1, fontSize: 12.5, color: C.n[800], lineHeight: 1.5 }}>
                        {fp.vitals}{fp.note && <span style={{ color: C.n[600], fontStyle: "italic" }}> — {fp.note}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <ExpandableField label="Plan" items={plan} setItems={setPlan} allFields={allFields} />
          <ExpandableField label="Advice tests" items={adviceTests} setItems={setAdvice} suggestions={advisedTestSuggestions} allFields={allFields} />
        </div>

        <div style={{ flex: "1 1 420px", minWidth: 320 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.pri[600], borderBottom: `1px solid ${C.pri[100]}`, paddingBottom: 6, marginBottom: 10 }}>Prescription</div>
          <div style={{ fontSize: 15, color: C.pri[600], marginBottom: 6 }}>℞</div>
          <MedicinePad rows={rows} setRows={setRows} minHeight={360} noteText="Start typing a medicine or note…" showCheck={false} />
        </div>
      </div>

      {/* Events, chat and investigation */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.n[800], marginBottom: 8 }}>Events, chat and investigation</div>
        <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 10, background: C.n[0] }}>
          <div style={{ maxHeight: 280, overflowY: "auto", padding: "14px 18px" }}>
            {events.length === 0 ? (
              <div style={{ textAlign: "center", color: C.n[500], fontSize: 12, padding: "20px 0" }}>No events recorded yet</div>
            ) : (
              events.map((ev, idx) => (
                <div key={ev.id} style={{ display: "flex", gap: 12, paddingBottom: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.pri[400], marginTop: 3 }} />
                    {idx < events.length - 1 && <div style={{ width: 1.5, flex: 1, background: C.n[200], marginTop: 3 }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: C.n[500], marginBottom: 2 }}>{fmtTs(ev.createdAt)}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.n[800], marginBottom: 3 }}>{ev.author}{ev.role ? <span style={{ fontWeight: 400, color: C.n[500] }}> — {ev.role}</span> : ""}</div>
                    <div style={{ fontSize: 12, color: C.n[700], lineHeight: 1.5 }}>{ev.note}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div style={{ borderTop: `0.5px solid ${C.n[200]}`, padding: "10px 14px", display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea value={eventMsg} onChange={(e) => setEventMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendEvent(); } }}
              placeholder="Add an event / note… (Enter to send, Shift+Enter for new line)" rows={2}
              style={{ flex: 1, resize: "none", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, padding: "8px 10px", fontSize: 12, fontFamily: font, color: C.n[800], outline: "none", lineHeight: 1.5, background: C.n[50] }} />
            <button onClick={() => void sendEvent()} disabled={addEvent.isPending} style={{ ...btnSave, alignSelf: "flex-end" }}>{addEvent.isPending ? "…" : "Send"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HField({ label, value, children }: { label: string; value?: string | null; children?: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: C.n[600] }}>{label}:</span>
      {children ?? <b style={{ color: C.n[900] }}>{value || "—"}</b>}
    </div>
  );
}

function Vital({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: "1 1 140px", minWidth: 120 }}>
      <div style={vLbl}>{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, fontSize: 12.5, fontFamily: font, color: C.n[900], outline: "none", background: C.n[0] }} />
    </div>
  );
}

const vLbl: CSSProperties = { fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 3 };
const hInp = (w: number): CSSProperties => ({ padding: "3px 6px", borderRadius: 5, border: `0.5px solid ${C.n[200]}`, fontSize: 12.5, fontFamily: font, color: C.n[900], outline: "none", width: w });
const btnBack: CSSProperties = { padding: "6px 12px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[800], fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font };
const btnSave: CSSProperties = { padding: "7px 18px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: font };
