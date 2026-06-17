"use client";

import { useEffect, useMemo, useState } from "react";
import { C, font } from "@/theme";
import { inputSm } from "@/theme/styles";
import {
  ApiError,
  usersApi,
  type ChamberInput,
  type OtherCertificateInput,
  type ProfileMe,
  type ProfileUpdateInput,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useImageUpload } from "@/hooks/useImageUpload";

// BMDC (registrationNo / registrationCertUrl) and name are intentionally not
// in the draft — they're shown read-only from the original profile and no
// one (not even an admin) can change them after registration.
type Draft = {
  displayName: string;
  email: string;
  mobile: string;
  nidNo: string;
  designation: string;
  specialty: string;
  profilePictureUrl: string;
  nidFrontUrl: string;
  nidBackUrl: string;
  otherCertificates: OtherCertificateInput[];
  chambers: ChamberInput[];
};

const fromProfile = (p: ProfileMe): Draft => ({
  displayName: p.displayName ?? "",
  email: p.email ?? "",
  mobile: p.mobile ?? "",
  nidNo: p.nidNo ?? "",
  designation: p.designation ?? "",
  specialty: p.specialty ?? "",
  profilePictureUrl: p.profilePictureUrl ?? "",
  nidFrontUrl: p.nidFrontUrl ?? "",
  nidBackUrl: p.nidBackUrl ?? "",
  otherCertificates: p.otherCertificates.map((c) => ({
    id: c.id,
    url: c.url,
    details: c.details ?? "",
  })),
  chambers: p.chambers.map((c) => ({
    id: c.id,
    address: c.address,
    mapLink: c.mapLink ?? "",
  })),
});

// Only send fields that actually changed. Cuts wire size and avoids
// race-clobbering a value the user didn't touch.
const diff = (cur: Draft, orig: Draft): ProfileUpdateInput => {
  const out: ProfileUpdateInput = {};
  if (cur.displayName !== orig.displayName) out.displayName = cur.displayName;
  if (cur.email !== orig.email) out.email = cur.email;
  if (cur.mobile !== orig.mobile) out.mobile = cur.mobile;
  if (cur.nidNo !== orig.nidNo) out.nidNo = cur.nidNo;
  if (cur.designation !== orig.designation) out.designation = cur.designation;
  if (cur.specialty !== orig.specialty) out.specialty = cur.specialty;
  if (cur.profilePictureUrl !== orig.profilePictureUrl) out.profilePictureUrl = cur.profilePictureUrl;
  if (cur.nidFrontUrl !== orig.nidFrontUrl) out.nidFrontUrl = cur.nidFrontUrl;
  if (cur.nidBackUrl !== orig.nidBackUrl) out.nidBackUrl = cur.nidBackUrl;
  // Ignore rows without an image yet (a fresh card the user hasn't uploaded
  // to) — the server requires a url, so they aren't saved until an image is
  // added, and they shouldn't mark the form dirty.
  const curCerts = cur.otherCertificates.filter((c) => c.url);
  const origCerts = orig.otherCertificates.filter((c) => c.url);
  const sameOtherCerts =
    curCerts.length === origCerts.length &&
    curCerts.every(
      (c, i) => c.url === origCerts[i].url && (c.details ?? "") === (origCerts[i].details ?? ""),
    );
  if (!sameOtherCerts) {
    out.otherCertificates = curCerts.map((c) => ({
      url: c.url,
      details: c.details?.trim() || undefined,
    }));
  }
  const sameChambers =
    cur.chambers.length === orig.chambers.length &&
    cur.chambers.every((c, i) => c.address === orig.chambers[i].address && (c.mapLink ?? "") === (orig.chambers[i].mapLink ?? ""));
  if (!sameChambers) {
    out.chambers = cur.chambers.map((c) => ({
      address: c.address.trim(),
      mapLink: c.mapLink?.trim() || undefined,
    }));
  }
  return out;
};

