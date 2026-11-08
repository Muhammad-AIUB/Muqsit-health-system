"use client";

// The read-only history sections of "Patient's Prescriptions & reports",
// after the Investigation reports summary (physician's sheet 31/10/2026, item
// 3): Drug history · Patient's input · Disease and surgical history · Chief
// complaints history · Diagnosis history. Nothing here writes: each section
// reads what the app already holds (`lib/patientRecords.ts`) and shows it as
// written; Download opens a printable page of it (`lib/recordsDoc.ts`).

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { C } from "@/theme";
import { btnDisabled, btnSecondary } from "@/theme/styles";
import { useMuqsit } from "@/context/MuqsitContext";
import { patientsApi, prescriptionsApi } from "@/lib/api";
import { tell } from "@/lib/dialogs";
import { ddmmyyyyMs, ddmmyyyyMsStrict, isoToDdmmyyyy } from "@/lib/dateInput";
import { dhakaToday } from "@/lib/opdDay";
import { rxDrugHistoryEntries } from "@/lib/rxDrugHistory";
import { buildRecordsDoc, type DocGroup } from "@/lib/recordsDoc";
import { useDrugHistoryGenerics } from "@/hooks/useDrugHistoryGenerics";
import { useActivityLog } from "@/hooks/useActivity";
import { GenericsNotLoaded } from "./DrugHistoryName";
import DrugHistoryTable from "./DrugHistoryTable";
import { diseaseSurgicalHistory, drugHistoryByDate, perVisit, rxDay, type HxEntry } from "@/lib/patientRecords";
import { oeAuthorLabel } from "@/lib/onExaminationSummary";
import { LoadError } from "@/components/common/ListState";
import Icon from "@/components/common/Icon";
import { CollapseToggle } from "@/components/common/CollapseToggle";

/** Open a printable page; says so in a box when the browser blocks it. */
export function openRecordsDoc(html: string) {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) { tell({ title: "The page could not open.", body: "Allow pop-ups for this site, then press Download again.", tone: "info" }); return; }
  w.document.write(html);
  w.document.close();
}

export function useRecordsPatient(): [string, string][] {
  const { ptName, ptAge, ptGender, ptPhone } = useMuqsit();
  return [["Name", ptName], ["Age", ptAge], ["Sex", ptGender], ["Mobile", ptPhone]];
}

export const printedToday = () => isoToDdmmyyyy(dhakaToday());

export function SectionHeader({ title, onDownload, canDownload, actions, open, onToggle }: { title: string; onDownload?: () => void; canDownload?: boolean; actions?: React.ReactNode; open?: boolean; onToggle?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, rowGap: 8, marginBottom: 10 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: C.n[900], margin: 0, minWidth: 0, display: "flex", alignItems: "center" }}>
        {onToggle && <CollapseToggle title={title} open={Boolean(open)} onToggle={onToggle} />}
        {title}
      </h3>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {actions}
        {onDownload && (
          <button
            onClick={onDownload}
            disabled={!canDownload}
            aria-label={`Download ${title}`}
            style={{ ...btnSecondary("sm"), color: C.pri[600], ...(canDownload ? null : btnDisabled) }}
          ><Icon name="download" size={14} /> Download</button>
        )}
      </div>
    </div>
  );
}

export const card: React.CSSProperties = {
  border: `0.5px solid ${C.n[200]}`, borderRadius: 10, background: C.n[0], padding: "14px 18px", maxHeight: 340, overflowY: "auto",
};
const empty: React.CSSProperties = { fontSize: 13, color: C.n[500] };
const line: React.CSSProperties = { fontSize: 13, color: C.n[800], lineHeight: 1.6, overflowWrap: "anywhere" };
const heading: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: C.n[900], marginBottom: 2 };
const section: React.CSSProperties = { marginTop: 22 };

// A stored medicine line is `Drug — dose — food — duration`: its name, and the rest as written.
const SEP = " — ";
const medName = (body: string): string => { const i = body.indexOf(SEP); return (i === -1 ? body : body.slice(0, i)).trim(); };

/** Which sections are open (`PatientRecordsView` owns it). Without it every
 *  section is drawn open and has no arrow — how the tests and any other caller
 *  have always seen it. */
export type Sections = { isOpen: (key: string) => boolean; toggle: (key: string) => void };

