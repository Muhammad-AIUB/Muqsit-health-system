"use client";

import { useState, type CSSProperties } from "react";
import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { useCreatePatient, useUpdatePatient } from "@/hooks/usePatients";
import { patientsApi, uploadImage } from "@/lib/api";
import { ptInfoToInput } from "@/lib/patientForm";
import type { PtInfo } from "@/types";
import Pill from "@/components/common/Pill";

const districts = ["Dhaka","Faridpur","Gazipur","Gopalganj","Kishoreganj","Madaripur","Manikganj","Munshiganj","Narayanganj","Narsingdi","Rajbari","Shariatpur","Tangail","Chattogram","Cox's Bazar","Cumilla","Feni","Brahmanbaria","Noakhali","Lakshmipur","Chandpur","Khagrachhari","Rangamati","Bandarban","Rajshahi","Chapai Nawabganj","Naogaon","Natore","Pabna","Bogura","Sirajganj","Joypurhat","Khulna","Jessore","Satkhira","Narail","Chuadanga","Kushtia","Meherpur","Jhenaidah","Bagerhat","Magura","Barishal","Bhola","Jhalokathi","Pirojpur","Patuakhali","Barguna","Sylhet","Moulvibazar","Sunamganj","Habiganj","Rangpur","Dinajpur","Thakurgaon","Panchagarh","Kurigram","Lalmonirhat","Nilphamari","Gaibandha","Mymensingh","Netrokona","Jamalpur","Sherpur"];
const ethnicities = ["South Asian","Caucasian / European descent","African / African-American","East Asian","Southeast Asian","Middle Eastern / Arab","Native American / Indigenous Peoples","Pacific Islander / Polynesian","Hispanic / Latino","Aboriginal / Indigenous Australian","Jewish (Ashkenazi, Sephardic, Mizrahi)","Mediterranean","Scandinavian / Northern European","Black Caribbean","Mixed Ethnicity (Multiracial)"];
const religions = ["Islam","Hinduism","Christianity","Buddhism","Sikhism","Judaism","Confucianism","Other"];
const QUICK_TAGS = ["VIP", "Chronic", "Elderly", "Diabetic", "Hypertensive", "Pregnant", "Pediatric", "Follow-up", "Critical", "Post-surgery", "Cancer", "Transplant", "Dialysis", "Mental health"];
const RELATIONS = [
  { rel: "Spouse", icon: "♥", autoSex: "" },
  { rel: "Father", icon: "♂", autoSex: "Male" },
  { rel: "Mother", icon: "♀", autoSex: "Female" },
  { rel: "Brother", icon: "♂", autoSex: "Male" },
  { rel: "Sister", icon: "♀", autoSex: "Female" },
  { rel: "Son", icon: "♂", autoSex: "Male" },
  { rel: "Daughter", icon: "♀", autoSex: "Female" },
];

