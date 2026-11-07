"use client";

// ⚕️ The patient's Drug history as a table of courses (physician's sheet,
// 07/11/2026): Drug name · Dose · Duration · Start date · End date · Total
// number, Current medication first and the rest by generic or by start date,
// with an Edit that puts a start date or a duration right and an Add that
// records a new medicine with its start date. Part of "Patient's Prescriptions
// & reports" (`RecordsHistorySections`); what is read and worked out is
// `lib/drugCourse.ts`, what is written is the server's `PATCH` / `POST
// /patients/:id/drug-history` through the store.
//
// Rules this component keeps:
//   • Nothing is shown as recorded before the server has it. A row being edited
//     keeps what was typed in its boxes until the answer comes; End and Total
//     beside it are a preview, marked as not saved.
//   • A blank End / Total is a blank, never a guess (`drugCourse`).
//   • The name is the generic with the brand as stored beside it, where the
//     medicine chart gives exactly one generic; otherwise the entry as stored,
//     with the same quiet note as everywhere else (`DrugHistoryName`).
//   • A line on today's ℞ is the pad's to change, not this table's: the ℞ mirror
//     owns it, and a second copy written here would be written again by it.
//   • Only what a doctor may write is offered: no Edit / Add for a supervising
//     doctor (the owner's record) or an assistant without the key.

import { useEffect, useMemo, useState } from "react";
import { C, font } from "@/theme";
import { btnPrimary, btnSecondary, inputSm } from "@/theme/styles";
import { confirmAction } from "@/lib/dialogs";
import { isoToDdmmyyyy } from "@/lib/dateInput";
import { parseDuration } from "@/lib/rxShorthand";
import {
  NO_DATE_MARKER, collapseContinuing, coursesOf, formatTotal, isCurrentCourse, rewriteCourse, sortCourses,
  type Course, type CourseSort,
} from "@/lib/drugCourse";
import { GENERIC_NOT_FOUND, GENERIC_SEVERAL } from "@/lib/drugHistoryGeneric";
import type { DrugHistoryGenerics } from "@/hooks/useDrugHistoryGenerics";
import type { DrugHistoryAddInput } from "@/lib/drugHistoryAdd";
import DateField from "@/components/common/DateField";
import type { DocGroup, DocTableRow } from "@/lib/recordsDoc";
import Icon from "@/components/common/Icon";
import AddMedicineRow from "./AddMedicineRow";

export interface DrugHistoryTableProps {
  /** The stored drug-history entries. */
  entries: string[];
  /** The visit's date, `dd/mm/yyyy` — what a legacy `Current:` line reads as. */
  visitDate: string;
  /** Today as `dd/mm/yyyy` and in milliseconds: Current is "ends today or later". */
  todayMs: number;
  /** The visit's own date as ISO — the Start date a medicine added here begins with. */
  newStartIso: string;
  generics: DrugHistoryGenerics;
  /** May the start date / durations be put right (the owner's practice, with the drug-history key)? */
  canEdit: boolean;
  /** May a medicine be added (the owner's practice, with the ℞ pad's key)? */
  canAdd: boolean;
  /** Entries the ℞ pad owns today (`rxDrugHistoryEntries`): their rows are the pad's to change. */
  padLines: ReadonlySet<string>;
  /** Writes one changed block. True: it is on the record. False: it has said why. */
  onSave: (from: string[], to: string[]) => Promise<boolean>;
  /** Adds the lines of one press. False: they were not taken. */
  onAdd: (entries: string[]) => boolean;
  /** Called once a change is on the record, with a sentence for the activity feed. */
  onSaved?: (note: string) => void;
  /** Download: the table as shown (same order, same bands, same columns) as printable groups. */
  onDownload?: (groups: DocGroup[]) => void;
  /** Puts the sort and the Edit / Done buttons into the section header. */
  renderActions: (actions: React.ReactNode) => React.ReactNode;
}

