import { describe, expect, it } from "vitest";
import { normaliseSex, photoPlaceholder, sexLabel } from "./sex";

// A patient with no photo shows a man's or a woman's picture by the sex
// recorded (physician's request, 2026-10-15) — and the plain person where the
// record does not say, never a guess.
describe("photoPlaceholder", () => {
  it("a man's picture for Male, in either stored spelling", () => {
    expect(photoPlaceholder("Male")).toBe("male");
    expect(photoPlaceholder("M")).toBe("male");
    expect(photoPlaceholder(" male ")).toBe("male");
  });
  it("a woman's picture for Female, in either stored spelling", () => {
    expect(photoPlaceholder("Female")).toBe("female");
    expect(photoPlaceholder("f")).toBe("female");
  });
  it("the plain person for Other, nothing, or anything unread", () => {
    for (const s of ["Other", "", null, undefined, "unknown"]) expect(photoPlaceholder(s)).toBe("user");
  });
});

// The stored column really does hold both spellings: MuqsitContext writes the
// full word onto an OPD row from the editor, PatientsView writes the letter.
// Readers that only tested `=== "F"` showed a woman recorded as "Female" as Male.
describe("normaliseSex", () => {
  it("reads the full words the editor writes", () => {
    expect(normaliseSex("Male")).toBe("Male");
    expect(normaliseSex("Female")).toBe("Female");
    expect(normaliseSex("Other")).toBe("Other");
  });

  it("reads the single letters the patient list writes", () => {
    expect(normaliseSex("M")).toBe("Male");
    expect(normaliseSex("F")).toBe("Female");
    expect(normaliseSex("O")).toBe("Other");
  });

  it("does not care about case or stray whitespace", () => {
    expect(normaliseSex("female")).toBe("Female");
    expect(normaliseSex(" f ")).toBe("Female");
    expect(normaliseSex("MALE")).toBe("Male");
  });

  it("never invents a sex", () => {
    // The whole point: an unrecorded sex must stay unrecorded. Guessing puts a
    // wrong reference range and a wrong dose on a real patient.
    for (const nothing of [null, undefined, "", "   ", "unknown", "X", "1"]) {
      expect(normaliseSex(nothing)).toBe("");
    }
  });

  it("round-trips its own output", () => {
    expect(normaliseSex(normaliseSex("f"))).toBe("Female");
    expect(normaliseSex(normaliseSex(null))).toBe("");
  });
});

describe("sexLabel", () => {
  it("shows a dash rather than a blank gap when nothing is recorded", () => {
    expect(sexLabel(null)).toBe("—");
    expect(sexLabel("")).toBe("—");
    expect(sexLabel("F")).toBe("Female");
    expect(sexLabel(null, "not recorded")).toBe("not recorded");
  });
});
