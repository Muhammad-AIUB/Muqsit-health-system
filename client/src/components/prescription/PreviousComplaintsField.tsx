"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { prescriptionsApi } from "@/lib/api";
import { decodePc, encodePc } from "@/lib/previousComplaints";

// Read-only complaints carried over from the patient's most recent past visit,
// each with an editable note the doctor writes on the right. The complaint text
// itself can't be changed — only the note. The complaint+note pairs are stored
// in the prescription's `previousComplaints` string list.
export default function PreviousComplaintsField({
  items,
  setItems,
}: {
  items: string[];
  setItems: (items: string[]) => void;
}) {
  const { currentPatientId } = useMuqsit();

  const { data: prescriptions, isLoading } = useQuery({
    queryKey: ["prescriptions", currentPatientId],
    queryFn: () => prescriptionsApi.listByPatient(currentPatientId as string),
    enabled: Boolean(currentPatientId),
  });

  // The previous visit = the most recent saved prescription (the current visit
  // isn't saved yet). Its chief complaints become this patient's "previous".
  const prevChief = (() => {
    if (!prescriptions || prescriptions.length === 0) return [];
    const latest = [...prescriptions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return latest.chiefComplaints ?? [];
  })();

  // Seed / refresh the field from the previous visit, keeping any notes the
  // doctor already wrote against the same complaint.
  useEffect(() => {
    if (currentPatientId && isLoading) return; // wait for the fetch
    const noteOf = new Map(items.map((it) => { const { complaint, note } = decodePc(it); return [complaint, note]; }));
    const next = prevChief.map((c) => encodePc(c, noteOf.get(c) ?? ""));
    if (JSON.stringify(next) !== JSON.stringify(items)) setItems(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(prevChief), isLoading, currentPatientId]);

  const setNote = (idx: number, note: string) => {
    setItems(items.map((it, i) => (i === idx ? encodePc(decodePc(it).complaint, note) : it)));
  };

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: C.n[800], minHeight: 28, display: "flex", alignItems: "center" }}>
        Previous complaints
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: C.n[500], paddingLeft: 14, paddingBottom: 4 }}>
          {currentPatientId ? "No complaints from a previous visit." : "Load a saved patient to see their previous complaints."}
        </div>
      ) : (
        <div style={{ paddingLeft: 14, marginTop: 1, marginBottom: 4 }}>
          {items.map((it, idx) => {
            const { complaint, note } = decodePc(it);
            return (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 0" }}>
                <span style={{ color: C.n[500], flexShrink: 0 }}>•</span>
                <span style={{ fontSize: 12, color: C.n[800], flexShrink: 0, maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={complaint}>{complaint}</span>
                <input
                  value={note}
                  onChange={(e) => setNote(idx, e.target.value)}
                  placeholder="write a note…"
                  style={{ flex: 1, minWidth: 0, border: "none", borderBottom: `0.5px dashed ${C.n[200]}`, outline: "none", background: "transparent", fontSize: 12, color: C.n[700], fontStyle: note ? "normal" : "italic", padding: "1px 2px" }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
