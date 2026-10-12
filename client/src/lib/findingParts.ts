import { INV_CATS } from "@/data/investigations";
import type { InvTest } from "@/types";

// A stored finding, as the Investigation popup's "Added results" panel shows it.
//
// A finding is stored as "dd/mm/yyyy:Test:value" — or "dd/mm/yyyy:free text" —
// and a test's value is its boxes joined by commas with no space
// ("Hb:13.5g/dL,WBC:12000": the storage protocol in client/CLAUDE.md). The
// panel shows the value with a space after each comma, to be read.
//
// ⚕️ It used to put that space after EVERY comma, the one inside a number too.
// A calculator's "ANC 1,500 cells/µL" was shown as "ANC 1, 500 cells/µL", and a
// platelet count typed the way it is written here — "1,50,000" — as
// "1, 50, 000": one number the doctor entered, shown as three. A value on this
// screen is shown exactly as it was typed (client/CLAUDE.md).
//
// The string alone cannot say which comma is which. The first attempt kept
// together whatever LOOKED like a grouped number — and so fused two parts into
// one: ETT's "METs:10" beside a report beginning "150 bpm" read
// "METs:10,150 bpm" (caught in the second review, before release). A guess
// that is right for one test is wrong for another, so there is no guess here.
// Only a test that HAS several boxes can hold several parts; the catalog says
// which those are, and everything else is one value, shown exactly as stored:
//   • a calculator's result — one sentence, with its own punctuation;
//   • a test with one box — one value, whatever commas the doctor typed in it;
//   • free text — the doctor's own words. Typed "Platelet: 1,50,000", its first
//     words are read as a test's name; no test is called that, and a name the
//     catalog does not have has never been a test with several boxes (below).
// A test with several boxes keeps the space after every comma, as it always
// has: there the comma between two boxes must never be lost, and a number typed
// with its groups is still set apart at them (DEFECT-INV-GROUPED in the test
// file; closing it needs the parts stored apart, not a cleverer reading).
//
// DISPLAY ONLY: the stored string is untouched, and so are the sidebar and the
// printed sheet, which never had the rule.

// The first place a name stands in the catalog, which is the one the popup's
// own lookups find. Two names stand twice (Beta-HCG, ECG); each has one box in
// both places, so the answer here is the same whichever is taken — pinned in
// the test file.
const TEST_BY_NAME = new Map<string, InvTest>();
for (const cat of INV_CATS) for (const t of cat.tests) if (!TEST_BY_NAME.has(t.name)) TEST_BY_NAME.set(t.name, t);

// Tests that HAD several boxes and no longer do. Their older stored values are
// box-joined parts ("Eye:4/4,Verbal:5/5,Motor:6/6") and stay set apart. Checked
// against every revision of the catalog on 2026-10-12: these two became
// calculators on 2026-06-17, and no test with several boxes has ever been
// removed or renamed. A test that leaves the catalog's several-box list in the
// future has to be added here — the test file fails until it is.
const ONCE_SEVERAL_BOXES = new Set(["GCS", "Child-Pugh"]);

/** Can a stored value under this name only ever be ONE part? `testName` is "" for free text. */
export function isOneValue(testName: string): boolean {
  if (!testName) return true;
  if (ONCE_SEVERAL_BOXES.has(testName)) return false;
  const test = TEST_BY_NAME.get(testName);
  if (!test) return true; // free text that had a colon in it, or a one-box test since removed
  if (test.calc) return true;
  return test.fields.length <= 1;
}

export interface ReadFinding {
  date: string;
  /** The test's name, or "" for free text. */
  test: string;
  /** The value exactly as stored — what an edit starts from and what is written back. */
  raw: string;
  /** The value as the panel shows it. */
  shown: string;
}

/** One stored finding, taken apart the way the "Added results" panel lays it out. */
export function readFinding(item: string): ReadFinding {
  const parts = item.split(":");
  const date = parts[0] || "";
  const test = parts.length >= 3 ? parts[1] : "";
  const raw = parts.length >= 3 ? parts.slice(2).join(":") : parts.slice(1).join(":");
  return { date, test, raw, shown: isOneValue(test) ? raw : raw.replace(/,(?=\S)/g, ", ") };
}
