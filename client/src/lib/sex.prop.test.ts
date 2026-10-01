import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { normaliseSex, sexLabel } from "./sex";
import { anyText, configureProps } from "@/test/fc";

// ⚠️ "Patient sex: one word, one vocabulary, never a guess" (client/CLAUDE.md).
// "Sex selects reference ranges (Hb, creatinine, eGFR) and sex-dependent dosing,
// so an unrecorded sex must stay unrecorded — normaliseSex() returns "" for
// anything it does not recognise".
configureProps(1000);

const ALLOWED = ["", "Male", "Female", "Other"];

// The two spellings that exist in the stored column (sex.test.ts): the full
// word the editor writes and the single letter the patient list wrote.
// A Map, not an object literal: a plain object would "recognise" `constructor`.
const SPELLINGS = new Map([["m", "Male"], ["male", "Male"], ["f", "Female"], ["female", "Female"], ["o", "Other"], ["other", "Other"]]);
const recognised = (raw: string | null | undefined): string | undefined => SPELLINGS.get((raw ?? "").trim().toLowerCase());

const anyInput = fc.oneof(
  anyText(12),
  fc.constantFrom(null, undefined),
  // near-misses: one edit away from a real spelling
  fc.constantFrom("Ma", "Mal", "Males", "Fe", "Fem", "Femal", "Woman", "Man", "Boy", "Girl", "MF", "M/F", "M.", "F.", "0", "1", "2", "true", "unknown", "N/A", "-", "—", "Oth", "X", "U", "পুরুষ", "মহিলা"),
  // the real ones, in any case and with stray white space
  fc.tuple(fc.constantFrom("", " ", "  ", "\t", "\n"), fc.constantFrom(...SPELLINGS.keys()), fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }), fc.constantFrom("", " ", "\t"))
    .map(([lead, word, caps, trail]) => lead + [...word].map((ch, i) => (caps[i] ? ch.toUpperCase() : ch)).join("") + trail),
);

describe("normaliseSex", () => {
  it("is total and returns only one of the four allowed values", () => {
    fc.assert(
      fc.property(anyInput, (raw) => {
        expect(ALLOWED).toContain(normaliseSex(raw));
      }),
    );
  });

  it('⚕️ never returns a sex for input it does not recognise — it returns ""', () => {
    fc.assert(
      fc.property(anyInput, (raw) => {
        fc.pre(recognised(raw) === undefined);
        expect(normaliseSex(raw)).toBe("");
      }),
    );
  });

  it("reads both stored spellings, whatever the case or surrounding white space", () => {
    fc.assert(
      fc.property(anyInput, (raw) => {
        const expected = recognised(raw);
        fc.pre(expected !== undefined);
        expect(normaliseSex(raw)).toBe(expected);
      }),
    );
  });

  it("never turns one sex into another: its own output reads back as itself", () => {
    fc.assert(
      fc.property(anyInput, (raw) => {
        const once = normaliseSex(raw);
        expect(normaliseSex(once)).toBe(once);
      }),
    );
  });

  it("an unrecognised value with a recognised one INSIDE it is still unrecorded", () => {
    fc.assert(
      fc.property(fc.constantFrom(...SPELLINGS.keys()), anyText(6).filter((s) => s.trim() !== ""), fc.boolean(), (word, junk, before) => {
        const raw = before ? `${junk} ${word}` : `${word} ${junk}`;
        fc.pre(recognised(raw) === undefined);
        expect(normaliseSex(raw)).toBe("");
      }),
    );
  });
});

describe("sexLabel", () => {
  it("shows the fallback — never a sex — for anything unrecognised", () => {
    fc.assert(
      fc.property(anyInput, (raw) => {
        const label = sexLabel(raw);
        expect(["—", "Male", "Female", "Other"]).toContain(label);
        expect(label === "—").toBe(normaliseSex(raw) === "");
      }),
    );
  });
});
