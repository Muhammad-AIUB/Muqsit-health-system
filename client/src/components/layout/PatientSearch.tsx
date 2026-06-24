"use client";

import { useEffect, useRef, useState } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { patientsApi, type Patient } from "@/lib/api";
import { displayAge } from "@/lib/age";

// Top-bar patient search — by name, mobile number, or NID. Picking a result
// loads that patient into the prescription editor (restoring any in-progress Rx).
export default function PatientSearch() {
  const { loadPatient, setActiveTab } = useMuqsit();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); return; }
    let cancel = false;
    const t = setTimeout(() => {
      patientsApi.list(query)
        .then((rows) => { if (!cancel) { setResults(rows.slice(0, 8)); setOpen(true); } })
        .catch(() => { if (!cancel) setResults([]); });
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (p: Patient) => {
    loadPatient(p);
    setActiveTab("prescription");
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true); }}
        placeholder="Search by mobile / NID…"
        style={{ padding: "5px 10px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, fontSize: 11, width: 190, outline: "none", background: C.n[0], color: C.n[900], fontFamily: font }}
      />
      {open && results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, minWidth: 240, zIndex: 60, background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.14)", overflow: "hidden" }}>
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => pick(p)}
              type="button"
              style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, width: "100%", padding: "8px 12px", border: "none", borderBottom: `0.5px solid ${C.n[100]}`, background: C.n[0], cursor: "pointer", textAlign: "left", fontFamily: font }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.n[900] }}>{p.name}</span>
              <span style={{ fontSize: 11, color: C.n[500] }}>
                {[p.mobile, p.nid ? `NID ${p.nid}` : "", displayAge(p) ? `${displayAge(p)}y` : ""].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
