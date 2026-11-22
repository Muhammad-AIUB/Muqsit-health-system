// Whether the practice the user is working in has the MHS mark switched off
// (admin → account → Profile settings → "Remove MHS logo", physician's sheet,
// 16/11/2026). One answer for every place the mark is drawn — the app's header
// on a desktop, on a phone, and the foot of the printed prescription — so that
// they can never disagree about whose practice they are in.
//
// The setting is the PRACTICE's, not the signed-in user's: an assistant working
// in a doctor's practice sees what the doctor's patients see. Only an explicit
// `true` removes the mark: nothing known yet (the workstation list still
// loading, an older answer without the field), `false`, or anything else shows
// it, exactly as the app always has — a missing answer never takes a brand off.
// "By EXHORT" is not the MHS mark and is not governed by this.

export const hidesMhsLogo = (practice: { hideMhsLogo?: boolean } | null | undefined): boolean =>
  practice?.hideMhsLogo === true;