export default function ProfileSettingsView({ onBack }: { onBack: () => void }) {
  const { refreshUser } = useAuth();
  const [profile, setProfile] = useState<ProfileMe | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    usersApi
      .me()
      .then((p) => {
        setProfile(p);
        setDraft(fromProfile(p));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(() => {
    if (!profile || !draft) return false;
    return Object.keys(diff(draft, fromProfile(profile))).length > 0;
  }, [draft, profile]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setSuccess("");
  };

  const save = async () => {
    if (!profile || !draft) return;
    const payload = diff(draft, fromProfile(profile));
    if (Object.keys(payload).length === 0) return;
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const updated = await usersApi.update(payload);
      setProfile(updated);
      setDraft(fromProfile(updated));
      // Auth context caches { name, email, role } — pull it back in sync.
      await refreshUser();
      setSuccess("Saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (profile) setDraft(fromProfile(profile));
    setError("");
    setSuccess("");
  };

  if (loading || !draft || !profile) {
    return (
      <div style={{ fontFamily: font, padding: 40, color: C.n[500], fontSize: 13 }}>
        {error || "Loading profile…"}
      </div>
    );
  }

  const initials = profile.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{ fontFamily: font, maxWidth: 760 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <button onClick={onBack} style={btnBack}>← Back</button>
        <div style={{ fontSize: 16, fontWeight: 500 }}>Profile</div>
      </div>

      {/* ── Identity card (avatar + read-only name) ── */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <PhotoUploader
            value={draft.profilePictureUrl}
            onChange={(url) => set("profilePictureUrl", url)}
            onError={setError}
            fallback={initials}
          />
          <div style={{ flex: 1 }}>
            <Label>Name</Label>
            <input value={profile.name} disabled style={{ ...field, opacity: 0.7, cursor: "not-allowed" }} />
            <div style={{ marginTop: 10 }}>
              <Label>Display name <span style={{ color: C.n[500] }}>(used as the signature on printed prescriptions)</span></Label>
              <input
                value={draft.displayName}
                onChange={(e) => set("displayName", e.target.value)}
                placeholder={profile.name}
                style={field}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* ── Account ── */}
      <Section title="Account">
        <Row>
          <Field label="Email">
            <input value={draft.email} onChange={(e) => set("email", e.target.value)} style={field} />
          </Field>
          <Field label="Mobile">
            <input
              value={draft.mobile}
              onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 11))}
              inputMode="numeric"
              placeholder="11 digits"
              style={field}
            />
          </Field>
        </Row>
      </Section>

      {/* ── Professional registration ── */}
      <Section title="Professional registration">
        <Row>
          <Field label="BMDC no">
            <input
              value={profile.registrationNo ?? ""}
              disabled
              placeholder="—"
              style={{ ...field, opacity: 0.7, cursor: "not-allowed" }}
            />
          </Field>
          <Field label="BMDC certificate">
            <ReadOnlyDoc value={profile.registrationCertUrl} />
          </Field>
        </Row>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.n[800], marginBottom: 5 }}>Other certificates</div>
          {draft.otherCertificates.length === 0 && (
            <div style={{ fontSize: 11, color: C.n[500], marginTop: 4, marginBottom: 8 }}>
              Add any additional qualifications, training, or recognition you want shown on your profile.
              Each one has an image and a details note — add as many as you like.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
            {draft.otherCertificates.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  gap: 12,
                  padding: 10,
                  borderRadius: 10,
                  border: `0.5px solid ${C.n[200]}`,
                  background: C.n[50],
                }}
              >
                <CertImageUploader
                  value={c.url}
                  onChange={(url) => {
                    const next = [...draft.otherCertificates];
                    next[i] = { ...c, url };
                    set("otherCertificates", next);
                  }}
                  onError={setError}
                />
                <textarea
                  value={c.details ?? ""}
                  onChange={(e) => {
                    const next = [...draft.otherCertificates];
                    next[i] = { ...c, details: e.target.value };
                    set("otherCertificates", next);
                  }}
                  placeholder="Certificate details (e.g. MD Cardiology, BSMMU 2019)"
                  rows={3}
                  style={{ ...field, flex: 1, resize: "vertical", padding: "8px 12px", minHeight: 84 }}
                />
                <button
                  onClick={() =>
                    set(
                      "otherCertificates",
                      draft.otherCertificates.filter((_, idx) => idx !== i),
                    )
                  }
                  title="Remove certificate"
                  style={{ ...btnGhost, color: C.danger[800], borderColor: C.danger[100], alignSelf: "flex-start" }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              onClick={() => set("otherCertificates", [...draft.otherCertificates, { url: "", details: "" }])}
              style={{ ...btnGhost, padding: "9px 14px", alignSelf: "flex-start", borderStyle: "dashed" }}
            >
              + Add certificate
            </button>
          </div>
        </div>
      </Section>

      {/* ── National ID ── */}
      <Section title="National ID">
        <Field label="NID number">
          <input value={draft.nidNo} onChange={(e) => set("nidNo", e.target.value)} style={field} />
        </Field>
        <Row>
          <Field label="NID front">
            <DocUploader
              value={draft.nidFrontUrl}
              onChange={(url) => set("nidFrontUrl", url)}
              onError={setError}
              placeholder="Upload front"
            />
          </Field>
          <Field label="NID back">
            <DocUploader
              value={draft.nidBackUrl}
              onChange={(url) => set("nidBackUrl", url)}
              onError={setError}
              placeholder="Upload back"
            />
          </Field>
        </Row>
      </Section>

      {/* ── Role ── */}
      <Section title="Designation & specialty">
        <Row>
          <Field label="Designation">
            <input value={draft.designation} onChange={(e) => set("designation", e.target.value)} style={field} />
          </Field>
          <Field label="Specialty">
            <input value={draft.specialty} onChange={(e) => set("specialty", e.target.value)} style={field} />
          </Field>
        </Row>
      </Section>

      {/* ── Chambers ── */}
      <Section title="Chambers">
        {draft.chambers.length === 0 && (
          <div style={{ fontSize: 12, color: C.n[500], marginBottom: 10 }}>
            No chambers yet — add one to share your practice locations with patients.
          </div>
        )}
        {draft.chambers.map((c, i) => (
          <div
            key={i}
            style={{
              border: `0.5px solid ${C.n[200]}`,
              borderRadius: 10,
              padding: 14,
              marginBottom: 10,
              background: C.n[50],
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.n[600] }}>Chamber {i + 1}</div>
              <button
                onClick={() => set("chambers", draft.chambers.filter((_, idx) => idx !== i))}
                style={{ ...btnGhost, color: C.danger[800], borderColor: C.danger[100] }}
              >
                Remove
              </button>
            </div>
            <Field label="Address (details)">
              <textarea
                value={c.address}
                onChange={(e) => {
                  const next = [...draft.chambers];
                  next[i] = { ...c, address: e.target.value };
                  set("chambers", next);
                }}
                rows={2}
                style={{ ...field, resize: "vertical", padding: "10px 14px" }}
                placeholder="Building, road, area, city"
              />
            </Field>
            <Field label="Google map link">
              <input
                value={c.mapLink ?? ""}
                onChange={(e) => {
                  const next = [...draft.chambers];
                  next[i] = { ...c, mapLink: e.target.value };
                  set("chambers", next);
                }}
                style={field}
                placeholder="https://maps.google.com/…"
              />
            </Field>
          </div>
        ))}
        <button
          onClick={() => set("chambers", [...draft.chambers, { address: "", mapLink: "" }])}
          style={{ ...btnGhost, padding: "9px 14px" }}
        >
          + Add chamber
        </button>
      </Section>

      {/* ── Status messages ── */}
      {error && (
        <div style={{ ...statusBox, color: C.danger[800], background: C.danger[50], borderColor: C.danger[100] }}>
          {error}
        </div>
      )}
      {success && !error && (
        <div style={{ ...statusBox, color: C.pri[600], background: C.pri[50], borderColor: C.pri[100] }}>
          {success}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ position: "sticky", bottom: 0, background: C.n[50], padding: "14px 0", marginTop: 18, borderTop: `0.5px solid ${C.n[200]}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={cancel} disabled={saving || !dirty} style={{ ...btnGhost, padding: "10px 22px", opacity: !dirty ? 0.5 : 1 }}>
          Cancel
        </button>
        <button onClick={save} disabled={saving || !dirty} style={{ ...btnPri, opacity: saving || !dirty ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── Layout helpers ──────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.n[800], marginBottom: 12 }}>{title}</div>
      {children}
    </Card>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: C.n[600], marginBottom: 5 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// ── Image uploaders ─────────────────────────────────────────
function PhotoUploader({
  value,
  onChange,
  onError,
  fallback,
}: {
  value: string;
  onChange: (url: string) => void;
  onError: (msg: string) => void;
  fallback: string;
}) {
  const { busy, onPick } = useImageUpload(onChange, onError);

  return (
    <label
      style={{
        position: "relative",
        width: 84,
        height: 84,
        borderRadius: "50%",
        border: `2px dashed ${value ? C.pri[400] : C.n[300]}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        overflow: "hidden",
        background: C.n[50],
        flexShrink: 0,
      }}
    >
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ fontSize: 20, color: C.pri[600], fontWeight: 600 }}>{busy ? "…" : fallback}</span>
      )}
      <input type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} disabled={busy} />
    </label>
  );
}

