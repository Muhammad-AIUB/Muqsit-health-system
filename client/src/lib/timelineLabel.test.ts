import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { nameLines } from "./timelineLabel";
import { splitDrugLabel } from "./rxShorthand";
import { configureProps } from "@/test/fc";

// The name written beside a bar or a lane of the Health-trend chart, in a
// column too narrow for the whole of it.
//
// ⚕️ It used to be one line, cut at its end. On a phone that column holds 12 to
// 15 characters, and in this app a medicine's label STARTS with its dosage
// form: "Tablet. Entaliv 0.5 mg" and "Tablet. Entaliv 1 mg" both read
// "Tablet. Enta…", and "Capsule (Enteric Coated). Sergel 40 mg" read
// "Capsule (Ente…" with the medicine gone. Two bars with one name — a dose
// change that cannot be read off the timeline (found in review, before it was
// released). What tells two bars apart is the brand and the strength, so that
// is what a narrow column keeps.
configureProps(300);

const texts = (name: string, max: number, kind: "drug" | "text" = "drug") => nameLines(name, max, kind).map((l) => l.text);

describe("nameLines — a medicine", () => {
  it("a name that fits is one line, exactly as it was written", () => {
    expect(nameLines("Tablet. Napa 500 mg", 20, "drug")).toEqual([{ text: "Tablet. Napa 500 mg" }]);
    expect(texts("Napa", 8)).toEqual(["Napa"]);
  });

  it("⚕️ two strengths of one medicine stay two different names", () => {
    expect(texts("Tablet. Entaliv 0.5 mg", 15)).toEqual(["Tablet.", "Entaliv 0.5 mg"]);
    expect(texts("Tablet. Entaliv 1 mg", 15)).toEqual(["Tablet.", "Entaliv 1 mg"]);
  });

  it("⚕️ a long dosage form gives way — the brand and its strength are kept whole", () => {
    expect(texts("Capsule (Enteric Coated). Sergel 40 mg", 15)).toEqual(["Capsule (Enter…", "Sergel 40 mg"]);
    expect(texts("Oral Solution. Avolac 3.35 gm/5 ml", 19)).toEqual(["Oral Solution.", "Avolac 3.35 gm/5 ml"]);
  });

  it("the form is the quiet line; the name is not", () => {
    const [form, name] = nameLines("Tablet. Entaliv 0.5 mg", 15, "drug");
    expect(form).toEqual({ text: "Tablet.", quiet: true });
    expect(name.quiet).toBeFalsy();
  });

  it("on the narrowest phones the strength still shows: the name takes both lines and the form is left off, marked", () => {
    // 13 characters: "Entaliv 0.5 mg" is 14.
    expect(texts("Tablet. Entaliv 0.5 mg", 13)).toEqual(["…Entaliv 0.5", "mg"]);
    expect(texts("Tablet. Entaliv 1 mg", 13)).toEqual(["Tablet.", "Entaliv 1 mg"]);
  });

  it("a name too long even for a line of its own is cut at its end, and its strength keeps the second line", () => {
    expect(texts("Tablet. Sofosbuvir+Velpatasvir 400 mg/100 mg", 15)).toEqual(["…Sofosbuvir+Ve…", "400 mg/100 mg"]);
  });

  it("a medicine typed by hand, with no form to set aside, wraps at a word", () => {
    expect(texts("Insulin Mixtard 30/70 as before", 15)).toEqual(["Insulin Mixtard", "30/70 as before"]);
  });

  it("the abbreviated forms doctors type are forms too", () => {
    expect(texts("inj Ceftriaxone 1 gm", 16)).toEqual(["inj", "Ceftriaxone 1 gm"]);
  });
});

