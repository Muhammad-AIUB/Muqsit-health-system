// A result box of the Investigation popup that takes its value in EITHER of
// two units (forty in the catalog: creatinine, bilirubin, glucose, the lipid
// profile, HBV DNA…). Typing in one fills in the other, and the doctor's
// preferred unit is the one that is recorded.
//
// ⚕️ The conversion used `parseFloat`, which reads as much of a text as LOOKS
// like a number and stops there. A viral load typed with its groups —
// "1,20,000" copies/mL — was converted from "1": recorded, shown and printed
// as "HBV DNA: 0.18IU/mL". "120,000" became 21.48 IU/mL, "1.2 x 10^5" became
// 0.21, a creatinine typed "1,2" mg/dL became 88.42 umol/L. The number in the
// record was not the number typed, and nothing on the screen said so (found
// in the fifth review; in production until 2026-10-12).
//
// Two rules, and neither reads a comma — what a typed comma MEANS is still
// the physician's to say (FUNCTIONAL-AUDIT.md):
//   • only a whole, plain number is converted;
//   • what is not converted is recorded exactly as it was typed, in the unit
//     of the box it was typed in. Never a conversion of a part of it, and
//     never nothing at all.

// A number as it is typed, whole, and nothing else: digits with at most one
// point — "12", "12.5", ".5", and "12." on the way to 12.5.
const PLAIN_NUMBER = /^\s*(?:\d+\.?\d*|\.\d+)\s*$/;

/**
 * What typing `typed` into one unit's box puts into the other's: its value
 * times the catalog's own `factor`, to two places as it always was — or
 * nothing, when `typed` is not one plain number or the catalog has no factor.
 */
export function otherUnit(typed: string, factor: number | undefined): string {
  if (!factor || !PLAIN_NUMBER.test(typed)) return "";
  return (Math.round(parseFloat(typed) * factor * 100) / 100).toString();
}

/**
 * What is recorded for a box: the value in the doctor's preferred unit when
 * that box holds one, otherwise what stands in the other box, with ITS unit.
 * Null when nothing was typed in either. (`second` is absent for a box with
 * one unit.)
 */
export function recordedValue(
  first: { value?: string; unit?: string },
  second: { value?: string; unit?: string } | null,
  preferSecond: boolean,
): { value: string; unit: string } | null {
  const a = { value: first.value ?? "", unit: first.unit ?? "" };
  const b = { value: second?.value ?? "", unit: second?.unit ?? "" };
  // (For a box with one unit `b` is empty, so a leftover preference for a
  // second unit changes nothing: the first is what is found.)
  const [wanted, other] = preferSecond ? [b, a] : [a, b];
  if (wanted.value) return wanted;
  return other.value ? other : null;
}
