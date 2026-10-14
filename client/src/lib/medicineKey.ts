import { normaliseDrugKey } from "@/lib/rxHabitKey";

// The dosage forms the key knows by their short words (`Tab`, `Cap`, `Inj`,
// `Syp`/`Syr`, `Susp`), written out.
const FORM_WORDS = "tablet|capsule|injection|syrup|suspension";

// The rule under `normaliseDrugKey`: the words before a label's FIRST full stop
// are its dosage form when they hold no digit and are four words or fewer.
const readsAsForm = (s: string): boolean => {
  const stop = s.indexOf(".");
  if (stop === -1) return false;
  const head = s.slice(0, stop).trim();
  return head !== "" && !/\d/.test(head) && head.split(" ").length <= 4;
};

/**
 * How a label was TYPED, set aside. It changes no letter, digit or unit of
 * what is written; it adds a 0, and adds or drops spaces and full stops:
 *  • a decimal written with no 0 in front of it — after a space, a plus, a
 *    stroke or a bracket (`.5 mg`, `+.5 mg`) — gets one, so that its point is
 *    not read as the full stop that ends a dosage form: `Tab Rivotril .5 mg`
 *    and `Tab Rivotril. 5 mg` came out as one medicine (review, before
 *    release). A point glued to a letter (`Rivotril.5 mg`) is not touched —
 *    `Tab.5-FU` is a form and a name — and is still read as a form's;
 *  • no space round a plus or a stroke (`20 mg + 50 mg`, `1 gm / 100 ml`),
 *    after a number (`100 units`, `2 %`), or inside a bracket, and one before
 *    it (`Capsule(Enteric Coated).`);
 *  • a full stop at the very end of the label is dropped;
 *  • the form written out with no full stop after it (`Tablet Napa`) is read
 *    as that form, as `Tab Napa` is — only where the label would not already
 *    be read as having a form: `Capsule (Enteric Coated). Sergel` has its full
 *    stop, after its qualifier, and given another one it no longer matched
 *    `Cap (enteric coated). Sergel` (review, before release).
 */
function asTyped(label: string): string {
  const s = (label ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s+/(])\.(\d)/g, "$10.$2")
    .replace(/\s*([+/])\s*/g, "$1")
    .replace(/(\d)\s+(?=[a-z%µ])/gi, "$1")
    .replace(/\s*\(\s*/g, " (")
    .replace(/\s+\)/g, ")")
    .trim()
    .replace(/\.$/, "");
  return readsAsForm(s) ? s : s.replace(new RegExp(`^(${FORM_WORDS}) `, "i"), "$1. ");
}

/**
 * A medicine as the app tells two medicines apart: its dosage form, its name
 * and its strength — however the label is spaced or capitalised (`asTyped`
 * above), and with `Tab` read as `Tablet.`. Under it is `normaliseDrugKey`,
 * the key "Your usual" is kept under, which never sets aside a strength, a
 * form or a form's qualifier. A label that key reads as nothing at all is
 * compared without its capitals and outer spaces.
 *
 * ⚕️ ONE answer to "is this medicine on the pad already?", for the two places
 * that ask it before they write: the "Add Bulk Medicine" box and Drug
 * history's "Move to Rx". (The pad itself, "Your usual" and a saved template
 * write without asking.) With two answers a line was written twice from one
 * screen and once from the other — "Move to Rx" compared the label letter for
 * letter, and `Tablet. Napa 500mg` went on beside `Tablet. Napa 500 mg` at the
 * same dose.
 *
 * What it does NOT take for one medicine: a label typed with no dosage form
 * (`Napa 500 mg`) is not known to be the tablet; a unit written another way
 * (`1 gm`, `1 g`) is not converted; a decimal glued to a letter (above). And
 * what it DOES take for one that a reader might not: capitals are set aside,
 * so `3 MIU` and `3 mIU` (mega and milli) are one key — no such pair is known
 * in a medicine list here.
 */
export const medicineKey = (drugLabel: string): string => {
  const typed = asTyped(drugLabel);
  return normaliseDrugKey(typed) || typed.toLowerCase() || (drugLabel ?? "").trim().toLowerCase();
};
