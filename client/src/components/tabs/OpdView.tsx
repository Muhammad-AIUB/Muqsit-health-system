"use client";

import { useRef, useState } from "react";
import { C, colorOf, font } from "@/theme";
import { btnDisabled, btnPrimary, btnSecondary, inputMd, pageTitle } from "@/theme/styles";
import { useMuqsit } from "@/context/MuqsitContext";
import type { Patient } from "@/lib/api";
import {
  useAddOpdVisit, useMoveOpdVisit, useOpdQueue, useOpdSchedule, useSaveOpdSchedule, useSetOpdStatus,
} from "@/hooks/useOpd";
import { displayAge } from "@/lib/age";
import { dayLabel, dayRelation, dhakaToday } from "@/lib/opdDay";
import { clockText, slotTimes } from "@/lib/opdSchedule";
import { normaliseSex, sexLabel } from "@/lib/sex";
import Pill from "@/components/common/Pill";
import Icon from "@/components/common/Icon";
import PatientMobileLookup from "@/components/prescription/PatientMobileLookup";
import OpdDayPicker from "@/components/opd/OpdDayPicker";
import OpdScheduleBar from "@/components/opd/OpdScheduleBar";
import EmptyState from "@/components/common/EmptyState";
import { Loading, LoadError } from "@/components/common/ListState";

const typeColor = (type: string) => (type === "Urgent" ? "danger" : type === "Follow-up" ? "pri" : "warn");
const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const PAST_HINT = "A day that has passed cannot be changed";
const REL_WORD = { past: "Locked", today: "Today", future: "Upcoming" } as const;