interface Draft { startIso: string; durations: string[] }

const toIso = (d: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
const draftOf = (c: Course): Draft => ({
  startIso: c.hasDate ? toIso(c.date) : "",
  durations: [c.head.duration, ...c.tapers.map((t) => t.duration)],
});
const sameDraft = (a: Draft, b: Draft): boolean =>
  a.startIso === b.startIso && a.durations.length === b.durations.length && a.durations.every((d, i) => d.trim() === b.durations[i].trim());

const th: React.CSSProperties = { textAlign: "left", fontSize: 11.5, fontWeight: 600, color: C.n[600], padding: "6px 10px", borderBottom: `1px solid ${C.n[200]}`, whiteSpace: "nowrap" };
const td: React.CSSProperties = { fontSize: 13, color: C.n[800], padding: "7px 10px", verticalAlign: "top", borderBottom: `0.5px solid ${C.n[100]}`, lineHeight: 1.5 };
const band: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: C.n[600], padding: "10px 10px 4px", textTransform: "none" };
const muted: React.CSSProperties = { color: C.n[500], fontSize: 12 };

export default function DrugHistoryTable(p: DrugHistoryTableProps) {
  const [sort, setSort] = useState<CourseSort>("date");
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [problem, setProblem] = useState<Record<string, string>>({});
  const [addIso, setAddIso] = useState(p.newStartIso);

  const courses = useMemo(
    () => collapseContinuing(coursesOf(p.entries, p.visitDate, p.todayMs)),
    [p.entries, p.visitDate, p.todayMs],
  );
  const genericOf = (label: string): string | null => {
    const a = p.generics.answer(label);
    return a?.kind === "generic" ? a.generic : null;
  };
  const sorted = useMemo(
    () => sortCourses(courses, sort, p.todayMs, genericOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courses, sort, p.todayMs, p.generics.state, p.generics.answer],
  );
  const dirty = useMemo(
    () => sorted.filter((c) => drafts[c.key] && !sameDraft(drafts[c.key], draftOf(c))).map((c) => c.key),
    [sorted, drafts],
  );

  // A block that changed under its boxes (another screen's write, a reload of the
  // list) is no longer the one they were typed for: its draft is dropped. (A
  // different PATIENT's list never meets this one's boxes — the parent keys this
  // table by the patient, since the view stays mounted while the header lookup
  // opens another.)
  useEffect(() => {
    setDrafts((d) => {
      const live = new Set(courses.map((c) => c.key));
      const keep: Record<string, Draft> = {};
      for (const k of Object.keys(d)) if (live.has(k)) keep[k] = d[k];
      return Object.keys(keep).length === Object.keys(d).length ? d : keep;
    });
  }, [courses]);

  const isLocked = (c: Course) => c.lines.some((l) => p.padLines.has(l)) || (c.extraLines ?? []).some((l) => p.padLines.has(l));

  const startEdit = () => { setEditing(true); setProblem({}); };
  const stopEdit = async () => {
    if (dirty.length) {
      const ok = await confirmAction({
        title: `Discard the changes to ${dirty.length === 1 ? "1 medicine" : `${dirty.length} medicines`} that are not saved?`,
        body: "They have not been written to the record.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        danger: true,
      });
      if (!ok) return;
    }
    setEditing(false);
    setDrafts({});
    setProblem({});
  };

  const setDraft = (c: Course, f: (d: Draft) => Draft) =>
    setDrafts((all) => ({ ...all, [c.key]: f(all[c.key] ?? draftOf(c)) }));

  const save = async (c: Course) => {
    const d = drafts[c.key] ?? draftOf(c);
    const start = d.startIso ? isoToDdmmyyyy(d.startIso) : c.date;
    const to = rewriteCourse(c, { start, durations: d.durations });
    if (!to) { setProblem((x) => ({ ...x, [c.key]: "Check the start date and the durations." })); return; }
    setProblem((x) => { const n = { ...x }; delete n[c.key]; return n; });
    setSaving(c.key);
    try {
      const ok = await p.onSave(c.lines, to);
      if (ok) {
        setDrafts((all) => { const n = { ...all }; delete n[c.key]; return n; });
        const was = `${c.date === NO_DATE_MARKER ? "no date" : c.date}, ${c.head.duration || "no duration"}`;
        p.onSaved?.(`Changed “${c.label}”: start ${start}, duration ${d.durations[0].trim() || "—"} (was ${was})`);
      }
    } finally {
      setSaving(null);
    }
  };

  const labelOf = (c: Course) => {
    const a = p.generics.answer(c.label);
    if (a?.kind === "generic") return <>{a.generic} <span style={{ color: C.n[600] }}>({c.label})</span></>;
    const note = a?.kind === "none" ? GENERIC_NOT_FOUND : a?.kind === "several" ? GENERIC_SEVERAL : null;
    return (
      <>
        {c.label}
        {note ? <span data-generic-note style={{ marginLeft: 6, fontSize: 10.5, color: C.n[500] }}>({note})</span> : null}
      </>
    );
  };

  const shownDate = (c: Course) => (c.date === NO_DATE_MARKER ? "No date" : c.date);
  const cols = editing ? 7 : 6;
  const anyCurrent = sorted.some((c) => isCurrentCourse(c, p.todayMs));

  const sortButton = (mode: CourseSort, label: string) => (
    <button
      type="button"
      onClick={() => setSort(mode)}
      aria-pressed={sort === mode}
      style={{ ...btnSecondary("sm"), ...(sort === mode ? { background: C.pri[50], color: C.pri[600], borderColor: C.pri[400] } : null) }}
    >{label}</button>
  );

  // ⚕️ The printed page is the table as shown — by Date or by Generic alike:
  // Current medication first, then Earlier medication, the same six columns, the
  // tapering lines under their medicine (physician, 07/11/2026, item 2).
  const download = () => {
    const nameText = (c: Course) => {
      const a = p.generics.answer(c.label);
      return a?.kind === "generic" ? `${a.generic} (${c.label})` : c.label;
    };
    const head = ["Drug name", "Dose", "Duration", "Start date", "End date", "Total number"];
    const groups: DocGroup[] = [];
    const add = (heading: string, row: DocTableRow[]) => {
      const last = groups[groups.length - 1];
      if (last && last.heading === heading) last.table!.rows.push(...row);
      else groups.push({ heading, lines: [], table: { head, rows: row } });
    };
    for (const c of sorted) {
      const heading = anyCurrent ? (isCurrentCourse(c, p.todayMs) ? "Current medication" : "Earlier medication") : "Drug history";
      if (c.kind !== "med") {
        add(heading, [{ cells: [c.label, "", "", c.kind === "note" ? shownDate(c) : "", "", ""], muted: true }]);
        continue;
      }
      add(heading, [
        { cells: [nameText(c), c.head.dose || "—", c.head.duration || "—", shownDate(c), c.end ?? (c.open ? "Continue" : "—"), c.total !== null ? formatTotal(c.total) : "—"] },
        ...c.tapers.map((t) => ({ cells: ["then", t.dose || "—", t.duration || "—", "", "", ""], indent: true })),
      ]);
    }
    p.onDownload?.(groups);
  };

  const actions = (
    <>
      {courses.length > 1 && (
        <span role="group" aria-label="Sort drug history" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: C.n[600] }}>Sort by</span>
          {sortButton("generic", "Generic")}
          {sortButton("date", "Date")}
        </span>
      )}
      {p.onDownload && (
        <button
          type="button"
          onClick={download}
          disabled={courses.length === 0}
          aria-label="Download Drug history"
          style={{ ...btnSecondary("sm"), color: C.pri[600], ...(courses.length === 0 ? { opacity: 0.5, cursor: "default" } : null) }}
        ><Icon name="download" size={14} /> Download</button>
      )}
      {(p.canEdit || p.canAdd) && (
        editing
          ? <button type="button" onClick={() => void stopEdit()} style={btnSecondary("sm")}>Done</button>
          : <button type="button" onClick={startEdit} style={btnSecondary("sm")}>✎ Edit</button>
      )}
    </>
  );

  const existingForAdd = useMemo<DrugHistoryAddInput[]>(() => {
    const date = isoToDdmmyyyy(addIso);
    return courses
      .filter((c) => c.kind === "med" && c.date === date)
      .map((c) => ({ drug: c.label, dose: c.head.dose, food: c.head.food, duration: c.head.duration }));
  }, [courses, addIso]);

  const rowsOf = (c: Course) => {
    const d = drafts[c.key];
    const editable = editing && p.canEdit && c.editable && !isLocked(c);
    const draft = d ?? draftOf(c);
    const isDirty = dirty.includes(c.key);
    // What End and Total would be with the typed boxes — shown as a preview.
    let preview: Course | null = null;
    if (editable && isDirty) {
      const start = draft.startIso ? isoToDdmmyyyy(draft.startIso) : c.date;
      const lines = rewriteCourse(c, { start, durations: draft.durations });
      preview = lines ? coursesOf(lines, p.visitDate, p.todayMs)[0] ?? null : null;
    }
    const end = preview ?? c;
    const endText = end.end ?? (end.open ? "Continue" : "—");
    const totalText = end.total !== null ? formatTotal(end.total) : "—";
    const previewStyle: React.CSSProperties | undefined = preview ? { fontStyle: "italic", color: C.n[600] } : undefined;

    if (c.kind !== "med") {
      return (
        <tr key={c.key}>
          <td style={{ ...td, color: C.n[600], fontStyle: "italic", overflowWrap: "anywhere" }} colSpan={3}>{c.label}</td>
          <td style={td}>{c.kind === "note" ? shownDate(c) : ""}</td>
          <td style={td} />
          <td style={td} />
          {editing && <td style={td} />}
        </tr>
      );
    }

    const actionCell = !editing ? null : (
      <td style={{ ...td, whiteSpace: "nowrap" }} rowSpan={1 + c.tapers.length}>
        {editable ? (
          <span style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
            <span style={{ display: "inline-flex", gap: 6 }}>
              <button type="button" disabled={!isDirty || saving !== null} onClick={() => void save(c)} aria-label={`Save changes to ${c.label}`} style={{ ...btnPrimary("sm"), ...(!isDirty || saving !== null ? { opacity: 0.5, cursor: "default" } : null) }}>
                {saving === c.key ? "Saving…" : "Save"}
              </button>
              {isDirty && saving === null && (
                <button type="button" onClick={() => setDrafts((all) => { const n = { ...all }; delete n[c.key]; return n; })} aria-label={`Undo changes to ${c.label}`} style={btnSecondary("sm")}>Undo</button>
              )}
            </span>
            {isDirty && <span style={muted}>Not saved yet</span>}
            {problem[c.key] && <span role="alert" style={{ fontSize: 12, color: C.danger[800] }}>{problem[c.key]}</span>}
          </span>
        ) : isLocked(c) ? (
          <span style={muted}>On today&apos;s ℞ — change it on the pad</span>
        ) : (
          <span style={muted}>Cannot be changed here</span>
        )}
      </td>
    );

    const durationCell = (i: number, written: string) =>
      editable ? (
        <input
          value={draft.durations[i] ?? ""}
          onChange={(e) => setDraft(c, (x) => ({ ...x, durations: x.durations.map((v, k) => (k === i ? e.target.value : v)) }))}
          onBlur={(e) => { const v = parseDuration(e.target.value); if (v !== e.target.value) setDraft(c, (x) => ({ ...x, durations: x.durations.map((w, k) => (k === i ? v : w)) })); }}
          aria-label={`Duration of ${i === 0 ? c.label : `tapering line ${i} of ${c.label}`}`}
          disabled={saving === c.key}
          style={{ ...inputSm, width: 110, fontFamily: font }}
        />
      ) : (written || "—");

    return [
      <tr key={c.key}>
        <td style={{ ...td, fontWeight: 600, overflowWrap: "anywhere" }}>{labelOf(c)}</td>
        <td style={td}>{c.head.dose || "—"}</td>
        <td style={td}>{durationCell(0, c.head.duration)}</td>
        <td style={td} rowSpan={1 + c.tapers.length}>
          {editable ? (
            <DateField
              value={draft.startIso}
              onChange={(iso) => setDraft(c, (x) => ({ ...x, startIso: iso }))}
              allowEmpty={!c.hasDate}
              placeholder={c.hasDate ? "DD/MM/YYYY" : "No date"}
              disabled={saving === c.key}
              style={{ ...inputSm, width: 110 }}
            />
          ) : shownDate(c)}
        </td>
        <td style={{ ...td, ...previewStyle }} rowSpan={1 + c.tapers.length} title={preview ? "Not saved yet" : undefined}>{endText}</td>
        <td style={{ ...td, ...previewStyle }} rowSpan={1 + c.tapers.length} title={preview ? "Not saved yet" : undefined}>{totalText}</td>
        {actionCell}
      </tr>,
      ...c.tapers.map((t, i) => (
        <tr key={`${c.key}#${i + 1}`}>
          <td style={{ ...td, paddingLeft: 24, color: C.n[600] }}><span aria-hidden="true">↳ </span>then</td>
          <td style={td}>{t.dose || "—"}</td>
          <td style={td}>{durationCell(i + 1, t.duration)}</td>
        </tr>
      )),
    ];
  };

  // Where the Current band ends and the earlier ones begin.
  const body: React.ReactNode[] = [];
  let lastCurrent: boolean | null = null;
  for (const c of sorted) {
    const cur = isCurrentCourse(c, p.todayMs);
    if (anyCurrent && cur !== lastCurrent) {
      body.push(<tr key={`band-${cur ? "current" : "earlier"}`}><td colSpan={cols} style={band}>{cur ? "Current medication" : "Earlier medication"}</td></tr>);
    }
    lastCurrent = cur;
    body.push(rowsOf(c));
  }

  return (
    <>
      {p.renderActions(actions)}
      {courses.length === 0 && !editing && (
        <div style={{ fontSize: 13, color: C.n[500] }}>No drug history recorded for this patient.</div>
      )}
      {courses.length > 0 && (
        <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 10, background: C.n[0], padding: "6px 8px 10px", maxHeight: 520, overflow: "auto" }}>
          <table aria-label="Drug history" style={{ width: "100%", minWidth: editing ? 860 : 680, borderCollapse: "collapse", fontFamily: font }}>
            <thead>
              <tr>
                <th scope="col" style={th}>Drug name</th>
                <th scope="col" style={th}>Dose</th>
                <th scope="col" style={th}>Duration</th>
                <th scope="col" style={th}>Start date</th>
                <th scope="col" style={th}>End date</th>
                <th scope="col" style={th}>Total number</th>
                {editing && <th scope="col" style={th}><span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Actions</span></th>}
              </tr>
            </thead>
            <tbody>{body}</tbody>
          </table>
        </div>
      )}
      {editing && p.canAdd && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.n[700] }}>
            Start date of the medicine you add
            <DateField value={addIso} onChange={setAddIso} placeholder="DD/MM/YYYY" style={{ ...inputSm, width: 120 }} />
          </label>
          <AddMedicineRow existing={existingForAdd} tabLabel={`Drug history on ${isoToDdmmyyyy(addIso)}`} date={isoToDdmmyyyy(addIso)} onAdd={p.onAdd} />
        </div>
      )}
    </>
  );
}
