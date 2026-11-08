"use client";

// "Total summary of this patient" (physician's sheet 07/11/2026): the dated
// records of the Records page in one list — date by date, and inside a date in
// the sheet's order (`lib/totalSummary.ts`). Read-only.
//
// ⚕️ Premium accounts only. Everyone else SEES the page blurred and cannot press
// anything on it: a locked view, not a hidden one. (The data is the doctor's own
// and every other section above already shows it; the gate is the feature.)

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { C, font } from "@/theme";
import { btnDisabled, btnPrimary, btnClose, dialogTitle, scrim, shadowCard, shadowDialog } from "@/theme/styles";
import { useAuth } from "@/context/AuthContext";
import { useMuqsit } from "@/context/MuqsitContext";
import { prescriptionsApi } from "@/lib/api";
import { isoToDdmmyyyy } from "@/lib/dateInput";
import { useDialog } from "@/lib/useDialog";
import { diseaseSurgicalHistory, drugHistoryByDate, perVisit } from "@/lib/patientRecords";
import { mergeFindings, parseInvestigationEntries } from "@/lib/investigationSummary";
import { isRemovedOe } from "@/lib/onExaminationSummary";
import { buildRecordsDoc, type DocGroup } from "@/lib/recordsDoc";
import { buildTotalSummary, SUMMARY_KINDS, type SummaryDay, type SummaryKind } from "@/lib/totalSummary";
import DateField from "@/components/common/DateField";
import Icon from "@/components/common/Icon";
import { openRecordsDoc, printedToday, useRecordsPatient } from "./RecordsHistorySections";

export const isPremium = (tier?: string | null) => tier === "premium";

const ALL_KINDS = SUMMARY_KINDS.map((k) => k.key);
const isoToMs = (iso: string) => (iso ? new Date(iso + "T00:00:00").getTime() : null);

/** The summary as the printable page's groups: one group per date, a heading
 *  line per kind, its lines indented under it. */
export function summaryDocGroups(days: SummaryDay[]): DocGroup[] {
  return days.map((d) => ({
    heading: d.date,
    lines: d.blocks.flatMap((b) => [
      { text: `${b.label}:` },
      ...b.lines.map((l) => ({ text: l.text, indent: true, muted: l.muted })),
    ]),
  }));
}

