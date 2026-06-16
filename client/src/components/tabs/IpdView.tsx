"use client";

import { useState } from "react";
import { C, colorOf, font } from "@/theme";
import { useAdmitIpd, useIpdList, useSetIpdStatus, type IpdAdmission } from "@/hooks/useIpd";
import Pill from "@/components/common/Pill";
import IpdDetailView from "@/components/ipd/IpdDetailView";

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

  // Detail view: clicking a patient opens the full admission sheet.
  const [openId, setOpenId] = useState<string | null>(null);

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

  const inp = { padding: "7px 10px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, fontSize: 12, outline: "none", fontFamily: font } as const;

  // Full admission detail (opened by clicking a patient).
  const openAdmission = admissions.find((a) => a.id === openId) ?? null;
  if (openAdmission) {
    return <IpdDetailView admission={openAdmission} onBack={() => setOpenId(null)} />;
  }

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
              <div onClick={() => setOpenId(p.id)} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, cursor: "pointer", minWidth: 0 }}>
                <div style={{ width: 40, height: 26, borderRadius: 6, background: C.info[50], color: C.info[800], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{p.bed}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: C.n[600] }}>{p.diagnosis ?? "—"}{where ? ` · ${where}` : ""} · Admitted {fmtDate(p.admittedAt)}</div>
                </div>
              </div>
              <Pill bg={colorOf(color).bg} fg={colorOf(color).fg}>{p.status}</Pill>
              <select
                value={p.status}
                onChange={(e) => setStatus.mutate({ id: p.id, status: e.target.value })}
                style={{ ...inp, padding: "5px 6px", fontSize: 11, cursor: "pointer" }}
              >
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <button onClick={() => setOpenId(p.id)} style={{ padding: "5px 12px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 11, cursor: "pointer", fontFamily: font }}>Open</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