export default function RecordsHistorySections({ sec }: { sec?: Sections }) {
  const open = (k: string) => (sec ? sec.isOpen(k) : true);
  const arrow = (k: string) => (sec ? { open: sec.isOpen(k), onToggle: () => sec.toggle(k) } : {});
  const {
    currentPatientId, drugHistory, ptDate, onExaminationSummary, ptName,
    rxItems, can, activeWorkstationId, authUserId, editDrugHistoryBlock, addDrugHistoryEntries,
  } = useMuqsit();
  const patient = useRecordsPatient();
  const title = (t: string) => `${t} — ${ptName || "Patient"}`;
  const logActivity = useActivityLog();

  // ⚕️ Edit / Add of the Drug history write the patient's RECORD, which only the
  // owner's practice may (the server refuses a supervising doctor, and an
  // assistant needs a prescription key). The affordance is offered only where
  // the write would be taken — the server is still the boundary. Same test as
  // the Health-trend chart's: the patient's doctor is the practice on screen.
  const mayEditDh = can("rx.drugHistory");
  const mayAddMed = can("rx.medicines");
  const { data: record } = useQuery({
    queryKey: ["patient", currentPatientId],
    queryFn: () => patientsApi.get(currentPatientId as string),
    enabled: Boolean(currentPatientId) && (mayEditDh || mayAddMed),
  });
  const practiceId = activeWorkstationId ?? authUserId;
  const ownRecord = Boolean(record?.doctorId && practiceId && record.doctorId === practiceId);

  // Same query key as Previous complaints and "P.D", so the three share one
  // fetch. The list is this practice's own prescriptions (server Rule 2).
  const rxQuery = useQuery({
    queryKey: ["prescriptions", currentPatientId],
    queryFn: () => prescriptionsApi.listByPatient(currentPatientId as string),
    enabled: Boolean(currentPatientId),
  });

  const visitDate = isoToDdmmyyyy(ptDate);
  const dh = useMemo(() => drugHistoryByDate(drugHistory ?? [], visitDate), [drugHistory, visitDate]);
  // The lines today's ℞ owns (the pad mirrors them into the history): their rows
  // are the pad's to change, not this table's.
  const padLines = useMemo(() => new Set(rxDrugHistoryEntries(rxItems ?? [], visitDate)), [rxItems, visitDate]);
  const todayMs = ddmmyyyyMs(isoToDdmmyyyy(dhakaToday()));
  // ⚕️ Read by the generic (physician, 02/11/2026), as in the Drug history
  // modal — display only. The Download keeps the entries as stored (open
  // question for the physician, FUNCTIONAL-AUDIT.md).
  const medLabels = useMemo(() => Array.from(new Set(dh.flatMap((g) => g.items)
    .filter((r) => r.kind === "med").map((r) => medName(r.body)).filter(Boolean))), [dh]);
  const generics = useDrugHistoryGenerics(medLabels, dh.length > 0);
  const hx = useMemo(() => diseaseSurgicalHistory(onExaminationSummary ?? []), [onExaminationSummary]);
  const rxList = Array.isArray(rxQuery.data) ? rxQuery.data : undefined;
  // ⚕️ The days a prescription was written — what "a visit" means to the Drug
  // history table's "one row while it goes on, a break starts another". Today's
  // unsaved ℞ counts once it holds a line. Unknown (undefined) until the list is here.
  const visitDays = useMemo(() => {
    if (!rxList) return undefined;
    const days = new Set<number>();
    for (const r of rxList) {
      const ms = ddmmyyyyMsStrict(rxDay(r.createdAt));
      if (!Number.isNaN(ms)) days.add(ms);
    }
    if (padLines.size > 0) { const t = ddmmyyyyMsStrict(visitDate); if (!Number.isNaN(t)) days.add(t); }
    return [...days];
  }, [rxList, padLines, visitDate]);
  const complaints = useMemo(() => perVisit(rxList, "chiefComplaints"), [rxList]);
  const diagnoses = useMemo(() => perVisit(rxList, "finalDiagnosis"), [rxList]);

  const download = (t: string, groups: DocGroup[]) =>
    openRecordsDoc(buildRecordsDoc({ title: title(t), printed: printedToday(), patient, groups }));

  const hxLine = (e: HxEntry) => `${e.text} — recorded ${e.date}${e.by ? ` ${oeAuthorLabel(e.by)}` : ""}`;

  // A list that came from past prescriptions has four states, and each says
  // what it is: no patient, loading, failed (with Try again), here.
  const rxState = (groups: { date: string; items: string[] }[], what: string) => {
    if (!currentPatientId) return <div style={empty}>Load a saved patient to see their {what}.</div>;
    if (rxQuery.isError) return <LoadError compact title={`Could not load the ${what}.`} onRetry={() => void rxQuery.refetch()} retrying={rxQuery.isFetching} />;
    if (!Array.isArray(rxQuery.data)) return <div style={empty}>Loading…</div>;
    if (!groups.length) return <div style={empty}>No {what} yet. It is listed here from each saved prescription.</div>;
    return (
      <div style={card}>
        {groups.map((g, gi) => (
          <div key={gi} style={{ marginBottom: gi < groups.length - 1 ? 12 : 0 }}>
            <div style={heading}>{g.date || "Date not known"}</div>
            <div style={{ paddingLeft: 16 }}>
              {g.items.map((t, i) => <div key={i} style={line}>{t}</div>)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      {/* Drug history — the patient's list, as the Drug history modal holds it. */}
      <section style={section} aria-label="Drug history">
        <DrugHistoryTable
          key={currentPatientId ?? "none"}
          entries={drugHistory ?? []}
          visitDays={visitDays}
          visitDate={visitDate}
          todayMs={todayMs}
          newStartIso={ptDate}
          generics={generics}
          canEdit={ownRecord && mayEditDh}
          canAdd={ownRecord && mayAddMed}
          padLines={padLines}
          collapsed={!open("drug")}
          onSave={editDrugHistoryBlock}
          onDownload={(groups) => download("Drug history", groups)}
          onAdd={(entries) => {
            const ok = addDrugHistoryEntries(entries, { toRecord: true });
            if (ok) {
              const names = entries.filter((e) => !/^[^:]*\((cont|note)\):/.test(e)).map((e) => `“${medName(e.replace(/^[^:]*:\s*/, ""))}”`);
              const on = entries[0]?.match(/^(\d{2}\/\d{2}\/\d{4})/)?.[1];
              if (names.length) logActivity("Drug history", `Added ${names.join(", ")}${on ? ` (start ${on})` : ""}`.slice(0, 380), "added");
            }
            return ok;
          }}
          onSaved={(note) => logActivity("Drug history", note.slice(0, 380), "saved")}
          renderActions={(actions) => (
            <>
              <SectionHeader
                title="Drug history"
                actions={actions}
                {...arrow("drug")}
              />
              {open("drug") && <GenericsNotLoaded g={generics} />}
            </>
          )}
        />
      </section>

      {/* Patient's input — no such record exists in the app yet. Said plainly;
          nothing is made up to fill it (open question for the physician). */}
      <section style={section} aria-label="Patient's input">
        <SectionHeader title="Patient's input" {...arrow("input")} />
        {open("input") && <div style={empty}>Nothing is recorded as the patient&apos;s own input yet. This section will show it once what it should hold is decided.</div>}
      </section>

      {/* Disease and surgical history — the On-examination popup's two history
          boxes, as they reached the patient's shared examination history. */}
      <section style={section} aria-label="Disease and surgical history">
        <SectionHeader
          title="Disease and surgical history"
          {...arrow("hx")}
          canDownload={hx.disease.length + hx.surgical.length > 0}
          onDownload={() => download("Disease and surgical history", [
            { heading: "Disease history", lines: hx.disease.map((e) => ({ text: hxLine(e) })) },
            { heading: "Surgical / intervention history", lines: hx.surgical.map((e) => ({ text: hxLine(e) })) },
          ].filter((g) => g.lines.length))}
        />
        {!open("hx") ? null : hx.disease.length + hx.surgical.length === 0 ? (
          <div style={empty}>No disease or surgical history yet. It is listed here from <b>On examination</b> → History of each saved prescription.</div>
        ) : (
          <div style={card}>
            {([["Disease history", hx.disease], ["Surgical / intervention history", hx.surgical]] as const).filter(([, l]) => l.length).map(([h, list], gi) => (
              <div key={h} style={{ marginBottom: gi === 0 ? 12 : 0 }}>
                <div style={heading}>{h}</div>
                <div style={{ paddingLeft: 16 }}>
                  {list.map((e, i) => (
                    <div key={i} style={line}>
                      {e.text} <span style={{ color: C.n[500], fontSize: 12 }}>· recorded {e.date}{e.by ? ` ${oeAuthorLabel(e.by)}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={section} aria-label="Chief complaints history">
        <SectionHeader
          title="Chief complaints history"
          {...arrow("cc")}
          canDownload={complaints.length > 0}
          onDownload={() => download("Chief complaints history", complaints.map((g) => ({ heading: g.date, lines: g.items.map((text) => ({ text })) })))}
        />
        {open("cc") && rxState(complaints, "chief complaints history")}
      </section>

      <section style={section} aria-label="Diagnosis history">
        <SectionHeader
          title="Diagnosis history"
          {...arrow("dx")}
          canDownload={diagnoses.length > 0}
          onDownload={() => download("Diagnosis history", diagnoses.map((g) => ({ heading: g.date, lines: g.items.map((text) => ({ text })) })))}
        />
        {open("dx") && rxState(diagnoses, "diagnosis history")}
      </section>
    </div>
  );
}