// Read-only display for a document that the user is not allowed to change
// (e.g. the BMDC certificate verified at registration). Shows a thumbnail
// with a "View" link, or a "—" placeholder when nothing is on file.
function ReadOnlyDoc({ value }: { value: string | null }) {
  if (!value) {
    return (
      <div
        style={{
          padding: "9px 14px",
          borderRadius: 8,
          border: `0.5px solid ${C.n[200]}`,
          background: C.n[50],
          color: C.n[500],
          fontSize: 12,
        }}
      >
        Not on file
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 14px",
          borderRadius: 8,
          border: `0.5px solid ${C.n[200]}`,
          background: C.n[50],
          color: C.n[600],
          fontSize: 12,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        🔒 View certificate
      </a>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={value} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, border: `0.5px solid ${C.n[200]}` }} />
    </div>
  );
}

function DocUploader({
  value,
  onChange,
  onError,
  placeholder,
}: {
  value: string;
  onChange: (url: string) => void;
  onError: (msg: string) => void;
  placeholder: string;
}) {
  const { busy, onPick } = useImageUpload(onChange, onError);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 14px",
          borderRadius: 8,
          border: `0.5px dashed ${value ? C.pri[400] : C.n[300]}`,
          background: value ? C.pri[50] : C.n[50],
          color: value ? C.pri[600] : C.n[600],
          fontSize: 12,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {busy ? "Uploading…" : value ? "✓ Replace" : placeholder}
        <input type="file" accept="image/*" style={{ display: "none" }} onChange={onPick} disabled={busy} />
      </label>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <a href={value} target="_blank" rel="noreferrer">
          <img src={value} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, border: `0.5px solid ${C.n[200]}` }} />
        </a>
      )}
    </div>
  );
}

