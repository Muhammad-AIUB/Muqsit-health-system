import { describe, expect, it } from "vitest";
import { RX_SUGGEST_MIN_CHARS, rxSuggestReady } from "./rxSuggest";

describe("rxSuggestReady", () => {
  it("waits for 3 letters", () => {
    expect(RX_SUGGEST_MIN_CHARS).toBe(3);
    expect(rxSuggestReady("")).toBe(false);
    expect(rxSuggestReady("n")).toBe(false);
    expect(rxSuggestReady("na")).toBe(false);
    expect(rxSuggestReady("nap")).toBe(true);
  });

  it("ignores spaces, so padding cannot open it early", () => {
    expect(rxSuggestReady("   ")).toBe(false);
    expect(rxSuggestReady(" n a ")).toBe(false);
    expect(rxSuggestReady("n a p")).toBe(true);
  });

  it("counts Bangla letters like any other", () => {
    expect(rxSuggestReady("খাব")).toBe(true);
  });
});
