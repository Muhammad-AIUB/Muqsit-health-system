"use client";

// Print-friendly account record. Opened in a new tab from the "View details"
// button in the accounts table; the admin uses the browser's Print → "Save as
// PDF" to produce the PDF. Everything outside `.doc` is hidden when printing.

import { useEffect, useState } from "react";
import { adminApi, ApiError, PROFESSION_LABELS, type Registration } from "@/lib/api";

const C = {
  pri: "#1D9E75",
  priDark: "#0F6E56",
  priLight: "#E1F5EE",
  border: "#E5E5E3",
  n500: "#999",
  n600: "#6B6B6B",
  n900: "#1A1A1A",
  blue: "#185FA5",
  blueLight: "#E6F1FB",
};

const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: "#FAEEDA", fg: "#854F0B" },
  approved: { bg: "#E1F5EE", fg: "#0F6E56" },
  suspended: { bg: "#EEEEEC", fg: "#6B6B6B" },
  rejected: { bg: "#FCEBEB", fg: "#A32D2D" },
};

export default function AccountRecordPage({ params }: { params: { id: string } }) {
  const [reg, setReg] = useState<Registration | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi
      .getRegistration(params.id)
      .then(setReg)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load account"));
  }, [params.id]);

  if (error) {
    return <div style={{ padding: 40, color: "#A32D2D", fontSize: 14 }}>{error}</div>;
  }
  if (!reg) {
    return <div style={{ padding: 40, color: C.n600, fontSize: 14 }}>Loading…</div>;
  }

  const badge = STATUS_BADGE[reg.approvalStatus] ?? STATUS_BADGE.pending;
  const profession = reg.profession ? PROFESSION_LABELS[reg.profession] ?? reg.profession : "—";

  const fields: { label: string; value: string | null }[] = [
    { label: "Full name", value: reg.name },
    { label: "Email", value: `${reg.email}${reg.emailVerified ? " (verified)" : " (unverified)"}` },
    { label: "Mobile", value: reg.mobile },
    { label: "Profession", value: profession },
    { label: "Registration / BMDC no", value: reg.registrationNo },
    { label: "NID no", value: reg.nidNo },
    { label: "Designation", value: reg.designation },
    { label: "Specialty", value: reg.specialty },
    { label: "Institution code", value: reg.institutionCode },
    { label: "Account tier", value: reg.accountTier },
    { label: "Signed up", value: new Date(reg.createdAt).toLocaleString() },
  ];

  const docs: { label: string; url: string | null }[] = [
    { label: "Profile picture", url: reg.profilePictureUrl },
    { label: "Registration / qualification certificate", url: reg.registrationCertUrl },
    { label: "NID — front", url: reg.nidFrontUrl },
    { label: "NID — back", url: reg.nidBackUrl },
    ...(reg.otherCertificates ?? []).map((c, i) => ({
      label: c.details ? `Other certificate — ${c.details}` : `Other certificate ${i + 1}`,
      url: c.url,
    })),
  ];

  return (
    <>
      <style>{printCss}</style>

      {/* Toolbar — hidden when printing. */}
      <div className="no-print" style={toolbar}>
        <button onClick={() => window.close()} style={ghostBtn}>← Close</button>
        <button onClick={() => window.print()} style={priBtn}>Print / Save as PDF</button>
      </div>

      <div className="doc" style={doc}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", borderBottom: `2px solid ${C.pri}`, paddingBottom: 16, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.priDark }}>Muqsit Health System</div>
            <div style={{ fontSize: 12, color: C.n600, marginTop: 2 }}>Account verification record</div>
          </div>
          {reg.profilePictureUrl ? (
            <img src={reg.profilePictureUrl} alt="" style={{ width: 72, height: 72, borderRadius: 10, objectFit: "cover", border: `1px solid ${C.border}` }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: 10, background: C.priLight, color: C.priDark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700 }}>
              {reg.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        {/* Name + status */}
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 22, color: C.n900, margin: 0 }}>{reg.name}</h1>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <span style={{ ...pill, background: badge.bg, color: badge.fg }}>{reg.approvalStatus}</span>
            <span style={{ ...pill, background: reg.accountTier === "secondary" ? C.blueLight : C.priLight, color: reg.accountTier === "secondary" ? C.blue : C.priDark }}>{reg.accountTier}</span>
            {reg.deletedAt && <span style={{ ...pill, background: "#FCEBEB", color: "#A32D2D" }}>in trash</span>}
          </div>
        </div>

        {/* Submitted information */}
        <h2 style={sectionH}>Submitted information</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 32px", marginBottom: 8 }}>
          {fields.map((f) => (
            <div key={f.label}>
              <div style={{ fontSize: 11, color: C.n500, textTransform: "uppercase", letterSpacing: "0.04em" }}>{f.label}</div>
              <div style={{ fontSize: 14, color: C.n900, marginTop: 2 }}>{f.value ?? "—"}</div>
            </div>
          ))}
        </div>

        {reg.rejectionReason && (
          <div style={{ marginTop: 14, fontSize: 13, color: "#A32D2D", background: "#FCEBEB", borderRadius: 8, padding: "10px 12px" }}>
            Rejection reason: {reg.rejectionReason}
          </div>
        )}

        {/* Documents */}
        <h2 style={{ ...sectionH, marginTop: 28 }}>Uploaded documents</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {docs.map((d, i) => (
            <div key={i} style={{ breakInside: "avoid" }}>
              <div style={{ fontSize: 12, color: C.n600, marginBottom: 6, fontWeight: 500 }}>{d.label}</div>
              {d.url ? (
                <img src={d.url} alt={d.label} style={{ width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fafafa" }} />
              ) : (
                <div style={{ height: 120, borderRadius: 8, border: `1px dashed ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.n500, fontSize: 12 }}>Not provided</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.n500 }}>
          Generated {new Date().toLocaleString()} · Muqsit Health System Admin
        </div>
      </div>
    </>
  );
}

const printCss = `
  @page { size: A4; margin: 14mm; }
  @media print {
    .no-print { display: none !important; }
    .doc { box-shadow: none !important; margin: 0 !important; max-width: none !important; padding: 0 !important; }
    body { background: #fff !important; }
  }
`;

const toolbar: React.CSSProperties = {
  position: "sticky",
  top: 0,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 20px",
  background: "#fff",
  borderBottom: `1px solid ${C.border}`,
  zIndex: 10,
};
const doc: React.CSSProperties = {
  maxWidth: 800,
  margin: "24px auto",
  background: "#fff",
  borderRadius: 12,
  border: `1px solid ${C.border}`,
  padding: 32,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};
const sectionH: React.CSSProperties = { fontSize: 13, color: C.n600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 14, fontWeight: 600 };
const pill: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, padding: "3px 11px", borderRadius: 999 };
const ghostBtn: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.n900, fontSize: 13, fontWeight: 500, cursor: "pointer" };
const priBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
