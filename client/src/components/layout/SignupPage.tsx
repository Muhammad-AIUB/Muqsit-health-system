"use client";

import { useMemo, useState } from "react";
import { C, font } from "@/theme";
import { inputSm } from "@/theme/styles";
import { useAuth } from "@/context/AuthContext";
import { ApiError, authApi, uploadImage, type Profession, type RegisterInput } from "@/lib/api";

// ── Profession metadata (drives conditional fields) ──────────
const PROFESSIONS: { value: Profession; label: string }[] = [
  { value: "doctor", label: "Doctor" },
  { value: "intern_doctor", label: "Intern doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "medical_technologist", label: "Medical technologist" },
  { value: "computer_operator", label: "Doctor's computer operator (other than medical profession)" },
];

const regNoLabel = (p: Profession | ""): string | null => {
  switch (p) {
    case "doctor":
      return "BMDC registration no";
    case "intern_doctor":
      return "BMDC temporary registration no";
    case "nurse":
    case "medical_technologist":
      return "Your professional registration No";
    default:
      return null; // computer_operator → no registration number
  }
};

const docLabel = (p: Profession | ""): string => {
  switch (p) {
    case "doctor":
      return "BMDC certificate";
    case "intern_doctor":
      return "BMDC temporary registration certificate";
    case "nurse":
    case "medical_technologist":
      return "Professional registration certificate";
    case "computer_operator":
      return "Highest professional qualification certificate";
    default:
      return "Document / certificate";
  }
};

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const labelStyle = { fontSize: 12, color: C.n[600], display: "block", marginBottom: 5 } as const;
const fieldStyle = { ...inputSm, padding: "10px 14px", fontSize: 13 } as const;
const groupStyle = { marginBottom: 14 } as const;

export default function SignupPage({ onBack }: { onBack: () => void }) {
  const { register } = useAuth();
  const [step, setStep] = useState<"form" | "otp" | "done">("form");

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [profession, setProfession] = useState<Profession | "">("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [nidNo, setNidNo] = useState("");
  const [designation, setDesignation] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [password, setPassword] = useState("");
  const [retype, setRetype] = useState("");

  // Uploaded URLs
  const [registrationCertUrl, setRegistrationCertUrl] = useState("");
  const [nidFrontUrl, setNidFrontUrl] = useState("");
  const [nidBackUrl, setNidBackUrl] = useState("");
  const [profilePictureUrl, setProfilePictureUrl] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // OTP step
  const [otp, setOtp] = useState("");
  const [otpMsg, setOtpMsg] = useState("");

  const needsRegNo = profession !== "" && profession !== "computer_operator";
  const passwordOk = PASSWORD_RE.test(password);
  const mismatch = retype.length > 0 && password !== retype;

  const validate = (): string | null => {
    if (!name.trim()) return "Name is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "A valid email is required";
    if (!/^\d{11}$/.test(mobile)) return "Mobile number must be exactly 11 digits";
    if (!profession) return "Please select what you are";
    if (needsRegNo && !registrationNo.trim()) return `${regNoLabel(profession)} is required`;
    if (!nidNo.trim()) return "NID number is required";
    if (!registrationCertUrl) return `Please upload your ${docLabel(profession).toLowerCase()}`;
    if (!nidFrontUrl) return "Please upload the front of your NID";
    if (!nidBackUrl) return "Please upload the back of your NID";
    if (!designation.trim()) return "Designation is required";
    if (!specialty.trim()) return "Specialty is required";
    if (!profilePictureUrl) return "Please add your profile picture";
    if (!passwordOk)
      return "Password must be 8+ chars with uppercase, lowercase, a number and a special character";
    if (password !== retype) return "Passwords do not match";
    return null;
  };

  const submit = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const input: RegisterInput = {
        name: name.trim(),
        email: email.trim(),
        mobile,
        profession: profession as Profession,
        registrationNo: needsRegNo ? registrationNo.trim() : undefined,
        nidNo: nidNo.trim(),
        designation: designation.trim(),
        specialty: specialty.trim(),
        password,
        registrationCertUrl,
        nidFrontUrl,
        nidBackUrl,
        profilePictureUrl,
      };
      await register(input);
      setStep("otp");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Is the API running?");
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await authApi.verifyEmail(email.trim(), otp);
      setOtpMsg(res.message);
      setStep("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError("");
    setOtpMsg("");
    try {
      const res = await authApi.resendOtp(email.trim());
      setOtpMsg(res.message);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not resend code.");
    }
  };

  return (
    <div style={{ fontFamily: font, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: `radial-gradient(1200px 600px at 50% -10%, ${C.pri[50]} 0%, transparent 60%), linear-gradient(160deg, ${C.n[50]} 0%, #eef6f2 100%)`, padding: 32 }}>
      <div style={{ width: 720, maxWidth: "100%", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 24, padding: "12px 20px", background: C.n[0], borderRadius: 12, border: `0.5px solid ${C.n[200]}` }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 600 }}>M+</div>
          <span style={{ fontSize: 22, fontWeight: 500, color: C.n[900], letterSpacing: "-0.02em" }}>Muqsit Health System</span>
        </div>

        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 14, padding: 28, textAlign: "left" }}>
          {step === "form" && (
            <>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: C.n[900], margin: "0 0 4px" }}>Create your account</h2>
              <p style={{ fontSize: 12, color: C.n[600], margin: "0 0 18px" }}>Register as a healthcare professional</p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 18px" }}>
                <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "center", marginBottom: 6 }}>
                  <FileField label="Add your profile picture" value={profilePictureUrl} onUploaded={setProfilePictureUrl} onError={setError} center />
                </div>

                <div style={{ ...groupStyle, gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Rahman" style={fieldStyle} />
                </div>

                <div style={{ ...groupStyle, gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Email address</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="doctor@clinic.com" style={fieldStyle} />
                  <span style={{ fontSize: 10, color: C.n[500] }}>We&apos;ll email a verification code after you submit.</span>
                </div>

                <div style={groupStyle}>
                  <label style={labelStyle}>Mobile number</label>
                  <input
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    inputMode="numeric"
                    placeholder="your 11 digit mob no"
                    style={{ ...fieldStyle, borderColor: mobile.length > 0 && mobile.length !== 11 ? C.danger[400] : (inputSm.border as string) }}
                  />
                  {mobile.length > 0 && (
                    <span style={{ fontSize: 10, color: mobile.length === 11 ? C.pri[600] : C.warn[800] }}>
                      {mobile.length === 11 ? "✓ Looks good" : `Must be exactly 11 digits (${mobile.length}/11)`}
                    </span>
                  )}
                </div>

                <div style={groupStyle}>
                  <label style={labelStyle}>Are you</label>
                  <select value={profession} onChange={(e) => setProfession(e.target.value as Profession | "")} style={{ ...fieldStyle, cursor: "pointer" }}>
                    <option value="">Select…</option>
                    {PROFESSIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                {needsRegNo && (
                  <div style={groupStyle}>
                    <label style={labelStyle}>{regNoLabel(profession)}</label>
                    <input value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} placeholder={regNoLabel(profession) ?? ""} style={fieldStyle} />
                  </div>
                )}

                <FileField
                  label={`Upload ${docLabel(profession)}`}
                  value={registrationCertUrl}
                  onUploaded={setRegistrationCertUrl}
                  onError={setError}
                />

                <div style={{ ...groupStyle, gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>NID number</label>
                  <input value={nidNo} onChange={(e) => setNidNo(e.target.value)} placeholder="National ID number" style={fieldStyle} />
                </div>

                <FileField label="NID front" value={nidFrontUrl} onUploaded={setNidFrontUrl} onError={setError} />
                <FileField label="NID back" value={nidBackUrl} onUploaded={setNidBackUrl} onError={setError} />

                <div style={groupStyle}>
                  <label style={labelStyle}>Designation</label>
                  <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Professor, Medical Officer" style={fieldStyle} />
                </div>

                <div style={groupStyle}>
                  <label style={labelStyle}>Specialty</label>
                  <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="e.g. Hepatology / General practitioner" style={fieldStyle} />
                </div>

                <div style={groupStyle}>
                  <label style={labelStyle}>Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" style={fieldStyle} />
                  {password.length > 0 && (
                    <span style={{ fontSize: 10, color: passwordOk ? C.pri[600] : C.warn[800] }}>
                      {passwordOk ? "✓ Strong password" : "Must include uppercase, lowercase, number & special character (min 8)"}
                    </span>
                  )}
                </div>

                <div style={groupStyle}>
                  <label style={labelStyle}>Retype password</label>
                  <input type="password" value={retype} onChange={(e) => setRetype(e.target.value)} placeholder="Re-enter password" style={{ ...fieldStyle, borderColor: mismatch ? C.danger[400] : (inputSm.border as string) }} />
                  {mismatch && <span style={{ fontSize: 10, color: C.danger[800] }}>Passwords do not match</span>}
                </div>

              </div>

              {error && (
                <div style={{ fontSize: 11, color: C.danger[800], background: C.danger[50], border: `0.5px solid ${C.danger[100]}`, borderRadius: 8, padding: "8px 12px", margin: "14px 0" }}>{error}</div>
              )}

              <button onClick={submit} disabled={loading} style={{ width: "100%", marginTop: 8, padding: "12px 20px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 14, fontWeight: 500, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1 }}>
                {loading ? "Submitting…" : "Create account"}
              </button>

              <div style={{ textAlign: "center", fontSize: 11, color: C.n[600], marginTop: 16 }}>
                Already have an account? <span onClick={onBack} style={{ color: C.pri[400], cursor: "pointer", fontWeight: 500 }}>Sign in</span>
              </div>
            </>
          )}

          {step === "otp" && (
            <>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: C.n[900], margin: "0 0 4px" }}>Verify your email</h2>
              <p style={{ fontSize: 12, color: C.n[600], margin: "0 0 18px" }}>Enter the 6-digit code sent to <b>{email}</b>.</p>
              <div style={groupStyle}>
                <label style={labelStyle}>Verification code</label>
                <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="••••••" style={{ ...fieldStyle, letterSpacing: 8, textAlign: "center", fontSize: 18 }} />
              </div>
              {otpMsg && <div style={{ fontSize: 11, color: C.pri[600], marginBottom: 10 }}>{otpMsg}</div>}
              {error && <div style={{ fontSize: 11, color: C.danger[800], background: C.danger[50], border: `0.5px solid ${C.danger[100]}`, borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>{error}</div>}
              <button onClick={verify} disabled={loading || otp.length !== 6} style={{ width: "100%", padding: "12px 20px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 14, fontWeight: 500, cursor: loading ? "default" : "pointer", opacity: loading || otp.length !== 6 ? 0.6 : 1 }}>
                {loading ? "Verifying…" : "Verify email"}
              </button>
              <div style={{ textAlign: "center", fontSize: 11, color: C.n[600], marginTop: 16 }}>
                Didn&apos;t get it? <span onClick={resend} style={{ color: C.pri[400], cursor: "pointer", fontWeight: 500 }}>Resend code</span>
              </div>
            </>
          )}

          {step === "done" && (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.pri[50], color: C.pri[600], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 14px" }}>✓</div>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: C.n[900], margin: "0 0 8px" }}>Email verified</h2>
              <p style={{ fontSize: 12.5, color: C.n[600], lineHeight: 1.6 }}>{otpMsg || "Your account is awaiting admin approval. You'll be able to sign in once an administrator approves your documents."}</p>
              <button onClick={onBack} style={{ marginTop: 18, padding: "11px 24px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[900], fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                Back to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reusable image upload field ──────────────────────────────
function FileField({
  label,
  value,
  onUploaded,
  onError,
  optional,
  center,
}: {
  label: string;
  value: string;
  onUploaded: (url: string) => void;
  onError: (msg: string) => void;
  optional?: boolean;
  center?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    onError("");
    try {
      const url = await uploadImage(file);
      onUploaded(url);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  // ── Centered circular avatar uploader (e.g. profile picture) ──
  if (center) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <label
          style={{
            position: "relative",
            width: 88,
            height: 88,
            borderRadius: "50%",
            border: `2px dashed ${value ? C.pri[400] : C.n[300]}`,
            background: value ? "transparent" : C.n[50],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            overflow: "hidden",
          }}
        >
          {value ? (
            <img src={value} alt="profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 26, color: C.n[500] }}>{busy ? "…" : "📷"}</span>
          )}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={onChange} disabled={busy} />
        </label>
        <span style={{ fontSize: 11, color: value ? C.pri[600] : C.n[600], fontWeight: 500 }}>
          {busy ? "Uploading…" : value ? "✓ Change photo" : label}
          {optional && !value && <span style={{ color: C.n[500], fontWeight: 400 }}> (optional)</span>}
        </span>
      </div>
    );
  }

  return (
    <div style={groupStyle}>
      <label style={labelStyle}>
        {label}
        {optional && <span style={{ color: C.n[500], fontWeight: 400 }}> (optional)</span>}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8, border: `0.5px dashed ${value ? C.pri[400] : C.n[300]}`, background: value ? C.pri[50] : C.n[50], color: value ? C.pri[600] : C.n[600], fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
          {busy ? "Uploading…" : value ? "✓ Uploaded — replace" : "Choose image"}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={onChange} disabled={busy} />
        </label>
        {value && <img src={value} alt="preview" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 6, border: `0.5px solid ${C.n[200]}` }} />}
      </div>
    </div>
  );
}
