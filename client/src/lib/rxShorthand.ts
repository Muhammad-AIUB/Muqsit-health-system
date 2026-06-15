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

// ── Dose shorthand ──────────────────────────────────────────
//   101 → 1+0+1   220 → 2+2+0   203 → 2+0+3
//   320018 → 32+00+18   (6 digits = insulin units, 3 pairs)
//   .50.5 → 1/2+0+1/2    .5.5.5 → 1/2+1/2+1/2  (".5" = half)
export function parseDose(raw: string): string {
  const s = raw.trim();
  if (!s || s.includes("+")) return s;

  if (s.includes(".")) {
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
