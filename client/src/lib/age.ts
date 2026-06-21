// Age display rules (3.docx):
//  • DOB present  → exact age from date of birth.
//  • Manual age   → the value entered is the age in `ageAsOfYear`; it ticks up
//                   by 1 every calendar year since (53 in 2024 → 55 in 2026).
// Returns "" when neither is known.

export function ageFromDob(dobIso: string | null | undefined, now = new Date()): number | null {
  if (!dobIso) return null;
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

// Manual age + how many years have passed since it was recorded.
export function incrementedAge(
  age: number | null | undefined,
  ageAsOfYear: number | null | undefined,
  now = new Date(),
): number | null {
  if (age == null) return null;
  if (!ageAsOfYear) return age; // no base year ⇒ show as-is (legacy records)
  const bumped = age + (now.getFullYear() - ageAsOfYear);
  return bumped >= 0 ? bumped : age;
}

// Resolve the age to display for a patient-like record. DOB wins; otherwise the
// manual age auto-incremented from its base year.
export function displayAge(
  p: { dob?: string | null; age?: number | null; ageAsOfYear?: number | null },
  now = new Date(),
): string {
  const fromDob = ageFromDob(p.dob, now);
  if (fromDob != null) return String(fromDob);
  const inc = incrementedAge(p.age, p.ageAsOfYear, now);
  return inc != null ? String(inc) : "";
}
