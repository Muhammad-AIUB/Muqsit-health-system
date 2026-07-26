// Patient sex — one term, one vocabulary, and never a guess.
//
// "Sex" is the term throughout: it is the biological attribute that drives
// reference ranges (Hb, creatinine, eGFR) and weight/sex-dependent dosing, it is
// what `Patient.sex` stores, and it is what the Patient Settings form and the
// IPD header already said. The prescription header used to say "Gender" for the
// same field, which is a different concept and invited exactly the kind of
// divergence this module exists to stop.
//
// The stored value is not consistent, and cannot be rewritten without touching
// live records, so this reads BOTH spellings that exist in the wild:
//   • full words  — MuqsitContext writes `gender: ptGender` ("Male"/"Female"/"Other")
//                   onto the OPD queue row
//   • single letters — PatientsView writes `gender: "M"/"F"` onto the same column
// Readers that only tested `=== "F"` therefore showed a woman recorded as
// "Female" as **Male**, and the OPD row loaded that back into the editor.

export type Sex = "Male" | "Female" | "Other";

// Anything unrecognised — null, "", an old code we have never seen — returns "".
// It must never fall back to a sex: an unrecorded sex is a fact about the record,
// and inventing one puts a wrong reference range on a real patient.
export function normaliseSex(raw: string | null | undefined): Sex | "" {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "";
  if (s === "m" || s === "male") return "Male";
  if (s === "f" || s === "female") return "Female";
  if (s === "o" || s === "other") return "Other";
  return "";
}

// For display where a blank would read as a layout bug rather than "not recorded".
export function sexLabel(raw: string | null | undefined, fallback = "—"): string {
  return normaliseSex(raw) || fallback;
}
