"use client";

import { useState } from "react";
import { C, colorOf, font } from "@/theme";
import { btnDisabled, btnPrimary, btnSecondary, inputMd } from "@/theme/styles";
import { useAdmitIpd, useIpdList, useSetIpdStatus } from "@/hooks/useIpd";
import Pill from "@/components/common/Pill";
import IpdDetailView from "@/components/ipd/IpdDetailView";
import PatientMobileLookup from "@/components/prescription/PatientMobileLookup";
import { useWards } from "@/hooks/useWards";
import { ApiError } from "@/lib/api";
import { useMuqsit } from "@/context/MuqsitContext";
import Icon from "@/components/common/Icon";

// Sentinel for "not one of my wards — let me type it". Not a ward id, so it can
// never be sent to the server as one.
const OTHER_WARD = "__other";

const STATUSES = ["Stable", "Observation", "Critical", "Discharge"] as const;
const statusColor = (s: string) =>
  s === "Critical" ? "danger" : s === "Observation" ? "warn" : s === "Discharge" ? "info" : "ok";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("default", { month: "short", day: "numeric" });

export default function IpdView() {
  const { data: admissions = [], isLoading, error } = useIpdList();
  const admit = useAdmitIpd();
  const setStatus = useSetIpdStatus();
  const { loadPatientById, setActiveTab } = useMuqsit();

  // Detail view: clicking a patient opens the full admission sheet.
  const [openId, setOpenId] = useState<string | null>(null);

  // Admit form
  const [showAdd, setShowAdd] = useState(false);
  const [bed, setBed] = useState("");
  const [name, setName] = useState("");
  const [hospitalId, setHospitalId] = useState("");
  const [roomNo, setRoomNo] = useState("");
  // Ward: picked from the practice's ward list when there is one (that link is
  // what puts the patient under a ward team), otherwise free-typed as before.
  // "" = none / free text.
  const [wardNo, setWardNo] = useState("");
  const [wardId, setWardId] = useState("");
  const [wardMode, setWardMode] = useState<"list" | "other">("list");
  const { data: wards = [] } = useWards();
  const [floorBuilding, setFloorBuilding] = useState("");
  const [mobile, setMobile] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  // Set when a patient is chosen from the mobile lookup — ties the admission to them.
  const [patientId, setPatientId] = useState<string | undefined>(undefined);
  // Why the last Admit was refused (e.g. 409 "Bed B-3 is already occupied").
  // The form stays filled so the doctor only has to change the bed.
  const [admitError, setAdmitError] = useState("");

  // Search the ward list by mobile number (like the Rx page).
  const [search, setSearch] = useState("");

  const occupied = admissions.filter((a) => a.status !== "Discharge").length;
  const critical = admissions.filter((a) => a.status === "Critical").length;
  const discharge = admissions.filter((a) => a.status === "Discharge").length;

  const q = search.trim();
  const filtered = q ? admissions.filter((a) => (a.mobile ?? "").includes(q)) : admissions;

  // The patient the three tabs act on: whoever the search narrows to (a single
  // admitted patient with a linked record). Load them, then open the same view.
  const target = filtered.length === 1 ? filtered[0] : null;
  const targetPid = target?.patientId;
  const openPatientTab = async (tab: "pt-settings" | "idsp" | "pt-records") => {
    if (!targetPid) return;
    await loadPatientById(targetPid);
    setActiveTab(tab);
  };
  const tabsTitle = targetPid
    ? `Open ${target?.name}`
    : filtered.length > 1
      ? "Search a patient's mobile number to pick one"
      : "No linked patient record";

  const mobileInvalid = mobile.length > 0 && mobile.length !== 11;

  const submitAdmit = async () => {
    if (!bed.trim() || !name.trim() || mobileInvalid) return;
    setAdmitError("");
    try {
      await admit.mutateAsync({
        bed: bed.trim(),
        name: name.trim(),
        patientId,
        hospitalId: hospitalId.trim() || undefined,
        roomNo: roomNo.trim() || undefined,
        wardNo: wardNo.trim() || undefined,
        // Only send the key when a listed ward was chosen — the server refuses a
        // ward that is not this doctor's, and rewrites wardNo to its real name.
        ...(wardId ? { wardId } : {}),
        floorBuilding: floorBuilding.trim() || undefined,
        mobile: mobile.trim() || undefined,
        diagnosis: diagnosis.trim() || undefined,
      });
    } catch (e) {
      setAdmitError(e instanceof ApiError ? e.message : "Could not admit — check the connection and try again.");
      return;
    }
    setBed(""); setName(""); setHospitalId(""); setRoomNo(""); setWardNo(""); setWardId(""); setFloorBuilding(""); setMobile(""); setDiagnosis(""); setPatientId(undefined);
    setShowAdd(false);
  };

  const inp = { ...inputMd, width: undefined } as const;
  const navBtn = (disabled: boolean) => ({ ...btnSecondary("sm"), ...(disabled ? btnDisabled : null) });

  // Full admission detail (opened by clicking a patient).
  const openAdmission = admissions.find((a) => a.id === openId) ?? null;
  if (openAdmission) {
    return <IpdDetailView admission={openAdmission} onBack={() => setOpenId(null)} />;
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, rowGap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, rowGap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>IPD ward management</div>
          <button disabled title="Nursing Genie — coming soon" style={{ ...btnSecondary("sm"), ...btnDisabled }}>
            <Icon name="sparkles" size={15} /> Nursing Genie <span style={{ fontSize: 10.5, fontWeight: 600, color: C.n[500], background: C.n[200], borderRadius: 999, padding: "1px 6px" }}>Soon</span>
          </button>
        </div>
        <button onClick={() => { setShowAdd((s) => !s); setAdmitError(""); }} style={btnPrimary("md")}>
          {showAdd ? "Close" : "+ Admit patient"}
        </button>
      </div>

      {showAdd && (
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: 14, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Patient name" style={{ ...inp, flex: "1 1 160px" }} />
          <div style={{ flex: "0 0 150px" }}>
            <PatientMobileLookup
              value={mobile}
              onChange={(d) => { setMobile(d); setPatientId(undefined); }}
              onPick={(p) => {
                setName(p.name);
                setMobile(p.mobile ?? "");
                if (p.hospitalId) setHospitalId(p.hospitalId);
                setPatientId(p.id);
              }}
              label={null}
              placeholder="Mobile (11 digit)"
              inputStyle={{ ...inp, width: "100%", boxSizing: "border-box", borderColor: mobileInvalid ? C.danger[400] : C.n[200] }}
            />
            {mobileInvalid && <div style={{ fontSize: 10.5, color: C.danger[800], marginTop: 2 }}>Must be 11 digits</div>}
          </div>
          <input value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} placeholder="Hospital id" style={{ ...inp, flex: "0 0 110px" }} />
          <input value={bed} onChange={(e) => setBed(e.target.value)} placeholder="Bed (e.g. B-3)" style={{ ...inp, flex: "0 0 110px" }} />
          <input value={roomNo} onChange={(e) => setRoomNo(e.target.value)} placeholder="Room no" style={{ ...inp, flex: "0 0 100px" }} />
          {/* A listed ward carries the team; anything else stays free text, so
              a doctor who has not set wards up yet is never blocked. */}
          {wards.length > 0 && (
            <select
              value={wardMode === "other" ? OTHER_WARD : wardId}
              onChange={(e) => {
                const v = e.target.value;
                if (v === OTHER_WARD) { setWardMode("other"); setWardId(""); setWardNo(""); return; }
                setWardMode("list");
                setWardId(v);
                setWardNo(wards.find((w) => w.id === v)?.name ?? "");
              }}
              title="Wards are managed in Settings → Manage your assistants and IPD team"
              style={{ ...inp, flex: "0 0 150px", cursor: "pointer" }}
            >
              <option value="">Ward — none</option>
              {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              <option value={OTHER_WARD}>Other (type it)…</option>
            </select>
          )}
          {(wards.length === 0 || wardMode === "other") && (
            <input value={wardNo} onChange={(e) => { setWardNo(e.target.value); setWardId(""); }} placeholder="Cabin / ward no" style={{ ...inp, flex: "0 0 130px" }} />
          )}
          <input value={floorBuilding} onChange={(e) => setFloorBuilding(e.target.value)} placeholder="Floor or building" style={{ ...inp, flex: "1 1 130px" }} />
          <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Diagnosis" style={{ ...inp, flex: "1 1 140px" }} />
          <button onClick={submitAdmit} disabled={admit.isPending || !bed.trim() || !name.trim() || mobileInvalid} style={{ ...btnPrimary("md"), opacity: admit.isPending || !bed.trim() || !name.trim() || mobileInvalid ? 0.6 : 1 }}>
            {admit.isPending ? "Admitting…" : "Admit"}
          </button>
          {admitError && (
            <div role="alert" style={{ flex: "1 1 100%", fontSize: 11, color: C.danger[800] }}>{admitError}</div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 10, marginBottom: 16 }}>
        <div style={{ background: C.n[100], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, fontWeight: 500, color: C.n[600] }}>Occupied</div><div style={{ fontSize: 24, fontWeight: 600, color: C.n[900] }}>{occupied}</div></div>
        <div style={{ background: C.danger[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, fontWeight: 500, color: C.danger[800] }}>Critical</div><div style={{ fontSize: 24, fontWeight: 600, color: C.danger[800] }}>{critical}</div></div>
        <div style={{ background: C.info[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, fontWeight: 500, color: C.info[800] }}>Discharge</div><div style={{ fontSize: 24, fontWeight: 600, color: C.info[800] }}>{discharge}</div></div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <button onClick={() => void openPatientTab("pt-settings")} disabled={!targetPid} title={tabsTitle} style={navBtn(!targetPid)}><Icon name="userEdit" size={15} /> Patient Settings</button>
        <button onClick={() => void openPatientTab("idsp")} disabled={!targetPid} title={tabsTitle} style={navBtn(!targetPid)}><Icon name="activity" size={15} /> Integrated health monitoring and overview</button>
        <button onClick={() => void openPatientTab("pt-records")} disabled={!targetPid} title={tabsTitle} style={navBtn(!targetPid)}><Icon name="folder" size={15} /> Patient&apos;s Prescriptions and reports</button>
        {targetPid && <span style={{ fontSize: 11, color: C.n[500], alignSelf: "center" }}>for <b style={{ color: C.n[700] }}>{target?.name}</b></span>}
      </div>

      <div style={{ marginBottom: 10 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="Search admitted patients by mobile number" placeholder="Search admitted patients by mobile number…" style={{ ...inp, width: "100%" }} />
      </div>

      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "4px 14px" }}>
        {isLoading && <div style={{ padding: "16px 0", fontSize: 12, color: C.n[500] }}>Loading ward…</div>}
        {Boolean(error) && <div style={{ padding: "16px 0", fontSize: 12, color: C.danger[800] }}>Could not load the ward. Is the API running?</div>}
        {!isLoading && !error && filtered.length === 0 && (
          <div style={{ padding: "16px 0", fontSize: 12, color: C.n[500] }}>{q ? "No admitted patient matches your search." : "No admissions — admit a patient above."}</div>
        )}
        {filtered.map((p, i) => {
          const color = statusColor(p.status);
          const where = [p.hospitalId && `ID ${p.hospitalId}`, p.roomNo && `Room ${p.roomNo}`, p.wardNo && `Ward ${p.wardNo}`, p.floorBuilding, p.mobile]
            .filter(Boolean)
            .join(" · ");
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, rowGap: 8, padding: "10px 0", borderBottom: i < filtered.length - 1 ? `0.5px solid ${C.n[200]}` : "none" }}>
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
                style={{ ...inp, minHeight: 30, padding: "0 6px", fontSize: 12, cursor: "pointer" }}
              >
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <button onClick={() => setOpenId(p.id)} style={btnSecondary("sm")}>Open</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
