// Patient-privacy masking for the OPD prescription. The OPD print can hide the
// patient's identity (name + mobile). The chosen type + layout now live on the
// server (PrescriptionLayout.rxType / opdLayout) — see prescriptionLayoutApi.

export type RxType = "opd" | "ipd";
export type OpdLayout = "single" | "extra";

// Show every other letter, each one always followed by a star (so the result
// ends in a star too) — "hasan" → "h*s*n*". Spaces are kept and don't count
// toward the alternation, so "Md Hasan" → "M* H*s*n*".
export function maskName(name: string): string {
  let i = 0;
  let out = "";
  for (const ch of name) {
    if (/\s/.test(ch)) {
      out += ch;
      continue;
    }
    if (i % 2 === 0) out += `${ch}*`;
    i += 1;
  }
  return out;
}

// Keep only the last 4 digits — "01712346951" → "******* 6951".
export function maskMobile(phone: string): string {
  const t = phone.trim();
  if (t.length <= 4) return t;
  const visible = t.slice(-4);
  const masked = t.slice(0, -4).replace(/\S/g, "*");
  return `${masked} ${visible}`;
}