export default function OpdView() {
  const { setPtName, setPtAge, setPtGender, setPtPhone, setActiveTab, setRxItems, setCurrentPatientId, setPtInfo, resetEditor, flushEditorDraft, loadPatientById } = useMuqsit();

  // The day on show (yyyy-mm-dd, Dhaka). The queue is booked by day (physician's
  // sheet, 28/10/2026): today is worked as it always was, a LATER day can have
  // patients added and put in order, and a day that has PASSED is shown as it was
  // and cannot be changed — the server refuses it too. `today` is read at every
  // render, so a screen left open past midnight locks yesterday by itself.
  const today = dhakaToday();
  const [day, setDay] = useState(today);
  const [picking, setPicking] = useState(false);
  const rel = dayRelation(day, today);
  const canEdit = rel !== "past";

  const { data: queue = [], isLoading, error, refetch, isFetching } = useOpdQueue(day);
  const scheduleQuery = useOpdSchedule(day);
  const addVisit = useAddOpdVisit();
  const setStatus = useSetOpdStatus();
  const move = useMoveOpdVisit(day);
  const saveSchedule = useSaveOpdSchedule();

  // Add-to-queue form. It asks for the mobile number and nothing else
  // (physician's sheet, 15/10/2026: "Add patient a sudhu number dia suru
  // korbe"): a patient saved on the number is chosen from the list, and "Add
  // New" opens the same new-patient box the prescription header uses. Whoever
  // is chosen or created joins the queue at once, tied to their record — the
  // name / age / sex / visit-type boxes and their Add button were crossed out.
  const [showAdd, setShowAdd] = useState(false);
  const [phone, setPhone] = useState("");
  const [addError, setAddError] = useState("");

  const waiting = queue.filter((v) => v.status === "waiting").length;
  const done = queue.filter((v) => v.status === "done").length;

  // ⚕️ The time each patient is told comes from the day's SAVED schedule — never
  // from the boxes in the bar, which hold what is typed until the server has it.
  // A day that has passed with no schedule of its own was never told a time, and
  // shows none rather than one worked out from another day's.
  const schedule = scheduleQuery.data;
  const times = schedule && (canEdit || schedule.saved) ? slotTimes(queue.length, schedule) : [];

  // Whether anyone still WAITING stands above / below a row: a patient already
  // seen keeps their place, so only waiting patients are moved past each other.
  const waitingAbove = (i: number) => queue.slice(0, i).some((v) => v.status === "waiting");
  const waitingBelow = (i: number) => queue.slice(i + 1).some((v) => v.status === "waiting");

  const choose = (picked: string) => {
    setDay(picked);
    setPicking(false);
    // A form left open for one day must not add to another.
    setShowAdd(false);
    setAddError("");
  };

  // ⚕️ One add at a time (independent review, 17/10/2026): a pick goes straight
  // to the queue and the server gives a new token each time, so a second pick
  // while the first is on its way put one patient on the queue twice. A ref,
  // not `isPending`: two picks can land in one render, before it changes.
  const adding = useRef(false);
  const addToQueue = async (p: Patient) => {
    if (adding.current) return;
    adding.current = true;
    try { await addOnce(p); } finally { adding.current = false; }
  };
  const addOnce = async (p: Patient) => {
    setAddError("");
    const age = displayAge(p);
    try {
      await addVisit.mutateAsync({
        name: p.name,
        patientId: p.id,
        phone: p.mobile || phone || undefined,
        // Only a whole number of years is an age the queue row can hold.
        age: /^\d+$/.test(age) ? Number(age) : undefined,
        // Omit rather than store "" — an unrecorded sex stays unrecorded.
        gender: normaliseSex(p.sex) || undefined,
        // The day on show: a patient is added to the day the doctor is looking at.
        date: day,
      });
    } catch {
      // The number stays in the box: choosing the patient again retries.
      setAddError(`Could not add ${p.name} to the queue. Choose them again to retry.`);
      return;
    }
    setPhone("");
    setShowAdd(false);
  };

  const emptyHint =
    rel === "past" ? "No one was queued on this day."
      : rel === "future" ? "Add the first patient of this day with “+ Add to queue”."
        : "Add the first patient of the day with “+ Add to queue”.";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={pageTitle}>OPD queue management</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* The date IS the calendar's button (physician's sheet, 28/10/2026). */}
          <button
            type="button"
            aria-label={`Date: ${dayLabel(day)} — choose another date`}
            aria-haspopup="dialog"
            onClick={() => setPicking(true)}
            style={{ ...btnSecondary("md"), display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}
          >
            <Icon name="calendar" size={16} />
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{dayLabel(day)}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: rel === "past" ? C.n[600] : rel === "today" ? C.ok[600] : C.pri[600] }}>{REL_WORD[rel]}</span>
          </button>
          <button
            onClick={() => setShowAdd((s) => !s)}
            disabled={!canEdit}
            title={canEdit ? undefined : PAST_HINT}
            style={canEdit ? btnPrimary("md") : { ...btnPrimary("md"), ...btnDisabled }}
          >
            {showAdd && canEdit ? "Close" : "+ Add to queue"}
          </button>
        </div>
      </div>

      {picking && <OpdDayPicker value={day} today={today} onPick={choose} onClose={() => setPicking(false)} />}

      {scheduleQuery.isLoading && <Loading label="Loading schedule…" />}
      {Boolean(scheduleQuery.error) && (
        <LoadError compact title="Could not load this day's schedule." onRetry={() => scheduleQuery.refetch()} retrying={scheduleQuery.isFetching} />
      )}
      {schedule && (
        <OpdScheduleBar day={day} today={today} schedule={schedule} onSave={(input) => saveSchedule.mutateAsync(input)} />
      )}

      {/* Every box keeps its caption above it. They used to be named only by a
          placeholder, which is gone the moment something is typed. */}
      {showAdd && canEdit && (
        <div className="form-row" style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: 14, marginBottom: 14, display: "flex", gap: 10, rowGap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
          <PatientMobileLookup
            value={phone}
            onChange={(d) => { setPhone(d); setAddError(""); }}
            onPick={(p) => { void addToQueue(p); }}
            label="Mobile"
            placeholder="01XXXXXXXXX"
            wrapStyle={{ flex: "0 1 220px", minWidth: 0 }}
            inputStyle={{ ...inputMd, width: "100%", boxSizing: "border-box" }}
          />
          <div style={{ flex: "1 1 220px", minWidth: 0, alignSelf: "flex-end", fontSize: 12, color: C.n[600], paddingBottom: 9 }}>
            {addVisit.isPending
              ? "Adding to the queue…"
              : "Type the patient's 11-digit mobile number, then choose them — or Add New."}
          </div>
          {addError && <div role="alert" style={{ flex: "1 1 100%", fontSize: 12, color: C.danger[800] }}>{addError}</div>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 10, marginBottom: 16 }}>
        <div style={{ background: C.n[100], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, fontWeight: 500, color: C.n[600] }}>{rel === "today" ? "Total today" : "Total"}</div><div style={{ fontSize: 24, fontWeight: 600 }}>{queue.length}</div></div>
        <div style={{ background: C.ok[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, fontWeight: 500, color: C.ok[600] }}>Completed</div><div style={{ fontSize: 24, fontWeight: 600, color: C.ok[600] }}>{done}</div></div>
        <div style={{ background: C.warn[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, fontWeight: 500, color: C.warn[800] }}>Waiting</div><div style={{ fontSize: 24, fontWeight: 600, color: C.warn[800] }}>{waiting}</div></div>
      </div>

      {move.isError && (
        <div role="alert" style={{ marginBottom: 8, fontSize: 12, color: C.danger[800] }}>
          Could not change the order. Try again.
        </div>
      )}

      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "4px 14px" }}>
        {isLoading && <Loading label="Loading queue…" />}
        {/* Rows already on screen stay there when a refresh fails — they may be out
            of date, so the notice sits above them, smaller. */}
        {Boolean(error) && <LoadError compact={queue.length > 0} title="Could not load the OPD queue." onRetry={() => refetch()} retrying={isFetching} />}
        {!isLoading && !error && queue.length === 0 && (
          <EmptyState icon="users" title="No one is in the queue" hint={emptyHint} />
        )}
        {queue.map((p, i) => {
          const color = typeColor(p.type);
          const time = times[i];
          return (
            // On a phone the row wraps, and `.row-after` (globals.css) sends the
            // visit pill and the actions to the second line — so the token is
            // always at the end of the first, beside the name it belongs to.
            <div key={p.id} className="queue-row" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, rowGap: 8, padding: "10px 0", borderBottom: i < queue.length - 1 ? `0.5px solid ${C.n[200]}` : "none", opacity: p.status === "done" ? 0.55 : 1 }}>
              {/* Serial 1, 2, 3 … in the order shown (physician's request,
                  18/10/2026). Not the token: T-01 is what the patient is called
                  by, and it is not renumbered when the queue changes. */}
              <span data-serial aria-label={`Serial ${i + 1}: ${p.name}`}
                style={{ minWidth: 22, textAlign: "right", fontSize: 13, fontWeight: 600, color: C.n[700], fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{i + 1}</span>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: colorOf(color).bg, color: colorOf(color).fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{initials(p.name)}</div>
              <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                {/* Normalised for display: the column holds both "Female" and "F". */}
                <div style={{ fontSize: 11, color: C.n[600] }}>{p.phone ?? "—"} · {p.age ?? "—"}y/{sexLabel(p.gender)}</div>
              </div>
              {time !== undefined && (
                <span data-time aria-label={`Time ${clockText(time)}`} style={{ fontSize: 12, fontWeight: 600, color: C.n[800], fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{clockText(time)}</span>
              )}
              {p.rxStatus === "incomplete" ? (
                <Pill className="row-after" bg={C.warn[50]} fg={C.warn[800]}>Incomplete</Pill>
              ) : p.rxStatus === "complete" ? (
                <Pill className="row-after" bg={C.ok[50]} fg={C.ok[600]}>Complete</Pill>
              ) : p.type && p.type !== "New" && p.type !== "Rx" ? (
                <Pill className="row-after" bg={colorOf(color).bg} fg={colorOf(color).fg}>{p.type}</Pill>
              ) : null}
              <Pill bg={C.n[100]} fg={C.n[800]}>{p.token}</Pill>
              {/* ▲ ▼ put a patient before or after the next one still waiting. A
                  day that has passed, and a patient already seen, have none. */}
              {canEdit && p.status === "waiting" && (
                <span className="row-after" style={{ display: "inline-flex", gap: 4 }}>
                  <button type="button" aria-label={`Move ${p.name} up`} disabled={!waitingAbove(i) || move.isPending}
                    onClick={() => move.mutate({ id: p.id, direction: "up" })}
                    style={{ ...btnSecondary("sm"), ...(!waitingAbove(i) || move.isPending ? btnDisabled : null) }}>▲</button>
                  <button type="button" aria-label={`Move ${p.name} down`} disabled={!waitingBelow(i) || move.isPending}
                    onClick={() => move.mutate({ id: p.id, direction: "down" })}
                    style={{ ...btnSecondary("sm"), ...(!waitingBelow(i) || move.isPending ? btnDisabled : null) }}>▼</button>
                </span>
              )}
              {p.status === "waiting" ? (
                rel === "today" ? (
                  <>
                    <button
                      className="row-after"
                      onClick={() => {
                        // A saved patient → full load (restores any incomplete Rx);
                        // otherwise pre-fill the editor from the queue snapshot.
                        if (p.patientId) {
                          void loadPatientById(p.patientId);
                        } else {
                          flushEditorDraft(); // the last patient's latest edits are parked first
                          resetEditor();
                          // The queue row holds either "Male"/"Female" (written by
                          // MuqsitContext from the editor) or "M"/"F" (written by
                          // PatientsView). Testing `=== "F"` read a woman stored as
                          // "Female" as Male and loaded that into the editor.
                          const sex = normaliseSex(p.gender);
                          const age = p.age != null ? String(p.age) : "";
                          setPtName(p.name);
                          setPtAge(age);
                          setPtGender(sex);
                          if (p.phone) setPtPhone(p.phone);
                          setCurrentPatientId(p.patientId);
                          setPtInfo({
                            name: p.name, hospitalId: "", bloodGroup: "", dob: "", age, sex,
                            ethnicity: "", religion: "", mobile: p.phone ?? "", nid: "",
                            spouseMobile: "", relativeMobile: "", relativeRelation: "",
                            district: "", fullAddress: "", monthlyIncome: "", picture: null, tags: [],
                          });
                          setRxItems([]);
                        }
                        setActiveTab("prescription");
                      }}
                      style={btnPrimary("sm")}
                    >
                      Prescribe
                    </button>
                    <button className="row-after" onClick={() => setStatus.mutate({ id: p.id, status: "done" })} style={btnSecondary("sm")}>
                      Done
                    </button>
                  </>
                ) : rel === "past" ? (
                  <Pill className="row-after" bg={C.n[100]} fg={C.n[700]}>Not marked seen</Pill>
                ) : null
              ) : (
                <Pill className="row-after" bg={C.ok[50]} fg={C.ok[600]}>✓ done</Pill>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
