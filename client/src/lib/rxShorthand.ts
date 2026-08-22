// Shared prescription shorthand parsers + medicine label, used by both the
// Drug history pad and the main ℞ editor.
import type { MedicineHit } from "@/lib/api";

// Suggestion / saved label: "Tablet. Napa 500mg"
export const fmtMedicine = (m: MedicineHit) =>
  [m.dosageForm ? `${m.dosageForm}.` : "", m.brandName, m.strength].filter(Boolean).join(" ");

// A free-typed line that begins with a dosage form (full or short) is probably
// a drug we don't have in the database — e.g. "inj. Halopid", "tab Seclo".
// We offer to treat it as a medicine so it gets dose/food/duration columns.
const FORM_RE =
  /^\s*(tab|tablet|cap|capsule|syp|syr|syrup|inj|injection|susp|suspension|sol|solution|drop|drops|oint|ointment|cream|gel|lotion|spray|supp|suppository|inhaler|powder|sachet)\b/i;
export const looksLikeMedicine = (s: string) => FORM_RE.test(s.trim());

// The dot-less abbreviations the medicines table emits and doctors free-type
// ("inj. Halopid", "tab Seclo"). Mirrors FORM_ABBREV in
// server/src/rx-habits/normalise.ts — five entries duplicated rather than a
// shared package, because the three apps install separately.
const FORM_ABBREV = new Set(["tab", "cap", "inj", "syp", "syr", "susp"]);

/**
 * Split a printed medicine label into the three parts `fmtMedicine` joined it
 * from: the dosage form, the brand NAME, and the strength.
 * `Tablet. Napa 500 mg` → before `Tablet. `, name `Napa`, after ` 500 mg`.
 *
 * ⚕️ DISPLAY ONLY, and text-preserving by construction. The three pieces are
 * INDEX RANGES of the string passed in, so `before + name + after` is always
 * byte-identical to it — including every space. Nothing is reworded,
 * reordered, dropped or converted, so the printed prescription still shows
 * exactly what the doctor entered; the split only decides which part of it is
 * set in bold. A label this cannot read leaves `name` empty, and the caller
 * falls back to emphasising the whole line rather than none of it.
 *
 * The form rule is the structural one from
 * server/src/rx-habits/normalise.ts#splitForm: everything up to and including
 * the first `.`, provided that head carries no digit (so `Napa 0.5 mg` has no
 * form) and is at most four words (so a free-typed sentence is not swallowed).
 * The parenthesised qualifier comes with it — `Tablet (Enteric Coated).` is
 * not `Tablet.`, and `SC Injection.` is not `Injection.`.
 *
 * The strength is the trailing run beginning at the first token that starts
 * with a digit, or a trailing `N/A` (the medicines table's way of writing
 * "strength not recorded"). Never the FIRST token after the form: a medicine
 * always keeps a name, so `Tablet. 5-FU 500 mg` reads 5-FU as the name.
 */
export function splitDrugLabel(label: string): { before: string; name: string; after: string } {
  let formEnd = 0;
  const dot = label.indexOf(".");
  if (dot !== -1) {
    const head = label.slice(0, dot).trim();
    if (head && !/\d/.test(head) && head.split(/\s+/).length <= 4) formEnd = dot + 1;
  }
  if (formEnd === 0) {
    const abbrev = /^(\s*)([a-z]+)\s+(?=\S)/i.exec(label);
    if (abbrev && FORM_ABBREV.has(abbrev[2].toLowerCase())) formEnd = abbrev[1].length + abbrev[2].length;
  }

  const tokens: { start: number; text: string }[] = [];
  const word = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = word.exec(label.slice(formEnd))) !== null) tokens.push({ start: formEnd + m.index, text: m[0] });
  if (tokens.length === 0) return { before: label, name: "", after: "" };

  let strengthAt = -1;
  for (let i = 1; i < tokens.length; i++) {
    if (/^\d/.test(tokens[i].text) || /^n\/a$/i.test(tokens[i].text)) { strengthAt = i; break; }
  }
  const nameStart = tokens[0].start;
  let nameEnd = strengthAt === -1 ? label.length : tokens[strengthAt].start;
  while (nameEnd > nameStart && /\s/.test(label[nameEnd - 1])) nameEnd -= 1;

  return { before: label.slice(0, nameStart), name: label.slice(nameStart, nameEnd), after: label.slice(nameEnd) };
}

// ── Dose shorthand ──────────────────────────────────────────
//   101 → 1+0+1   220 → 2+2+0   203 → 2+0+3
//   320018 → 32+00+18   (6 digits = insulin units, 3 pairs)
//   .50.5 → 1/2+0+1/2    .5.5.5 → 1/2+1/2+1/2  (".5" = half)
export function parseDose(raw: string): string {
  const s = raw.trim();
  if (!s || s.includes("+")) return s;

  if (s.includes(".")) {
    // A plain SINGLE-DIGIT decimal ("1.5", "2.5", "0.25") is a literal dose, not
    // the multi-slot half shorthand — leave it unchanged. The integer part must
    // be a single digit so multi-digit compact schedules still tokenize: "10.5"
    // stays "1+0+1/2" (1 morning, 0 noon, ½ night), NOT the literal 10.5. The
    // half-slot patterns starting with "." (e.g. ".50.5") also fall through here.
    if (/^\d\.\d+$/.test(s)) return s;
    const useZeroHalf = s.startsWith("0.5");
    const tokens: string[] = [];
    let i = 0;
    while (i < s.length) {
      if (useZeroHalf && s.slice(i, i + 3) === "0.5") { tokens.push("1/2"); i += 3; }
      else if (s.slice(i, i + 2) === ".5") { tokens.push("1/2"); i += 2; }
      else if (/\d/.test(s[i])) { tokens.push(s[i]); i += 1; }
      else { i += 1; }
    }
    return tokens.length >= 2 ? tokens.join("+") : s;
  }

  if (/^\d+$/.test(s)) {
    if (s.length % 3 === 0) {
      const g = s.length / 3;
      return `${s.slice(0, g)}+${s.slice(g, 2 * g)}+${s.slice(2 * g)}`;
    }
    return s.split("").join("+");
  }
  return s;
}

// ── Duration shorthand: 7d → 7 days, c → Continue, 2m → 2 month
export function parseDuration(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (/^c$/i.test(s)) return "Continue";
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d+)\s*d$/i))) return `${m[1]} days`;
  if ((m = s.match(/^(\d+)\s*m$/i))) return `${m[1]} month`;
  if ((m = s.match(/^(\d+)\s*w$/i))) return `${m[1]} week`;
  return s;
}

// ── Food-relation shorthand ─────────────────────────────────
//   bm / ac → Before meal     am / pc → After meal
//   no → (none)               wf → With food
//   2bm → 2 hr before meal    2bmam → 2 hr before or after meal
export function parseFood(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (/^no$/i.test(s)) return "";
  if (/^wf$/i.test(s)) return "With food";
  if (/^(bm|ac)$/i.test(s)) return "Before meal";
  if (/^(am|pc)$/i.test(s)) return "After meal";
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d+)\s*bmam$/i))) return `${m[1]} hr before or after meal`;
  if ((m = s.match(/^(\d+)\s*bm$/i))) return `${m[1]} hr before meal`;
  if ((m = s.match(/^(\d+)\s*am$/i))) return `${m[1]} hr after meal`;
  return s;
}

export const FOOD_HINT =
  "bm/ac=before meal · am/pc=after meal · 2bm=2hr before · 2bmam=2hr before/after · wf=with food · no=none";
