"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { C, font } from "@/theme";
import { inputSm, fieldLabel } from "@/theme/styles";
import { useMuqsit } from "@/context/MuqsitContext";
import { patientsApi, type Patient } from "@/lib/api";
import { displayAge } from "@/lib/age";

// 3.docx mobile-first gate: the prescription's Mobile field doubles as a patient
// lookup. Typing a full number surfaces every patient on it; the doctor picks
// one (loads their record), adds a related family member, or creates a brand-new
// patient. Until one is chosen the rest of the prescription stays locked.

const RELATIONS = ["Son", "Daughter", "Spouse", "Father", "Mother", "Brother", "Sister"];
const cleanDigits = (v: string) => v.replace(/\D/g, "").slice(0, 11);

export default function MobileLookupField({ mobile }: { mobile?: boolean }) {
  const { ptPhone, setPtPhone, setPtInfo, loadPatient, currentPatientId } = useMuqsit();
  const [matches, setMatches] = useState<Patient[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<
    | { kind: "related"; anchor: Patient }
    | { kind: "new"; number: string }
    | null
  >(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const digits = cleanDigits(ptPhone);

  // Debounced exact lookup once a complete 11-digit number is present.
  useEffect(() => {
    if (digits.length < 11) { setMatches([]); return; }
    let cancel = false;
    setLoading(true);
    const t = setTimeout(() => {
      patientsApi
        .byMobile(digits)
        .then((rows) => { if (!cancel) { setMatches(rows); setOpen(true); } })
        .catch(() => { if (!cancel) setMatches([]); })
        .finally(() => { if (!cancel) setLoading(false); });
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [digits]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const onChange = (v: string) => {
    const d = cleanDigits(v);
    setPtPhone(d);
    setPtInfo((p) => ({ ...p, mobile: d }));
  };

  // The patient new family members are related to: the loaded one if it's on
  // this number, otherwise the first match.
  const anchor = matches.find((p) => p.id === currentPatientId) ?? matches[0] ?? null;

  return (
    <div ref={boxRef} style={{ flex: mobile ? "1 1 100%" : "0 0 150px", position: "relative" }}>
      <label style={fieldLabel}>Mobile</label>
      <input
        value={ptPhone}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (digits.length >= 11) setOpen(true); }}
        inputMode="tel"
        placeholder="01XXXXXXXXX"
        style={inputSm}
      />

      {open && digits.length >= 11 && (
        <div style={dropdown}>
          {loading && <div style={rowMuted}>Searching…</div>}
          {!loading && matches.map((p) => (
            <button key={p.id} onClick={() => { loadPatient(p); setOpen(false); }} style={rowBtn} type="button">
              <span style={{ fontWeight: 600, color: C.n[900], fontSize: 12.5 }}>{p.name}</span>
              <span style={{ fontSize: 11, color: C.n[500] }}>
                {p.mobile}
                {displayAge(p) ? ` · ${displayAge(p)}y` : ""}
                {p.sex ? ` · ${p.sex}` : ""}
              </span>
            </button>
          ))}
          {!loading && anchor && (
            <button onClick={() => { setModal({ kind: "related", anchor }); setOpen(false); }} style={rowAction} type="button">
              ＋ Add person related to {anchor.name}
            </button>
          )}
          {!loading && matches.length === 0 && (
            <button onClick={() => { setModal({ kind: "new", number: digits }); setOpen(false); }} style={rowAction} type="button">
              No patient on this number — <b style={{ marginLeft: 3 }}>Add New</b>
            </button>
          )}
        </div>
      )}

      {modal?.kind === "related" && (
        <AddRelatedModal
          anchor={modal.anchor}
          number={digits}
          onClose={() => setModal(null)}
          onDone={(p) => { setModal(null); loadPatient(p); }}
        />
      )}
      {modal?.kind === "new" && (
        <AddNewModal
          number={modal.number}
          onClose={() => setModal(null)}
          onDone={(p) => { setModal(null); loadPatient(p); }}
        />
      )}
    </div>
  );
}

// ── "Add person related to <anchor>" (image3) ───────────────────────────────
function AddRelatedModal({
  anchor, number, onClose, onDone,
}: { anchor: Patient; number: string; onClose: () => void; onDone: (p: Patient) => void }) {
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!name.trim()) return setErr("Enter the patient's name.");
    if (!relation) return setErr("Select the relationship.");
    setSaving(true); setErr("");
    try {
      const { newPatient } = await patientsApi.link({
        existingId: anchor.id, name: name.trim(), relation, mobile: number,
      });
      onDone(newPatient);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Add person related to ${anchor.name}`} onClose={onClose}>
      <Field label="Name of the patient">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" style={inputSm} />
      </Field>
      <div style={{ marginTop: 14 }}>
        <div style={{ ...fieldLabel, marginBottom: 8 }}>
          This patient is {anchor.name}&apos;s&nbsp;:
        </div>
        <RelationRadio value={relation} onChange={setRelation} />
      </div>
      {err && <div style={errBox}>{err}</div>}
      <ModalButtons saving={saving} onSave={save} onClose={onClose} />
    </ModalShell>
  );
}

// ── "No patient on this number — Add New" (image6) ──────────────────────────
function AddNewModal({
  number, onClose, onDone,
}: { number: string; onClose: () => void; onDone: (p: Patient) => void }) {
  const [name, setName] = useState("");
  const [notOwner, setNotOwner] = useState(false); // number doesn't belong to the patient
  const [ownerName, setOwnerName] = useState("");
  const [ownerSex, setOwnerSex] = useState("");
  const [relation, setRelation] = useState(""); // owner is patient's <relation>
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!name.trim()) return setErr("Enter the patient's name.");
    setSaving(true); setErr("");
    try {
      if (!notOwner) {
        // The number is the patient's own — straight create.
        const created = await patientsApi.create({ name: name.trim(), mobile: number });
        onDone(created);
        return;
      }
      if (!ownerName.trim()) { setErr("Enter the number owner's name."); setSaving(false); return; }
      if (!relation) { setErr("Select the owner's relationship to the patient."); setSaving(false); return; }
      // The treated patient — the number is a relative's, so store it as such.
      const patient = await patientsApi.create({
        name: name.trim(), relativeMobile: number, relativeRelation: relation,
      });
      // The number owner becomes a full patient on this number, linked both ways.
      await patientsApi.link({
        existingId: patient.id, name: ownerName.trim(), relation, mobile: number, sex: ownerSex || undefined,
      });
      const fresh = await patientsApi.get(patient.id);
      onDone(fresh);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Add new patient" onClose={onClose}>
      <Field label="Mobile no">
        <input value={number} readOnly style={{ ...inputSm, background: C.n[100], color: C.n[600] }} />
      </Field>
      <Field label="Name of the patient">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" style={inputSm} />
      </Field>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer", fontSize: 12, color: C.n[700] }}>
        <input type="checkbox" checked={notOwner} onChange={(e) => setNotOwner(e.target.checked)} style={{ accentColor: C.pri[400], width: 15, height: 15 }} />
        This number does not belong to the patient
      </label>

      {notOwner && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px dashed ${C.n[200]}` }}>
          <Field label="Whom this number belongs to">
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Number owner's name" style={inputSm} />
          </Field>
          <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "0 0 130px" }}>
              <div style={fieldLabel}>Their sex</div>
              <select value={ownerSex} onChange={(e) => setOwnerSex(e.target.value)} style={{ ...inputSm, cursor: "pointer" }}>
                <option value="">—</option>
                <option>Male</option>
                <option>Female</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ ...fieldLabel, marginBottom: 8 }}>The owner is the patient&apos;s&nbsp;:</div>
            <RelationRadio value={relation} onChange={setRelation} />
          </div>
        </div>
      )}

      {err && <div style={errBox}>{err}</div>}
      <ModalButtons saving={saving} onSave={save} onClose={onClose} />
    </ModalShell>
  );
}

