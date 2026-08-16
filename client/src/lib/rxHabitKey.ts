// Client-side mirror of `normaliseDrugKey` from
// `server/src/rx-habits/normalise.ts`. BOTH FILES MUST BE EDITED TOGETHER.
//
// WHY A COPY EXISTS AT ALL. When the doctor clicks a habit suggestion, the row
// has to carry the medicine's GENERIC name or drug-drug prescribing alerts go
// blind on the fastest path through the editor (`RxItem.generic` is not
// persisted, so a habit learned from history can never bring one of its own).
// The fix is to match the habit against the medicine results already loaded for
// the same query — no new request, no new storage — and that match has to be on
// the normalised key, because a raw label comparison breaks on a space
// ("500 mg"), a case difference, a dropped "n/a" or a form qualifier, and every
// one of those misses silently removes a safety alert.
//
// WHY THE DUPLICATION IS ACCEPTABLE. This copy decides ONE thing: whether a
// medicine row can lend its generic name to a suggestion. It never decides
// which habits exist, and it never folds two medicines together — that happens
// only on the server. If the two copies ever drift, the worst outcome is that a
// generic is not found and the line behaves exactly like a hand-typed brand,
// which is an already-documented state. It cannot produce a wrong generic:
// a mismatch yields no generic, never another medicine's.
//
// `rxHabitKey.test.ts` pins the cases both copies must agree on.

// See server/src/rx-habits/normalise.ts#FORM_ABBREV.
const FORM_ABBREV: Record<string, string> = {
  tab: "tablet",
  cap: "capsule",
  inj: "injection",
  syp: "syrup",
  syr: "syrup",
  susp: "suspension",
};

const UNIT = "(?:mg|mcg|gm|g|kg|ml|l|iu|u|meq|mmol|%)";

const collapse = (s: string): string => (s ?? "").replace(/\s+/g, " ").trim();

const closeStrengthGap = (s: string): string =>
  s.replace(new RegExp(`(\\d)\\s+(${UNIT})\\b`, "g"), "$1$2");

// The form token is everything up to and INCLUDING the first "." — the
// parenthesised qualifier comes with it, so "tablet (enteric coated)." never
// folds into "tablet." and "sc injection." never folds into "injection.".
// The no-digit / ≤4-word guards stop a decimal strength ("napa 0.5 mg") being
// mistaken for a dosage form.
function splitForm(s: string): { form: string; rest: string } {
  const dot = s.indexOf(".");
  if (dot !== -1) {
    const head = s.slice(0, dot).trim();
    if (head && !/\d/.test(head) && head.split(" ").length <= 4) {
      return { form: `${head}.`, rest: s.slice(dot + 1).trim() };
    }
  }
  const m = s.match(/^([a-z]+)\s+(.*)$/);
  if (m && FORM_ABBREV[m[1]]) return { form: `${m[1]}.`, rest: m[2].trim() };
  return { form: "", rest: s };
}

function expandForm(form: string): string {
  const body = form.endsWith(".") ? form.slice(0, -1) : form;
  return `${body
    .split(" ")
    .map((w) => FORM_ABBREV[w] ?? w)
    .join(" ")}.`;
}

/** Typography-normalised medicine key, INCLUDING the strength. Never folds two
 *  strengths, never converts a unit, never drops a form qualifier. */
export function normaliseDrugKey(label: string): string {
  const s = collapse(label).toLowerCase();
  if (!s) return "";
  const { form, rest } = splitForm(s);
  const name = closeStrengthGap(rest).replace(/\s*\bn\/a$/, "").trim();
  if (!form) return name;
  return name ? `${expandForm(form)} ${name}` : expandForm(form);
}
