import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { normaliseDrugKey } from "./rxHabitKey";
import { anyText, configureProps } from "@/test/fc";

// `normaliseDrugKey` decides whether a medicine row may lend its GENERIC to a
// "Your usual" suggestion — the only bridge between a brand on the ℞ and a
// prescribing-alert rule written against the generic. client/CLAUDE.md:
//   "matched on the NORMALISED key, because a raw comparison misses on a space
//    (`500 mg`), a case, a dropped `n/a` or a form qualifier. A mismatch yields
//    no generic, never another medicine's."
// and the module's own contract: "Never folds two strengths, never converts a
// unit, never drops a form qualifier."
//
// The exact outputs are pinned in rxHabitKey.test.ts (shared with the server's
// normalise.spec.ts). These check the two directions as invariants: typography
// never separates one medicine from itself, and nothing folds two medicines
// together. Every form / brand / unit literal is from that table.
configureProps(500);

const form = fc.constantFrom("Tablet", "Capsule", "Injection", "Oral Solution", "SC Injection");
const qualifier = fc.constantFrom("Enteric Coated", "Modified Release", "Extended Release");
const brand = fc.constantFrom("Napa", "Tycil", "Seclo", "Halopid", "Pantonix", "Dimerol MR", "Alfumax ER", "Diasulin", "Avolac", "Bicozin", "Sergel");
const unit = fc.constantFrom("mg", "mcg", "gm", "g", "ml", "iu");
const amount = fc.integer({ min: 1, max: 2000 });

const label = (f: string, b: string, n: number | string, u: string) => `${f}. ${b} ${n} ${u}`;

/** Re-case each letter and stretch each space — typography only. */
const restyle = (s: string, caps: boolean[], gaps: number[]) => {
  let i = 0, g = 0;
  return [...s].map((ch) => {
    if (ch === " ") return " ".repeat(1 + (gaps[g++ % gaps.length] ?? 0));
    return caps[i++ % caps.length] ? ch.toUpperCase() : ch.toLowerCase();
  }).join("");
};
const caps = fc.array(fc.boolean(), { minLength: 1, maxLength: 12 });
const gaps = fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 6 });

describe("normaliseDrugKey — total", () => {
  it("never throws and always returns a lower-case, single-spaced, trimmed string", () => {
    fc.assert(
      fc.property(anyText(40), (s) => {
        const key = normaliseDrugKey(s);
        expect(typeof key).toBe("string");
        expect(key).toBe(key.trim());
        expect(key).not.toMatch(/\s{2,}/);
        expect(key).toBe(key.toLowerCase());
      }),
    );
  });

  it("survives a null or undefined label (a JSON column can hold anything)", () => {
    expect(normaliseDrugKey(null as unknown as string)).toBe("");
    expect(normaliseDrugKey(undefined as unknown as string)).toBe("");
  });
});

describe("normaliseDrugKey — typography never separates a medicine from itself", () => {
  it("case and runs of spaces do not change the key", () => {
    fc.assert(
      fc.property(form, brand, amount, unit, caps, gaps, fc.constantFrom("", " ", "   "), (f, b, n, u, c, g, padding) => {
        const plain = label(f, b, n, u);
        expect(normaliseDrugKey(padding + restyle(plain, c, g) + padding)).toBe(normaliseDrugKey(plain));
      }),
    );
  });

  it("'500 mg' and '500mg' are the same medicine", () => {
    fc.assert(
      fc.property(form, brand, amount, unit, (f, b, n, u) => {
        expect(normaliseDrugKey(`${f}. ${b} ${n}${u}`)).toBe(normaliseDrugKey(`${f}. ${b} ${n} ${u}`));
      }),
    );
  });

  it("a trailing N/A (strength not recorded) is the same medicine as none written", () => {
    fc.assert(
      fc.property(form, brand, fc.constantFrom("N/A", "n/a"), (f, b, na) => {
        expect(normaliseDrugKey(`${f}. ${b} ${na}`)).toBe(normaliseDrugKey(`${f}. ${b}`));
      }),
    );
  });

  it("normalising a key again does not change it", () => {
    fc.assert(
      fc.property(form, fc.option(qualifier), brand, amount, unit, (f, q, b, n, u) => {
        const key = normaliseDrugKey(label(q ? `${f} (${q})` : f, b, n, u));
        expect(normaliseDrugKey(key)).toBe(key);
      }),
    );
  });
});

describe("normaliseDrugKey — ⚕️ what must NEVER fold", () => {
  it("two strengths of one brand", () => {
    fc.assert(
      fc.property(form, brand, amount, amount, unit, (f, b, n1, n2, u) => {
        fc.pre(n1 !== n2);
        expect(normaliseDrugKey(label(f, b, n1, u))).not.toBe(normaliseDrugKey(label(f, b, n2, u)));
      }),
    );
  });

  it("a decimal strength and its whole number (0.5 mg is not 5 mg)", () => {
    fc.assert(
      fc.property(form, brand, fc.integer({ min: 1, max: 9 }), unit, (f, b, n, u) => {
        expect(normaliseDrugKey(label(f, b, `0.${n}`, u))).not.toBe(normaliseDrugKey(label(f, b, n, u)));
      }),
    );
  });

  it("the same number in two units — a unit is never converted", () => {
    fc.assert(
      fc.property(form, brand, amount, unit, unit, (f, b, n, u1, u2) => {
        fc.pre(u1 !== u2);
        expect(normaliseDrugKey(label(f, b, n, u1))).not.toBe(normaliseDrugKey(label(f, b, n, u2)));
      }),
    );
  });

  it("a form qualifier — '(Enteric Coated)' is not the plain form", () => {
    fc.assert(
      fc.property(form, qualifier, brand, amount, unit, (f, q, b, n, u) => {
        expect(normaliseDrugKey(label(`${f} (${q})`, b, n, u))).not.toBe(normaliseDrugKey(label(f, b, n, u)));
      }),
    );
  });

  it("two dosage forms of one brand", () => {
    fc.assert(
      fc.property(form, form, brand, amount, unit, (f1, f2, b, n, u) => {
        fc.pre(f1 !== f2);
        expect(normaliseDrugKey(label(f1, b, n, u))).not.toBe(normaliseDrugKey(label(f2, b, n, u)));
      }),
    );
  });

  it("two brands", () => {
    fc.assert(
      fc.property(form, brand, brand, amount, unit, (f, b1, b2, n, u) => {
        fc.pre(b1 !== b2);
        expect(normaliseDrugKey(label(f, b1, n, u))).not.toBe(normaliseDrugKey(label(f, b2, n, u)));
      }),
    );
  });
});
