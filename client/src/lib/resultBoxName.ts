// What a result box of the Investigation popup is called — for a screen reader,
// and for someone speaking to the computer.
//
// The words on screen come first: the field and its unit, exactly as the
// catalog writes them ("Hb (g/dL)"). Someone using their voice says what they
// can see, so the name has to begin with it. The TEST comes after ("— CBC"),
// because the caption alone is very often not a name: 671 boxes in the catalog
// are captioned "Result" and 138 "Value", and "Organism" stands in six
// different cultures on one page.
//
// Until 2026-10-12 a number box had no name at all — only its unit as a
// placeholder, which goes at the first digit — and a list or a text box was
// named by its caption alone. Nothing here is new clinical wording: every word
// is the catalog's.
export function resultBoxName(testName: string, fieldLabel: string, unit?: string): string {
  return `${fieldLabel}${unit ? ` (${unit})` : ""} — ${testName}`;
}
