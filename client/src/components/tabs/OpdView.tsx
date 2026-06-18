"use client";

import { useState } from "react";
import { C, colorOf, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { useAddOpdVisit, useOpdQueue, useSetOpdStatus } from "@/hooks/useOpd";
import Pill from "@/components/common/Pill";

const typeColor = (type: string) => (type === "Urgent" ? "danger" : type === "Follow-up" ? "pri" : "warn");
const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export default function OpdView() {
  const { setPtName, setPtAge, setPtGender, setPtPhone, setActiveTab, setRxItems, setActiveTemplate, setCurrentPatientId, setPtInfo, resetEditor } = useMuqsit();
  const { data: queue = [], isLoading, error } = useOpdQueue();
  const addVisit = useAddOpdVisit();
  const setStatus = useSetOpdStatus();

  // Add-to-queue form
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("M");
  const [type, setType] = useState("New");

  const waiting = queue.filter((v) => v.status === "waiting").length;
  const done = queue.filter((v) => v.status === "done").length;

  const submitAdd = async () => {
    if (!name.trim()) return;
    await addVisit.mutateAsync({
      name: name.trim(),
      phone: phone.trim() || undefined,
      age: age ? Number(age) : undefined,
      gender,
      type,
    });
    setName(""); setPhone(""); setAge(""); setType("New");
    setShowAdd(false);
  };

  const inp = { padding: "7px 10px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, fontSize: 12, outline: "none", fontFamily: font } as const;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 500 }}>OPD queue management</div>
        <button onClick={() => setShowAdd((s) => !s)} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: font }}>
          {showAdd ? "Close" : "+ Add to queue"}
        </button>
      </div>

      {showAdd && (
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: 14, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Patient name" style={{ ...inp, flex: "1 1 160px" }} />
          <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ -]/g, ""))} placeholder="Mobile" style={{ ...inp, flex: "0 0 130px" }} />
          <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Age" style={{ ...inp, flex: "0 0 60px" }} />
          <select value={gender} onChange={(e) => setGender(e.target.value)} style={{ ...inp, flex: "0 0 60px" }}>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...inp, flex: "0 0 110px" }}>
            <option>New</option>
            <option>Follow-up</option>
            <option>Urgent</option>
          </select>
          <button onClick={submitAdd} disabled={addVisit.isPending || !name.trim()} style={{ padding: "7px 16px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: font, opacity: addVisit.isPending || !name.trim() ? 0.6 : 1 }}>
            {addVisit.isPending ? "Adding…" : "Add"}
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        <div style={{ background: C.n[100], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.n[600] }}>Total today</div><div style={{ fontSize: 22, fontWeight: 500 }}>{queue.length}</div></div>
        <div style={{ background: C.pri[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.pri[600] }}>Completed</div><div style={{ fontSize: 22, fontWeight: 500, color: C.pri[600] }}>{done}</div></div>
        <div style={{ background: C.warn[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.warn[800] }}>Waiting</div><div style={{ fontSize: 22, fontWeight: 500, color: C.warn[800] }}>{waiting}</div></div>
      </div>

      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "4px 14px" }}>
        {isLoading && <div style={{ padding: "16px 0", fontSize: 12, color: C.n[500] }}>Loading queue…</div>}
        {Boolean(error) && <div style={{ padding: "16px 0", fontSize: 12, color: C.danger[800] }}>Could not load the OPD queue. Is the API running?</div>}
        {!isLoading && !error && queue.length === 0 && (
          <div style={{ padding: "16px 0", fontSize: 12, color: C.n[500] }}>Queue is empty — add a patient above.</div>
        )}
        {queue.map((p, i) => {
          const color = typeColor(p.type);
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < queue.length - 1 ? `0.5px solid ${C.n[200]}` : "none", opacity: p.status === "done" ? 0.55 : 1 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: colorOf(color).bg, color: colorOf(color).fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{initials(p.name)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: C.n[600] }}>{p.phone ?? "—"} · {p.age ?? "—"}y/{p.gender ?? "—"}</div>
              </div>
              <Pill bg={colorOf(color).bg} fg={colorOf(color).fg}>{p.type}</Pill>
              <Pill bg={C.n[100]} fg={C.n[800]}>{p.token}</Pill>
              {p.status === "waiting" ? (
                <>
                  <button
                    onClick={() => {
                      resetEditor(); // start clean — don't carry the last patient's clinical data
                      const sex = p.gender === "F" ? "Female" : "Male";
                      const age = p.age != null ? String(p.age) : "";
                      setPtName(p.name);
                      setPtAge(age);
                      setPtGender(sex);
                      if (p.phone) setPtPhone(p.phone);
                      setCurrentPatientId(p.patientId);
                      // Tie Patient Settings + health monitoring to this patient
                      // (pre-fill the form from the queue entry instead of blank).
                      setPtInfo({
                        name: p.name, hospitalId: "", bloodGroup: "", dob: "", age, sex,
                        ethnicity: "", religion: "Islam", mobile: p.phone ?? "",
                        spouseMobile: "", relativeMobile: "", relativeRelation: "",
                        district: "", fullAddress: "", monthlyIncome: "", picture: null, tags: [],
                      });
                      setActiveTab("prescription");
                      setRxItems([]);
                      setActiveTemplate(null);
                    }}
                    style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 11, cursor: "pointer", fontFamily: font }}
                  >
                    Prescribe
                  </button>
                  <button onClick={() => setStatus.mutate({ id: p.id, status: "done" })} style={{ padding: "5px 12px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 11, cursor: "pointer", fontFamily: font }}>
                    Done
                  </button>
                </>
              ) : (
                <Pill bg={C.pri[50]} fg={C.pri[600]}>✓ done</Pill>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
