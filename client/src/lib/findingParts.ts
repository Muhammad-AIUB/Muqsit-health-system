// A stored result, shown with room between its parts.
//
// A finding is stored as its parts joined by commas with no space
// ("Hb:13.5g/dL,WBC:12000" — the storage protocol in client/CLAUDE.md), and
// the Investigation popup's "Added results" panel shows it with a space after
// each of those commas, to be read.
//
// ⚕️ It used to put that space after EVERY comma, the one inside a number too.
// A calculator's "ANC 1,500 cells/µL" was shown as "ANC 1, 500 cells/µL", and a
// platelet count typed the way it is written here — "1,50,000" — as
// "1, 50, 000": one number the doctor entered, shown as three. A value on this
// screen is shown exactly as it was typed (client/CLAUDE.md), so a number
// WRITTEN as a grouped number keeps its commas as they are:
//   • groups of three after the first — 1,500 · 12,000 · 1,234,567
//   • or the lakh way — 1,50,000 · 12,34,567
// Nothing else between two digits counts. "BIRADS:4,2 cm mass" and
// "METs:10,3 mm" are two PARTS that happen to meet at digits, and without the
// space they would read as 4,2 and 10,3.
//
// DISPLAY ONLY, and it only ever adds a space: the stored string is untouched,
// and so is the sidebar and the printed sheet, which never had this rule.
//
// Written without a look-behind on purpose: Safari before 16.4 cannot parse
// one, and a script that does not parse takes the whole app down with it.

const GROUPED = /\d{1,3}(?:,\d{2,3})*,\d{3}(?!\d)/y;
const isDigit = (ch: string) => ch >= "0" && ch <= "9";

export function spacedParts(raw: string): string {
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    const prev = i > 0 ? raw[i - 1] : "";
    // A number starts here — not the middle of one, and not its decimals.
    if (isDigit(ch) && !isDigit(prev) && prev !== ".") {
      GROUPED.lastIndex = i;
      const grouped = GROUPED.exec(raw);
      if (grouped) {
        out += grouped[0];
        i += grouped[0].length;
        continue;
      }
    }
    out += ch;
    if (ch === "," && i + 1 < raw.length && !/\s/.test(raw[i + 1])) out += " ";
    i += 1;
  }
  return out;
}
