"use client";

import { useRef, useState } from "react";
import { C, colorOf, font } from "@/theme";
import { btnPrimary, btnSecondary, inputMd, pageTitle } from "@/theme/styles";
import { useMuqsit } from "@/context/MuqsitContext";
import type { Patient } from "@/lib/api";
import { useAddOpdVisit, useOpdQueue, useSetOpdStatus } from "@/hooks/useOpd";
import { displayAge } from "@/lib/age";
import { normaliseSex, sexLabel } from "@/lib/sex";
import Pill from "@/components/common/Pill";
import PatientMobileLookup from "@/components/prescription/PatientMobileLookup";
import EmptyState from "@/components/common/EmptyState";
import { Loading, LoadError } from "@/components/common/ListState";

const typeColor = (type: string) => (type === "Urgent" ? "danger" : type === "Follow-up" ? "pri" : "warn");
const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export default function OpdView() {
  const { setPtName, setPtAge, setPtGender, setPtPhone, setActiveTab, setRxItems, setCurrentPatientId, setPtInfo, resetEditor, loadPatientById } = useMuqsit();
  const { data: queue = [], isLoading, error, refetch, isFetching } = useOpdQueue();
  const addVisit = useAddOpdVisit();
  const setStatus = useSetOpdStatus();

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
      });
    } catch {
      // The number stays in the box: choosing the patient again retries.
      setAddError(`Could not add ${p.name} to the queue. Choose them again to retry.`);
      return;
    }
    setPhone("");
    setShowAdd(false);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={pageTitle}>OPD queue management</div>
        <button onClick={() => setShowAdd((s) => !s)} style={btnPrimary("md")}>
          {showAdd ? "Close" : "+ Add to queue"}
        </button>
      </div>

      {/* Every box keeps its caption above it. They used to be named only by a
          placeholder, which is gone the moment something is typed. */}
      {showAdd && (
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
        <div style={{ background: C.n[100], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, fontWeight: 500, color: C.n[600] }}>Total today</div><div style={{ fontSize: 24, fontWeight: 600 }}>{queue.length}</div></div>
        <div style={{ background: C.ok[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, fontWeight: 500, color: C.ok[600] }}>Completed</div><div style={{ fontSize: 24, fontWeight: 600, color: C.ok[600] }}>{done}</div></div>
        <div style={{ background: C.warn[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, fontWeight: 500, color: C.warn[800] }}>Waiting</div><div style={{ fontSize: 24, fontWeight: 600, color: C.warn[800] }}>{waiting}</div></div>
      </div>

      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "4px 14px" }}>
        {isLoading && <Loading label="Loading queue…" />}
        {/* Rows already on screen stay there when a refresh fails — they may be out
            of date, so the notice sits above them, smaller. */}
        {Boolean(error) && <LoadError compact={queue.length > 0} title="Could not load the OPD queue." onRetry={() => refetch()} retrying={isFetching} />}
        {!isLoading && !error && queue.length === 0 && (
          <EmptyState icon="users" title="No one is in the queue" hint="Add the first patient of the day with “+ Add to queue”." />
        )}
        {queue.map((p, i) => {
          const color = typeColor(p.type);
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
              {p.rxStatus === "incomplete" ? (
                <Pill className="row-after" bg={C.warn[50]} fg={C.warn[800]}>Incomplete</Pill>
              ) : p.rxStatus === "complete" ? (
                <Pill className="row-after" bg={C.ok[50]} fg={C.ok[600]}>Complete</Pill>
              ) : p.type && p.type !== "New" && p.type !== "Rx" ? (
                <Pill className="row-after" bg={colorOf(color).bg} fg={colorOf(color).fg}>{p.type}</Pill>
              ) : null}
              <Pill bg={C.n[100]} fg={C.n[800]}>{p.token}</Pill>
              {p.status === "waiting" ? (
                <>
                  <button
                    className="row-after"
                    onClick={() => {
                      // A saved patient → full load (restores any incomplete Rx);
                      // otherwise pre-fill the editor from the queue snapshot.
                      if (p.patientId) {
                        void loadPatientById(p.patientId);
                      } else {
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
