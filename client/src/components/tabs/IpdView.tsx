"use client";

import { useState } from "react";
import { C, colorOf, font } from "@/theme";
import { useAddIpdEvent, useAdmitIpd, useIpdEvents, useIpdList, useSetIpdStatus, type IpdAdmission } from "@/hooks/useIpd";
import Pill from "@/components/common/Pill";

const STATUSES = ["Stable", "Observation", "Critical", "Discharge"] as const;
const statusColor = (s: string) =>
  s === "Critical" ? "danger" : s === "Observation" ? "warn" : s === "Discharge" ? "info" : "pri";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("default", { month: "short", day: "numeric" });
const fmtTs = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function IpdView() {
  const { data: admissions = [], isLoading, error } = useIpdList();
  const admit = useAdmitIpd();
  const setStatus = useSetIpdStatus();

  // Events modal
  const [selected, setSelected] = useState<IpdAdmission | null>(null);
  const [eventMsg, setEventMsg] = useState("");
  const { data: events = [] } = useIpdEvents(selected?.id ?? null);
  const addEvent = useAddIpdEvent();

  // Admit form
  const [showAdd, setShowAdd] = useState(false);
  const [bed, setBed] = useState("");
  const [name, setName] = useState("");
  const [hospitalId, setHospitalId] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [wardNo, setWardNo] = useState("");
  const [floorBuilding, setFloorBuilding] = useState("");
  const [mobile, setMobile] = useState("");
  const [diagnosis, setDiagnosis] = useState("");

  const occupied = admissions.filter((a) => a.status !== "Discharge").length;
  const critical = admissions.filter((a) => a.status === "Critical").length;
  const discharge = admissions.filter((a) => a.status === "Discharge").length;

  const mobileInvalid = mobile.length > 0 && mobile.length !== 11;

  const submitAdmit = async () => {
    if (!bed.trim() || !name.trim() || mobileInvalid) return;
    await admit.mutateAsync({
      bed: bed.trim(),
      name: name.trim(),
      hospitalId: hospitalId.trim() || undefined,
      roomNo: roomNo.trim() || undefined,
      wardNo: wardNo.trim() || undefined,
      floorBuilding: floorBuilding.trim() || undefined,
      mobile: mobile.trim() || undefined,
      diagnosis: diagnosis.trim() || undefined,
    });
    setBed(""); setName(""); setHospitalId(""); setRoomNo(""); setWardNo(""); setFloorBuilding(""); setMobile(""); setDiagnosis("");
    setShowAdd(false);
  };

  const sendEvent = async () => {
    if (!selected) return;
    const msg = eventMsg.trim();
    if (!msg) return;
    await addEvent.mutateAsync({ id: selected.id, note: msg });
    setEventMsg("");
  };

  const inp = { padding: "7px 10px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, fontSize: 12, outline: "none", fontFamily: font } as const;

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setShowAdd((s) => !s)} style={{ position: "absolute", top: 0, right: 0, padding: "6px 14px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: font, zIndex: 1 }}>
        {showAdd ? "Close" : "+ Admit patient"}
      </button>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 500 }}>IPD ward management</div>
      </div>

      {showAdd && (
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: 14, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Patient name" style={{ ...inp, flex: "1 1 160px" }} />
          <div style={{ flex: "0 0 130px" }}>
            <input value={mobile} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); if (v.length <= 11) setMobile(v); }} placeholder="Mobile (11 digit)" maxLength={11} style={{ ...inp, width: "100%", boxSizing: "border-box", borderColor: mobileInvalid ? C.danger[400] : C.n[200] }} />
            {mobileInvalid && <div style={{ fontSize: 9, color: C.danger[800], marginTop: 2 }}>Must be 11 digits</div>}
          </div>
          <input value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} placeholder="Hospital id" style={{ ...inp, flex: "0 0 110px" }} />
          <input value={bed} onChange={(e) => setBed(e.target.value)} placeholder="Bed (e.g. B-3)" style={{ ...inp, flex: "0 0 110px" }} />
          <input value={roomNo} onChange={(e) => setRoomNo(e.target.value)} placeholder="Room no" style={{ ...inp, flex: "0 0 100px" }} />
          <input value={wardNo} onChange={(e) => setWardNo(e.target.value)} placeholder="Cabin / ward no" style={{ ...inp, flex: "0 0 130px" }} />
          <input value={floorBuilding} onChange={(e) => setFloorBuilding(e.target.value)} placeholder="Floor or building" style={{ ...inp, flex: "1 1 130px" }} />
          <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Diagnosis" style={{ ...inp, flex: "1 1 140px" }} />
          <button onClick={submitAdmit} disabled={admit.isPending || !bed.trim() || !name.trim() || mobileInvalid} style={{ padding: "7px 16px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: font, opacity: admit.isPending || !bed.trim() || !name.trim() || mobileInvalid ? 0.6 : 1 }}>
            {admit.isPending ? "Admitting…" : "Admit"}
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        <div style={{ background: C.pri[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.pri[600] }}>Occupied</div><div style={{ fontSize: 22, fontWeight: 500, color: C.pri[600] }}>{occupied}</div></div>
        <div style={{ background: C.danger[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.danger[800] }}>Critical</div><div style={{ fontSize: 22, fontWeight: 500, color: C.danger[800] }}>{critical}</div></div>
        <div style={{ background: C.info[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.info[800] }}>Discharge</div><div style={{ fontSize: 22, fontWeight: 500, color: C.info[800] }}>{discharge}</div></div>
      </div>

      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "4px 14px" }}>
        {isLoading && <div style={{ padding: "16px 0", fontSize: 12, color: C.n[500] }}>Loading ward…</div>}
        {Boolean(error) && <div style={{ padding: "16px 0", fontSize: 12, color: C.danger[800] }}>Could not load the ward. Is the API running?</div>}
        {!isLoading && !error && admissions.length === 0 && (
          <div style={{ padding: "16px 0", fontSize: 12, color: C.n[500] }}>No admissions — admit a patient above.</div>
        )}
        {admissions.map((p, i) => {
          const color = statusColor(p.status);
          const where = [p.hospitalId && `ID ${p.hospitalId}`, p.roomNo && `Room ${p.roomNo}`, p.wardNo && `Ward ${p.wardNo}`, p.floorBuilding, p.mobile]
            .filter(Boolean)
            .join(" · ");
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < admissions.length - 1 ? `0.5px solid ${C.n[200]}` : "none" }}>
              <div style={{ width: 40, height: 26, borderRadius: 6, background: C.info[50], color: C.info[800], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>{p.bed}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: C.n[600] }}>{p.diagnosis ?? "—"}{where ? ` · ${where}` : ""} · Admitted {fmtDate(p.admittedAt)}</div>
              </div>
              <Pill bg={colorOf(color).bg} fg={colorOf(color).fg}>{p.status}</Pill>
              <select
                value={p.status}
                onChange={(e) => setStatus.mutate({ id: p.id, status: e.target.value })}
                style={{ ...inp, padding: "5px 6px", fontSize: 11, cursor: "pointer" }}
              >
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <button onClick={() => setSelected(p)} style={{ padding: "5px 12px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 11, cursor: "pointer", fontFamily: font }}>Events</button>
            </div>
          );
        })}
      </div>

      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.n[0], borderRadius: 14, width: 480, maxWidth: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ padding: "16px 20px 12px", borderBottom: `0.5px solid ${C.n[200]}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{selected.name}</div>
                <div style={{ fontSize: 11, color: C.n[600] }}>
                  {[selected.hospitalId && `ID ${selected.hospitalId}`, selected.bed, selected.roomNo && `Room ${selected.roomNo}`, selected.wardNo && `Ward ${selected.wardNo}`, selected.floorBuilding, selected.mobile, selected.diagnosis ?? "—"].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.n[500], lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflowY: "auto", padding: "14px 20px", flex: 1 }}>
              {events.length === 0 ? (
                <div style={{ textAlign: "center", color: C.n[500], fontSize: 12, padding: "24px 0" }}>No events recorded yet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {events.map((ev, idx) => (
                    <div key={ev.id} style={{ display: "flex", gap: 12, paddingBottom: 16, position: "relative" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.pri[400], marginTop: 3, flexShrink: 0 }} />
                        {idx < events.length - 1 && <div style={{ width: 1.5, flex: 1, background: C.n[200], marginTop: 3 }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: C.n[500], marginBottom: 2 }}>{fmtTs(ev.createdAt)}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.n[800], marginBottom: 3 }}>
                          {ev.author}{ev.role ? <span style={{ fontWeight: 400, color: C.n[500] }}> — {ev.role}</span> : ""}
                        </div>
                        <div style={{ fontSize: 12, color: C.n[700], lineHeight: 1.5 }}>{ev.note}</div>
                        {ev.reportUrl && (
                          <a href={ev.reportUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, padding: "3px 10px", borderRadius: 5, border: `0.5px solid ${C.pri[100]}`, background: C.pri[50], color: C.pri[600], fontSize: 11, textDecoration: "none", fontFamily: font }}>
                            📄 Report
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ borderTop: `0.5px solid ${C.n[200]}`, padding: "10px 16px", display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                value={eventMsg}
                onChange={(e) => setEventMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendEvent();
                  }
                }}
                placeholder="Add an event note… (Enter to send, Shift+Enter for new line)"
                rows={2}
                style={{ flex: 1, resize: "none", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, padding: "8px 10px", fontSize: 12, fontFamily: font, color: C.n[800], outline: "none", lineHeight: 1.5, background: C.n[50] }}
              />
              <button
                onClick={() => void sendEvent()}
                disabled={addEvent.isPending}
                style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: font, flexShrink: 0, alignSelf: "flex-end", opacity: addEvent.isPending ? 0.6 : 1 }}>
                {addEvent.isPending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