describe("nameLines — free text (a symptom, a test's name)", () => {
  it("wraps onto two lines at a word, and only the END is cut", () => {
    expect(texts("Fever for 3 days with chills and rigor", 15, "text")).toEqual(["Fever for 3", "days with chil…"]);
  });

  it("⚕️ two tests that start alike are told apart", () => {
    expect(texts("Serum bilirubin total", 15, "text")).toEqual(["Serum bilirubin", "total"]);
    expect(texts("Serum bilirubin direct", 15, "text")).toEqual(["Serum bilirubin", "direct"]);
  });

  it("is never taken apart as a medicine", () => {
    expect(texts("Pain. Left knee after a fall last week", 15, "text")).toEqual(["Pain. Left knee", "after a fall l…"]);
  });

  it("nothing to show is nothing drawn", () => {
    expect(nameLines("", 15, "text")).toEqual([]);
    expect(nameLines("   ", 15, "drug")).toEqual([]);
  });
});

describe("nameLines — for any name", () => {
  const word = fc.stringMatching(/^[A-Za-z0-9.+/()%-]{1,14}$/);
  const anyName = fc.array(word, { minLength: 1, maxLength: 8 }).map((ws) => ws.join(" "));
  const strip = (s: string) => s.replace(/^…/, "").replace(/…$/, "");

  it("never more than two lines, and none longer than the column", () => {
    fc.assert(
      fc.property(anyName, fc.integer({ min: 8, max: 24 }), fc.constantFrom<"drug" | "text">("drug", "text"), (name, max, kind) => {
        const lines = nameLines(name, max, kind);
        expect(lines.length).toBeGreaterThanOrEqual(1);
        expect(lines.length).toBeLessThanOrEqual(2);
        for (const l of lines) expect(l.text.length).toBeLessThanOrEqual(max);
      }),
    );
  });

  it("⚕️ invents nothing and reorders nothing: each line is a piece of the name, in the order it was written", () => {
    fc.assert(
      fc.property(anyName, fc.integer({ min: 8, max: 24 }), fc.constantFrom<"drug" | "text">("drug", "text"), (name, max, kind) => {
        let from = 0;
        for (const l of nameLines(name, max, kind)) {
          const piece = strip(l.text);
          const at = name.indexOf(piece, from);
          expect(at, `"${l.text}" in "${name}"`).toBeGreaterThanOrEqual(0);
          from = at + piece.length;
        }
      }),
    );
  });

  it("a mark (…) stands wherever something was left off — a name shown without one is the whole name", () => {
    fc.assert(
      fc.property(anyName, fc.integer({ min: 8, max: 24 }), fc.constantFrom<"drug" | "text">("drug", "text"), (name, max, kind) => {
        const lines = nameLines(name, max, kind);
        if (lines.some((l) => l.text.includes("…"))) return;
        // Compared without spaces: a line break stands where a space did (or,
        // in "Tab.Napa", where there was none).
        expect(lines.map((l) => l.text).join("").replace(/\s+/g, "")).toBe(name.replace(/\s+/g, ""));
      }),
    );
  });

  it("⚕️ a medicine whose name and strength fit the column shows them whole, on the last line", () => {
    const form = fc.constantFrom("Tablet.", "Capsule.", "Injection.", "Capsule (Enteric Coated).", "Oral Solution.", "Syrup.");
    const brand = fc.stringMatching(/^[A-Z][a-z]{2,9}$/);
    const strength = fc.constantFrom("5 mg", "0.5 mg", "500 mg", "40 mg", "1 gm", "100 mg/5 ml");
    fc.assert(
      fc.property(form, brand, strength, fc.integer({ min: 12, max: 22 }), (f, b, s, max) => {
        const label = `${f} ${b} ${s}`;
        const rest = `${b} ${s}`;
        // Only when the label does not fit as it is, and the split reads it as written.
        fc.pre(label.length > max && rest.length <= max && splitDrugLabel(label).name === b);
        const lines = nameLines(label, max, "drug");
        expect(lines[lines.length - 1].text).toBe(rest);
      }),
    );
  });
});
