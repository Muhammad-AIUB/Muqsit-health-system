"use client";

import { C } from "@/theme";
import { Loading, LoadError } from "@/components/common/ListState";
import { useChamberOwner } from "@/components/layout/ChamberPicker";
import { useDiseaseStats } from "@/hooks/useStatistics";

// Settings → Statistics → Disease statistics (physician's sheet, 11/11/2026):
// "Joto patient er prescription er final diagnosis a ja ja lekha thakbe oikhan
// theke just number show korbe". Every final diagnosis written on the practice's
// prescriptions, with the number of DIFFERENT patients who have it: a patient
// seen five times with DM is one. Two writings are one only when they differ in
// capitals and spacing — `DM` and `Diabetes mellitus` are two lines, and which
// names mean one disease is the physician's to say, not the app's to guess.
// A prescription holds no chamber, so this is the whole practice's.
export default function DiseaseStatistics() {
  const practiceId = useChamberOwner()?.practiceId ?? null;
  const q = useDiseaseStats(practiceId);

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.n[900] }}>Final diagnosis</div>
      <div style={{ fontSize: 12, color: C.n[600], margin: "2px 0 10px", lineHeight: 1.5 }}>
        What was written as the Final diagnosis on your prescriptions, and how many different patients have it. All chambers together.
      </div>
      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "6px 16px" }}>
        {q.error ? (
          <LoadError compact title="Could not load the disease numbers." onRetry={() => q.refetch()} retrying={q.isFetching} />
        ) : !q.data ? (
          <Loading compact label="Loading numbers…" />
        ) : q.data.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.n[600], padding: "14px 0" }}>No Final diagnosis has been written on a prescription yet.</div>
        ) : (
          <ul data-disease-list style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {q.data.map((d, i) => {
              const widest = q.data[0].patients || 1;
              return (
                <li key={`${i}:${d.name}`} data-disease={d.name} style={{ position: "relative", display: "flex", alignItems: "baseline", gap: 12, padding: "9px 0", borderTop: i === 0 ? "none" : `0.5px solid ${C.n[200]}` }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.n[900], overflowWrap: "anywhere" }}>{d.name}</span>
                  <span aria-hidden style={{ flex: "0 0 90px", height: 6, borderRadius: 3, background: C.n[100], overflow: "hidden", alignSelf: "center" }}>
                    <span style={{ display: "block", height: "100%", width: `${Math.max(3, Math.round((d.patients / widest) * 100))}%`, background: C.n[400] }} />
                  </span>
                  <span data-disease-count style={{ flex: "0 0 auto", minWidth: 44, textAlign: "right", fontSize: 13.5, fontWeight: 600, color: C.n[900], fontVariantNumeric: "tabular-nums" }}>{d.patients}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