// Square image slot inside a certificate card. Empty → an upload dropzone;
// filled → a thumbnail. Clicking always opens the picker so the image can be
// replaced; a "View" link opens the full image in a new tab.
function CertImageUploader({
  value,
  onChange,
  onError,
}: {
  value: string;
  onChange: (url: string) => void;
  onError: (msg: string) => void;
}) {
  const { busy, onPick } = useImageUpload(onChange, onError);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
      <label
        title={value ? "Replace image" : "Upload image"}
        style={{
          position: "relative",
          width: 84,
          height: 84,
          borderRadius: 8,
          border: `0.5px ${value ? "solid" : "dashed"} ${value ? C.n[200] : C.n[300]}`,
          background: C.n[0],
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: busy ? "default" : "pointer",
          overflow: "hidden",
        }}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: busy ? 0.5 : 1 }} />
        ) : (
          <span style={{ fontSize: 11, color: C.pri[600], fontWeight: 500, textAlign: "center", padding: 4 }}>
            {busy ? "Uploading…" : "+ Upload image"}
          </span>
        )}
        <input type="file" accept="image/*" style={{ display: "none" }} onChange={onPick} disabled={busy} />
      </label>
      {value && (
        <a href={value} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: C.n[600], textDecoration: "none" }}>
          View
        </a>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────
const field: React.CSSProperties = { ...inputSm, padding: "10px 14px", fontSize: 13, width: "100%", boxSizing: "border-box" };
const btnPri: React.CSSProperties = { padding: "10px 22px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "7px 12px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[800], fontSize: 12, fontWeight: 500, cursor: "pointer" };
const btnBack: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[800], fontSize: 12, fontWeight: 500, cursor: "pointer" };
const statusBox: React.CSSProperties = { fontSize: 12, padding: "10px 12px", borderRadius: 8, border: "0.5px solid", marginTop: 14 };
