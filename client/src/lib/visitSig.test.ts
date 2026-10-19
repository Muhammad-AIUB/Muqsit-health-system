import { describe, expect, it } from "vitest";
import { stableJson } from "./visitSig";

// ⚕️ "Is this visit still what was printed?" is asked by comparing two
// signatures, one of them read back from the database after a reload — and a
// JSON column there gives an object's keys back in another order. A signature
// that read that as a change put a printed patient back to "Incomplete".

describe("stableJson", () => {
  it("does not depend on the order of an object's keys, at any depth", () => {
    const a = { drug: "Tablet. Napa 500 mg", dose: "1+0+1", items: [{ isCont: false, order: 0 }] };
    const b = { items: [{ order: 0, isCont: false }], dose: "1+0+1", drug: "Tablet. Napa 500 mg" };
    expect(stableJson(a)).toBe(stableJson(b));
  });

  it("an array's order is part of what it says", () => {
    expect(stableJson(["Fever", "Cough"])).not.toBe(stableJson(["Cough", "Fever"]));
  });

  it("a key with no value is the key left out, as a JSON column stores it; null is not", () => {
    expect(stableJson({ a: 1, b: undefined })).toBe(stableJson({ a: 1 }));
    expect(stableJson({ a: 1, b: null })).not.toBe(stableJson({ a: 1 }));
  });

  it("every value is told apart from the same text in another type", () => {
    expect(stableJson({ a: 1 })).not.toBe(stableJson({ a: "1" }));
    expect(stableJson({ a: false })).not.toBe(stableJson({ a: null }));
  });
});