// ── Small shared pieces ─────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,32,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: font, padding: 16 }}
    >
      <div style={{ background: C.n[0], borderRadius: 14, padding: 22, width: 440, maxWidth: "100%", boxShadow: "0 18px 50px rgba(0,0,0,0.25)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.n[900], marginBottom: 16 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 4 }}>
      <div style={fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

function RelationRadio({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {RELATIONS.map((r) => {
        const on = value === r;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            style={{
              padding: "6px 13px", borderRadius: 999, fontSize: 12, fontWeight: on ? 600 : 400,
              cursor: "pointer", fontFamily: font,
              border: `1px solid ${on ? C.pri[400] : C.n[200]}`,
              background: on ? C.pri[50] : C.n[0],
              color: on ? C.pri[600] : C.n[700],
            }}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

function ModalButtons({ saving, onSave, onClose }: { saving: boolean; onSave: () => void; onClose: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
      <button type="button" onClick={onClose} disabled={saving} style={{ padding: "9px 20px", borderRadius: 9, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[700], fontSize: 13, cursor: "pointer", fontFamily: font }}>Cancel</button>
      <button type="button" onClick={onSave} disabled={saving} style={{ padding: "9px 24px", borderRadius: 9, border: "none", background: saving ? C.pri[600] : C.pri[400], color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: font }}>{saving ? "Saving…" : "Save"}</button>
    </div>
  );
}

const dropdown: React.CSSProperties = {
  position: "absolute", top: "100%", left: 0, minWidth: 230, marginTop: 4, zIndex: 50,
  background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10,
  boxShadow: "0 10px 30px rgba(0,0,0,0.14)", overflow: "hidden",
};
const rowBtn: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, width: "100%",
  padding: "9px 13px", border: "none", borderBottom: `0.5px solid ${C.n[100]}`,
  background: C.n[0], cursor: "pointer", textAlign: "left", fontFamily: font,
};
const rowAction: React.CSSProperties = {
  display: "flex", alignItems: "center", width: "100%", padding: "9px 13px", border: "none",
  background: C.pri[50], color: C.pri[700], cursor: "pointer", textAlign: "left",
  fontSize: 12, fontWeight: 500, fontFamily: font,
};
const rowMuted: React.CSSProperties = { padding: "9px 13px", fontSize: 12, color: C.n[500] };
const errBox: React.CSSProperties = {
  marginTop: 12, fontSize: 12, color: C.danger[800], background: C.danger[50],
  border: `1px solid ${C.danger[100]}`, borderRadius: 8, padding: "8px 12px",
};
