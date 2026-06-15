// Prescription "type" (OPD / IPD) and the patient-privacy masking used by the
// OPD prescription. OPD prints hide the patient's identity — name and mobile
// are partially starred so a shared/queue prescription does not expose who the
// patient is. The choice is made on the Prescription settings page and stored
// locally so the print/preview can read it without a round-trip.

export type RxType = "opd" | "ipd";

export const RX_TYPE_KEY = "mhs_rx_type";

// IPD (full patient details) is the default — it matches the existing behaviour.
export function getRxType(): RxType {
  if (typeof window === "undefined") return "ipd";
  return window.localStorage.getItem(RX_TYPE_KEY) === "opd" ? "opd" : "ipd";
}

export function setRxType(t: RxType): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RX_TYPE_KEY, t);
}

// OPD print layout:
//   "single" → one full page (real name, full clinical assessment).
//   "extra"  → that full page PLUS a second privacy page where the patient's
//              identity is masked and the clinical assessment is hidden, so it
//              can be handed to a pharmacy/lab without exposing who/what.
export type OpdLayout = "single" | "extra";

export const OPD_LAYOUT_KEY = "mhs_opd_layout";

export function getOpdLayout(): OpdLayout {
  if (typeof window === "undefined") return "single";
  return window.localStorage.getItem(OPD_LAYOUT_KEY) === "extra" ? "extra" : "single";
}

export function setOpdLayout(l: OpdLayout): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OPD_LAYOUT_KEY, l);
}

// Show every other letter, each one always followed by a star (so the result
// ends in a star too) — "hasan" → "h*s*n*". The hidden letters are dropped and
// represented by that trailing star. Spaces are kept and don't count toward the
// alternation, so "Md Hasan" → "M* H*s*n*".
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