export default function TotalSummary({ open }: { open: boolean }) {
  const { user } = useAuth();
  const premium = isPremium(user?.accountTier);
  const {
    currentPatientId, ptDate, ptName, drugHistory, onExaminationSummary, investigation, investigationSummary,
  } = useMuqsit();
  const patient = useRecordsPatient();
  const [kind, setKind] = useState<"all" | SummaryKind>("all");
  const [newestFirst, setNewestFirst] = useState(true);
  const [showDownload, setShowDownload] = useState(false);

  // The same query as the Chief complaints / Diagnosis sections, so one fetch.
  const rxQuery = useQuery({
    queryKey: ["prescriptions", currentPatientId],
    queryFn: () => prescriptionsApi.listByPatient(currentPatientId as string),
    enabled: Boolean(currentPatientId) && open,
  });
  const rxList = Array.isArray(rxQuery.data) ? rxQuery.data : undefined;
  const visitDate = isoToDdmmyyyy(ptDate);

  const sources = useMemo(() => ({
    complaints: perVisit(rxList, "chiefComplaints"),
    diagnoses: perVisit(rxList, "finalDiagnosis"),
    hx: diseaseSurgicalHistory(onExaminationSummary ?? []),
    oe: (onExaminationSummary ?? []).filter((f) => !isRemovedOe(f)),
    inv: mergeFindings(investigationSummary ?? [], parseInvestigationEntries(investigation)),
    drug: drugHistoryByDate(drugHistory ?? [], visitDate),
  }), [rxList, onExaminationSummary, investigationSummary, investigation, drugHistory, visitDate]);

  const days = useMemo(
    () => buildTotalSummary(sources, { kinds: kind === "all" ? undefined : new Set([kind]), newestFirst }),
    [sources, kind, newestFirst],
  );
  const allDays = useMemo(() => buildTotalSummary(sources, { newestFirst }), [sources, newestFirst]);

  if (!open) return null;

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "5px 12px", borderRadius: 999, fontSize: 12, cursor: premium ? "pointer" : "default", fontFamily: font,
    border: `1px solid ${active ? C.pri[400] : C.n[200]}`, background: active ? C.pri[50] : C.n[0],
    color: active ? C.pri[600] : C.n[700], fontWeight: active ? 600 : 400,
  });

  const body = (
    <div>
      <div role="group" aria-label="Show" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
        <button type="button" disabled={!premium} aria-pressed={kind === "all"} onClick={() => setKind("all")} style={chip(kind === "all")}>All</button>
        {SUMMARY_KINDS.map((k) => (
          <button key={k.key} type="button" disabled={!premium} aria-pressed={kind === k.key} onClick={() => setKind(k.key)} style={chip(kind === k.key)}>{k.label}</button>
        ))}
        <button type="button" disabled={!premium} onClick={() => setNewestFirst((v) => !v)} style={{ ...chip(false), marginLeft: "auto" }} title="Order of the dates">
          {newestFirst ? "Newest first" : "Oldest first"}
        </button>
      </div>

      {!currentPatientId ? (
        <div style={{ fontSize: 13, color: C.n[500] }}>Load a saved patient to see their total summary.</div>
      ) : rxQuery.isError ? (
        <div style={{ fontSize: 13, color: C.danger[800] }}>Could not load the prescriptions. The summary below may be missing complaints and diagnoses.</div>
      ) : null}
      {currentPatientId && days.length === 0 ? (
        <div style={{ fontSize: 13, color: C.n[500] }}>{rxList ? "Nothing recorded for this selection yet." : "Loading…"}</div>
      ) : (
        <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 10, background: C.n[0], padding: "14px 18px", maxHeight: 520, overflowY: "auto" }}>
          {days.map((d, di) => (
            <div key={d.date} style={{ marginBottom: di < days.length - 1 ? 14 : 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.pri[600], borderBottom: `1px solid ${C.pri[100]}`, paddingBottom: 2, marginBottom: 5 }}>{d.date}</div>
              {d.blocks.map((b) => (
                <div key={b.kind} style={{ fontSize: 13, color: C.n[800], lineHeight: 1.6, marginBottom: 4 }}>
                  <b style={{ fontWeight: 600, color: C.n[900] }}>{b.label}:</b>
                  <div style={{ paddingLeft: 16 }}>
                    {b.lines.map((l, i) => (
                      <div key={i} style={{ overflowWrap: "anywhere", paddingLeft: l.indent ? 14 : 0, color: l.muted ? C.n[500] : undefined, fontStyle: l.muted ? "italic" : undefined }}>{l.text}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button
          onClick={() => setShowDownload(true)}
          disabled={!premium || allDays.length === 0}
          aria-label="Download Total summary"
          style={{ ...btnPrimary("sm"), ...(premium && allDays.length ? null : btnDisabled) }}
        ><Icon name="download" size={14} /> Download</button>
      </div>

      {premium ? body : (
        <div style={{ position: "relative" }}>
          {/* Seen, not usable: blurred, not selectable, its buttons disabled (so out of the keyboard's way) and hidden from a screen reader. */}
          <div aria-hidden style={{ filter: "blur(6px)", userSelect: "none", pointerEvents: "none" }}>{body}</div>
          <div role="note" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: C.n[0], border: `1px solid ${C.n[200]}`, borderRadius: 12, padding: "12px 18px", fontSize: 13, color: C.n[800], boxShadow: shadowCard, textAlign: "center", maxWidth: 360 }}>
              <Icon name="lock" size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              The total summary is for <b>premium</b> accounts.
            </div>
          </div>
        </div>
      )}

      {showDownload && premium && (
        <SummaryDownload
          sources={sources}
          newestFirst={newestFirst}
          onClose={() => setShowDownload(false)}
          onDownload={(groups) => openRecordsDoc(buildRecordsDoc({ title: `Total summary — ${ptName || "Patient"}`, printed: printedToday(), patient, groups }))}
        />
      )}
    </div>
  );
}

// "Download investigation summary" (the sheet's picture): a date window, then
// what to put in. Opens the printable page, as the other Downloads do.
function SummaryDownload({ sources, newestFirst, onClose, onDownload }: {
  sources: Parameters<typeof buildTotalSummary>[0];
  newestFirst: boolean;
  onClose: () => void;
  onDownload: (groups: DocGroup[]) => void;
}) {
  const dialog = useDialog(true, onClose);
  const [dateMode, setDateMode] = useState<"all" | "6m" | "12m" | "custom">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [picked, setPicked] = useState<Set<SummaryKind>>(new Set(ALL_KINDS));

  const window_ = useMemo(() => {
    const now = new Date();
    if (dateMode === "6m") return { fromMs: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()).getTime(), toMs: null };
    if (dateMode === "12m") return { fromMs: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).getTime(), toMs: null };
    if (dateMode === "custom") { const t = isoToMs(to); return { fromMs: isoToMs(from), toMs: t == null ? null : t + 86400000 - 1 }; }
    return { fromMs: null, toMs: null };
  }, [dateMode, from, to]);
  const days = useMemo(
    () => buildTotalSummary(sources, { kinds: picked, newestFirst, ...window_ }),
    [sources, picked, newestFirst, window_],
  );
  const toggle = (k: SummaryKind) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const seg = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: font,
    border: `1px solid ${active ? C.pri[400] : C.n[200]}`, background: active ? C.pri[50] : C.n[0],
    color: active ? C.pri[600] : C.n[700], fontWeight: active ? 600 : 400,
  });
  const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 };
  const inp: React.CSSProperties = { padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.n[300]}`, fontSize: 12, outline: "none", fontFamily: font };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: scrim, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500, fontFamily: font, padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Download total summary" {...dialog} style={{ background: C.n[0], borderRadius: 14, padding: 22, width: 480, maxWidth: "100%", maxHeight: "100%", overflowY: "auto", boxShadow: shadowDialog }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={dialogTitle}>Download total summary</div>
          <button aria-label="Close" onClick={onClose} style={btnClose}>×</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={lbl}>By date</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setDateMode("all")} style={seg(dateMode === "all")}>All dates</button>
            <button onClick={() => setDateMode("6m")} style={seg(dateMode === "6m")}>Last 6 months</button>
            <button onClick={() => setDateMode("12m")} style={seg(dateMode === "12m")}>Last 12 months</button>
            <button onClick={() => setDateMode("custom")} style={seg(dateMode === "custom")}>Select dates</button>
          </div>
          {dateMode === "custom" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, rowGap: 8, alignItems: "center", marginTop: 10 }}>
              <label style={{ fontSize: 12, color: C.n[600], display: "flex", alignItems: "center", gap: 6 }}>
                From <div style={{ width: 130 }}><DateField value={from} onChange={setFrom} allowEmpty style={inp} /></div>
              </label>
              <label style={{ fontSize: 12, color: C.n[600], display: "flex", alignItems: "center", gap: 6 }}>
                To <div style={{ width: 130 }}><DateField value={to} onChange={setTo} allowEmpty style={inp} /></div>
              </label>
            </div>
          )}
        </div>

        <fieldset style={{ border: "none", padding: 0, margin: "0 0 14px" }}>
          <legend style={lbl}>Select what you will download</legend>
          {SUMMARY_KINDS.map((k) => (
            <label key={k.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.n[800], padding: "3px 0", cursor: "pointer" }}>
              <input type="checkbox" checked={picked.has(k.key)} onChange={() => toggle(k.key)} /> {k.label}
            </label>
          ))}
        </fieldset>

        <div style={{ fontSize: 12, color: C.n[500], marginBottom: 14 }}>{days.length} date{days.length === 1 ? "" : "s"} in selection.</div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => onDownload(summaryDocGroups(days))} disabled={!days.length} style={{ ...btnPrimary("md"), fontWeight: 600, ...(days.length ? null : btnDisabled) }}>
            <Icon name="fileText" size={15} /> Download
          </button>
        </div>
      </div>
    </div>
  );
}
