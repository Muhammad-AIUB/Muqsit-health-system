import type { InvTest } from "@/types";

// A stored result, shown with room between its parts.
//
// A finding is stored as its parts joined by commas with no space
// ("Hb:13.5g/dL,WBC:12000" — the storage protocol in client/CLAUDE.md), and
// the Investigation popup's "Added results" panel shows it with a space after
// each comma, to be read.
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
// "METs:10,150 bpm", and G6PD's two boxes "100,150U/g Hb" (caught in the
// second review, before release). A guess that is right for one test is wrong
// for another, so there is no guess here. The CATALOG says which values can
// only ever be one part:
//   • a calculator's result — one sentence, with its own punctuation;
//   • a test with one box — one value, whatever commas the doctor typed in it;
//   • free text with no test — the doctor's own words.
// Those are shown exactly as stored. A test with several boxes keeps the space
// after every comma, as it always has: there the comma between two boxes must
// never be lost, and a number typed with its groups is still set apart at them
// (DEFECT-INV-GROUPED in the test file; closing it needs the parts stored
// apart, not a cleverer reading of the string).
//
// DISPLAY ONLY: the stored string is untouched, and so are the sidebar and the
// printed sheet, which never had the rule.

/**
 * Can a stored value of this test only ever be ONE part?
 * `testName` is "" for free text; `test` is the catalog's entry, if it has one.
 */
export function isOneValue(testName: string, test: Pick<InvTest, "calc" | "fields"> | null | undefined): boolean {
  if (!testName) return true;
  if (!test) return false; // a name the catalog does not have: unknown, so shown as it always was
  if (test.calc) return true;
  return (test.fields?.length ?? 0) <= 1;
}

/** `raw` as the panel shows it: untouched when it is one value, else a space after each comma. */
export function shownValue(raw: string, oneValue: boolean): string {
  return oneValue ? raw : raw.replace(/,(?=\S)/g, ", ");
}