// ── Patient photo (top-left corner of the info form) ─────────
// Uploads to the server and, when editing an existing patient, persists
// the photo on the record immediately.
function PatientPhotoCorner() {
  const { ptInfo, setPtInfo, currentPatientId } = useMuqsit();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const url = await uploadImage(file);
      setPtInfo((prev) => ({ ...prev, picture: url }));
      if (currentPatientId) await patientsApi.update(currentPatientId, { pictureUrl: url });
    } catch {
      setErr("Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!window.confirm("Remove this patient's photo?")) return;
    setBusy(true);
    setErr("");
    try {
      if (currentPatientId) await patientsApi.update(currentPatientId, { pictureUrl: null });
      setPtInfo((prev) => ({ ...prev, picture: null }));
    } catch {
      setErr("Could not remove");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ flexShrink: 0, width: 110, textAlign: "center" }}>
      <div style={{ position: "relative", width: 100, height: 100, margin: "0 auto" }}>
        <label
          style={{
            width: 100, height: 100, borderRadius: 10,
            border: `1.5px dashed ${ptInfo.picture ? C.pri[400] : C.n[300]}`,
            background: ptInfo.picture ? "transparent" : C.n[50],
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            cursor: "pointer", overflow: "hidden", boxSizing: "border-box",
          }}
        >
          {ptInfo.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ptInfo.picture} alt={ptInfo.name || "Patient"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <>
              <span style={{ fontSize: 22, color: C.n[500] }}>{busy ? "…" : "📷"}</span>
              <span style={{ fontSize: 9, color: C.n[500], marginTop: 2 }}>Upload photo</span>
            </>
          )}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={onChange} disabled={busy} />
        </label>
        {ptInfo.picture && !busy && (
          <button
            onClick={removePhoto}
            title="Remove photo"
            style={{
              position: "absolute", top: -6, right: -6,
              width: 18, height: 18, borderRadius: "50%",
              border: `1px solid ${C.n[0]}`, background: C.danger[400], color: "#fff",
              fontSize: 11, lineHeight: 1, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>
      <div style={{ fontSize: 9, color: err ? C.danger[800] : C.n[500], marginTop: 4 }}>
        {busy ? "Working…" : err ? err : ptInfo.picture ? "Click to change" : "For identification"}
      </div>
    </div>
  );
}

export default function PatientSettingsView() {
  const {
    ptInfo, setPtInfo, ptSettingsTab, setPtSettingsTab,
    familyMembers, setFamilyMembers, showFamilyForm, setShowFamilyForm,
    familyRelation, setFamilyRelation, familyForm, setFamilyForm,
    ptName, ptGender, ptPhone, setPtName, setPtAge, setPtGender, setPtPhone,
    currentPatientId, setCurrentPatientId,
  } = useMuqsit();

  const createPatient = useCreatePatient();
  const updatePatient = useUpdatePatient();
  const saving = createPatient.isPending || updatePatient.isPending;
  const [formMsg, setFormMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const pI = ptInfo;
  const setPi = <K extends keyof PtInfo>(f: K, v: PtInfo[K]) => setPtInfo((prev) => ({ ...prev, [f]: v }));

  const savePatient = async () => {
    if (!pI.name.trim()) {
      setFormMsg({ text: "Name is required", ok: false });
      return;
    }
    const input = ptInfoToInput({ ...pI, age: piAge || pI.age });
    try {
      if (currentPatientId) {
        await updatePatient.mutateAsync({ id: currentPatientId, input });
      } else {
        const created = await createPatient.mutateAsync(input);
        setCurrentPatientId(created.id);
      }
      if (pI.name) setPtName(pI.name);
      if (piAge || pI.age) setPtAge(piAge || pI.age);
      if (pI.sex) setPtGender(pI.sex);
      if (pI.mobile) setPtPhone(pI.mobile);
      setFormMsg({ text: currentPatientId ? "Patient updated!" : "Patient created!", ok: true });
    } catch (e) {
      setFormMsg({ text: e instanceof Error ? e.message : "Save failed", ok: false });
    }
  };

  const computeAge = (dob: string) => {
    if (!dob) return "";
    const bd = new Date(dob);
    return String(Math.floor((Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
  };
  const piAge = computeAge(pI.dob);

  const piLbl: CSSProperties = { fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 };
  const piInp: CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", background: C.n[0], color: C.n[900], boxSizing: "border-box", fontFamily: "inherit" };
  const piSel: CSSProperties = Object.assign({}, piInp, { padding: "8px 6px" });
  const piRow: CSSProperties = { display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" };
  const psTabStyle = (id: string): CSSProperties => ({ padding: "6px 16px", borderRadius: 7, border: "none", cursor: ptSettingsTab === "security" && id === "security" ? "not-allowed" : "pointer", fontSize: 12, background: ptSettingsTab === id ? C.info[50] : "transparent", color: ptSettingsTab === id ? C.info[800] : C.n[600], fontWeight: ptSettingsTab === id ? 500 : 400, fontFamily: "inherit", opacity: id === "security" ? 0.5 : 1 });
  const filteredDistricts = districts.filter((d) => !pI.district || d.toLowerCase().indexOf(pI.district.toLowerCase()) >= 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "0.5px solid " + C.n[200], paddingBottom: 8 }}>
        <button onClick={() => setPtSettingsTab("info")} style={psTabStyle("info")}>Patient information</button>
        <button onClick={() => {}} style={psTabStyle("security")} title="Coming soon">Data security level</button>
        <button onClick={() => setPtSettingsTab("doctors")} style={psTabStyle("doctors")}>Supervising doctor list</button>
        <button onClick={() => setPtSettingsTab("family")} style={psTabStyle("family")}>Family tree</button>
      </div>

      {ptSettingsTab === "info" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Patient information</div>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600, background: currentPatientId ? C.info[50] : C.pri[50], color: currentPatientId ? C.info[800] : C.pri[600] }}>
              {currentPatientId ? "Editing existing" : "New patient"}
            </span>
          </div>
          <div style={{ background: C.n[0], border: "0.5px solid " + C.n[200], borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <PatientPhotoCorner />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={piRow}>
                  <div style={{ flex: "1 1 200px" }}><div style={piLbl}>Name *</div><input style={piInp} value={pI.name} onChange={(e) => setPi("name", e.target.value)} placeholder="Full name" /></div>
                  <div style={{ flex: "1 1 160px" }}><div style={piLbl}>Hospital ID</div><input style={piInp} value={pI.hospitalId} onChange={(e) => setPi("hospitalId", e.target.value)} placeholder="Hospital ID" /></div>
                  <div style={{ flex: "0 0 140px" }}><div style={piLbl}>Date of birth</div><input style={piInp} type="date" value={pI.dob} onChange={(e) => { setPi("dob", e.target.value); setPtAge(computeAge(e.target.value)); }} /></div>
                  <div style={{ flex: "0 0 70px" }}><div style={piLbl}>Age *</div><input style={piInp} value={piAge || pI.age} onChange={(e) => { setPi("age", e.target.value); if (!pI.dob) setPtAge(e.target.value); }} placeholder="Auto" />{piAge && <div style={{ fontSize: 9, color: C.pri[600], marginTop: 2 }}>Auto from DOB</div>}</div>
                  <div style={{ flex: "0 0 100px" }}><div style={piLbl}>Sex *</div><select style={piSel} value={pI.sex} onChange={(e) => { setPi("sex", e.target.value); setPtGender(e.target.value); }}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></div>
                </div>
                <div style={piRow}>
                  <div style={{ flex: "1 1 200px" }}><div style={piLbl}>Ethnicity</div><select style={piSel} value={pI.ethnicity} onChange={(e) => setPi("ethnicity", e.target.value)}><option value="">Select ethnicity…</option>{ethnicities.map((e) => <option key={e}>{e}</option>)}</select></div>
                  <div style={{ flex: "1 1 150px" }}><div style={piLbl}>Religion</div><select style={piSel} value={pI.religion} onChange={(e) => setPi("religion", e.target.value)}>{religions.map((r) => <option key={r}>{r}</option>)}</select></div>
                  <div style={{ flex: "0 0 130px" }}><div style={piLbl}>Blood group &amp; Rh</div><select style={piSel} value={pI.bloodGroup} onChange={(e) => setPi("bloodGroup", e.target.value)}><option value="">—</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option><option>Other</option></select></div>
                </div>
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 8, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Contact numbers</div>
            <div style={piRow}>
              <div style={{ flex: "1 1 160px" }}><div style={piLbl}>Patient mobile * (11 digit)</div><input style={piInp} value={pI.mobile} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); if (v.length <= 11) { setPi("mobile", v); setPtPhone(v); } }} placeholder="01XXXXXXXXX" maxLength={11} />{pI.mobile && pI.mobile.length !== 11 && <div style={{ fontSize: 9, color: C.danger[800], marginTop: 2 }}>Must be 11 digits</div>}</div>
              <div style={{ flex: "1 1 160px" }}><div style={piLbl}>Spouse mobile (11 digit)</div><input style={piInp} value={pI.spouseMobile} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); if (v.length <= 11) setPi("spouseMobile", v); }} placeholder="01XXXXXXXXX" maxLength={11} /></div>
            </div>
            <div style={piRow}>
              <div style={{ flex: "1 1 160px" }}><div style={piLbl}>1st degree relative mobile *</div><input style={piInp} value={pI.relativeMobile} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); if (v.length <= 11) setPi("relativeMobile", v); }} placeholder="01XXXXXXXXX" maxLength={11} /></div>
              <div style={{ flex: "1 1 200px" }}><div style={piLbl}>Relation</div><input style={piInp} value={pI.relativeRelation} onChange={(e) => setPi("relativeRelation", e.target.value)} placeholder="e.g. Brother, Sister, Father, Mother" /></div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 8, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Financial</div>
            <div style={piRow}>
              <div style={{ flex: "1 1 200px" }}><div style={piLbl}>Patient&apos;s / attendant&apos;s monthly income</div><div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 12, color: C.n[600] }}>৳</span><input style={piInp} value={pI.monthlyIncome || ""} onChange={(e) => setPi("monthlyIncome", e.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 25000" /></div></div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 8, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Address</div>
            <div style={piRow}>
              <div style={{ flex: "1 1 200px", position: "relative" }}>
                <div style={piLbl}>District (type to search)</div>
                <input style={piInp} value={pI.district} onChange={(e) => setPi("district", e.target.value)} placeholder="Start typing district..." />
                {pI.district && pI.district.length > 0 && filteredDistricts.length > 0 && filteredDistricts.length < 10 && !districts.includes(pI.district) && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.n[0], border: "0.5px solid " + C.n[200], borderRadius: 6, maxHeight: 150, overflowY: "auto", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                    {filteredDistricts.map((d) => (
                      <div key={d} onClick={() => setPi("district", d)} style={{ padding: "6px 10px", fontSize: 11, cursor: "pointer", borderBottom: "0.5px solid " + C.n[100] }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = C.pri[50]; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>{d}</div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ flex: "2 1 300px" }}><div style={piLbl}>Full address</div><input style={piInp} value={pI.fullAddress} onChange={(e) => setPi("fullAddress", e.target.value)} placeholder="House, Road, Area, Upazila..." /></div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 8, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Tags</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.n[600], marginBottom: 6 }}>Add tags to categorize this patient (e.g., VIP, Chronic, Elderly, Diabetic, Follow-up)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {(pI.tags || []).map((tag, i) => (
                  <span key={i} style={{ fontSize: 11, color: C.pri[600], background: C.pri[50], padding: "4px 8px 4px 10px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 5, border: "0.5px solid " + C.pri[100] }}>
                    {tag}
                    <button onClick={() => setPi("tags", (pI.tags || []).filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: C.pri[400], cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input id="tagInput" placeholder="Type a tag and press Enter..." onKeyDown={(e) => {
                  if (e.key === "Enter" && e.currentTarget.value.trim()) {
                    const newTag = e.currentTarget.value.trim();
                    if (!(pI.tags || []).includes(newTag)) setPi("tags", (pI.tags || []).concat([newTag]));
                    e.currentTarget.value = "";
                  }
                }} style={piInp} />
                <button onClick={() => {
                  const inp = document.getElementById("tagInput") as HTMLInputElement | null;
                  if (inp && inp.value.trim()) {
                    const newTag = inp.value.trim();
                    if (!(pI.tags || []).includes(newTag)) setPi("tags", (pI.tags || []).concat([newTag]));
                    inp.value = "";
                  }
                }} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Add tag</button>
              </div>
              {/* Quick tag suggestions */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {QUICK_TAGS.map((st) => {
                  const already = (pI.tags || []).includes(st);
                  return (
                    <button key={st} onClick={() => { if (!already) setPi("tags", (pI.tags || []).concat([st])); }}
                      style={{ padding: "3px 10px", borderRadius: 5, fontSize: 9, cursor: already ? "default" : "pointer",
                        border: "0.5px solid " + (already ? C.pri[400] : C.n[200]),
                        background: already ? C.pri[50] : C.n[50],
                        color: already ? C.pri[600] : C.n[600],
                        opacity: already ? 0.5 : 1, fontFamily: "inherit",
                      }}>{already ? "✓ " : ""}{st}</button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center" }}>
              <button onClick={savePatient} disabled={saving} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1, fontFamily: "inherit" }}>
                {saving ? "Saving…" : currentPatientId ? "Update patient" : "Create patient"}
              </button>
              {formMsg && (
                <span style={{ fontSize: 12, fontWeight: 500, color: formMsg.ok ? C.pri[600] : C.danger[800] }}>{formMsg.text}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {ptSettingsTab === "security" && (
        <div style={{ textAlign: "center", padding: 50, color: C.n[500] }}>
          <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>⊛</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.n[800] }}>Data security level</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>This feature is currently disabled and will be available in a future update.</div>
        </div>
      )}

      {ptSettingsTab === "doctors" && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Supervising doctor list</div>
          <div style={{ background: C.n[0], border: "0.5px solid " + C.n[200], borderRadius: 10, padding: 16 }}>
            {[{ name: "Dr. Rahman (You)", role: "Primary", spec: "General Medicine", status: "Active" },
              { name: "Dr. Farzana Akter", role: "Consultant", spec: "Cardiology", status: "Active" },
              { name: "Dr. Kamal Hossain", role: "Referred", spec: "Gastroenterology", status: "Pending" },
            ].map((doc, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < 2 ? "0.5px solid " + C.n[200] : "none" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.pri[50], color: C.pri[600], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500 }}>{doc.name.charAt(4) + doc.name.charAt(5)}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{doc.name}</div><div style={{ fontSize: 10, color: C.n[600] }}>{doc.spec} · {doc.role}</div></div>
                <Pill bg={doc.status === "Active" ? C.pri[50] : C.warn[50]} fg={doc.status === "Active" ? C.pri[600] : C.warn[800]}>{doc.status}</Pill>
              </div>
            ))}
            <button style={{ marginTop: 12, padding: "8px 16px", borderRadius: 6, border: "1px dashed " + C.n[300], background: "transparent", color: C.pri[400], fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>+ Add supervising doctor</button>
          </div>
        </div>
      )}

      {ptSettingsTab === "family" && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Family tree</div>

          {/* Patient info summary */}
          <div style={{ background: C.pri[50], border: "0.5px solid " + C.pri[100], borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.pri[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Patient</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
              <div><span style={{ color: C.n[600] }}>Name: </span><span style={{ fontWeight: 500 }}>{ptName || "—"}</span></div>
              <div><span style={{ color: C.n[600] }}>Mobile: </span><span style={{ fontWeight: 500 }}>{ptPhone || "—"}</span></div>
              <div><span style={{ color: C.n[600] }}>NID: </span><span style={{ color: C.n[500] }}>Not provided</span></div>
              <div><span style={{ color: C.n[600] }}>Sex: </span><span style={{ fontWeight: 500 }}>{ptGender}</span></div>
            </div>
          </div>

          {/* Add relation buttons */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {RELATIONS.map((r) => (
              <button key={r.rel} onClick={() => {
                setFamilyRelation(r.rel);
                setFamilyForm({ name: "", mobile: "", nid: "", sex: r.autoSex });
                setShowFamilyForm(true);
              }} style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer",
                border: "0.5px solid " + C.n[200], background: C.n[0], color: C.n[800],
                display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit",
              }}>
                <span style={{ fontSize: 13 }}>{r.icon}</span> Add {r.rel.toLowerCase()}
              </button>
            ))}
          </div>

          {/* Family member list */}
          <div style={{ background: C.n[0], border: "0.5px solid " + C.n[200], borderRadius: 10, padding: familyMembers.length > 0 ? "4px 16px" : 16 }}>
            {familyMembers.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px 0", color: C.n[500], fontSize: 12 }}>No family members added yet. Use the buttons above to add.</div>
            )}
            {familyMembers.map((fm, i) => {
              const relColors: Record<string, { bg: string; fg: string }> = {
                Spouse: { bg: C.danger[50], fg: C.danger[800] },
                Father: { bg: C.info[50], fg: C.info[800] },
                Mother: { bg: C.pri[50], fg: C.pri[600] },
                Brother: { bg: C.info[50], fg: C.info[800] },
                Sister: { bg: C.pri[50], fg: C.pri[600] },
                Son: { bg: C.warn[50], fg: C.warn[800] },
                Daughter: { bg: C.warn[50], fg: C.warn[800] },
              };
              const rc = relColors[fm.relation] || { bg: C.n[100], fg: C.n[800] };
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < familyMembers.length - 1 ? "0.5px solid " + C.n[200] : "none" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: rc.bg, color: rc.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500 }}>
                    {fm.name.charAt(0)}{fm.name.indexOf(" ") > 0 ? fm.name.charAt(fm.name.indexOf(" ") + 1) : ""}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{fm.name}</div>
                    <div style={{ fontSize: 10, color: C.n[600] }}>{fm.sex}{fm.mobile ? " · " + fm.mobile : ""}{fm.nid ? " · NID: " + fm.nid : ""}</div>
                  </div>
                  <Pill bg={rc.bg} fg={rc.fg}>{fm.relation}</Pill>
                  <button onClick={() => setFamilyMembers(familyMembers.filter((_, idx) => idx !== i))}
                    style={{ background: "none", border: "none", color: C.n[500], cursor: "pointer", fontSize: 14, padding: "2px 6px" }}>×</button>
                </div>
              );
            })}
          </div>

          {/* Add family member modal */}
          {showFamilyForm && (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
              onClick={() => setShowFamilyForm(false)}>
              <div onClick={(e) => e.stopPropagation()} style={{ width: 460, background: C.n[0], borderRadius: 14, border: "0.5px solid " + C.n[200], boxShadow: "0 12px 40px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "0.5px solid " + C.n[200], display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>Add {familyRelation.toLowerCase()}</div>
                    <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Fill in the details below</div>
                  </div>
                  <button onClick={() => setShowFamilyForm(false)} style={{ width: 28, height: 28, borderRadius: 6, border: "0.5px solid " + C.n[200], background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                </div>
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", marginBottom: 4 }}>Name</div>
                    <input value={familyForm.name} onChange={(e) => setFamilyForm(Object.assign({}, familyForm, { name: e.target.value }))}
                      placeholder="Full name" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: C.n[900] }} />
                  </div>
                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", marginBottom: 4 }}>Mobile (11 digit)</div>
                      <input value={familyForm.mobile} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); if (v.length <= 11) setFamilyForm(Object.assign({}, familyForm, { mobile: v })); }}
                        placeholder="01XXXXXXXXX" maxLength={11} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: C.n[900] }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", marginBottom: 4 }}>NID number</div>
                      <input value={familyForm.nid} onChange={(e) => setFamilyForm(Object.assign({}, familyForm, { nid: e.target.value.replace(/\D/g, "") }))}
                        placeholder="National ID" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: C.n[900] }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", marginBottom: 4 }}>Sex {familyForm.sex && <span style={{ fontSize: 9, color: C.pri[600], fontWeight: 400 }}>(auto-set from relation)</span>}</div>
                    <select value={familyForm.sex} onChange={(e) => setFamilyForm(Object.assign({}, familyForm, { sex: e.target.value }))}
                      style={{ width: "100%", padding: "8px 6px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: C.n[900] }}>
                      <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "0.5px solid " + C.n[200], background: C.n[50] }}>
                  <button onClick={() => setShowFamilyForm(false)} style={{ padding: "8px 20px", borderRadius: 8, border: "0.5px solid " + C.n[200], background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  <button onClick={() => {
                    if (familyForm.name.trim()) {
                      setFamilyMembers(familyMembers.concat([Object.assign({}, familyForm, { relation: familyRelation })]));
                      setShowFamilyForm(false);
                    }
                  }} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Add {familyRelation.toLowerCase()}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
