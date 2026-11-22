import { describe, expect, it } from "vitest";
import { hidesMhsLogo } from "./practiceBrand";

// "Remove MHS logo" (admin Profile settings, 16/11/2026): only an explicit true
// takes the mark off. A missing answer never takes a brand off.
describe("hidesMhsLogo", () => {
  it("is true only for hideMhsLogo === true", () => {
    expect(hidesMhsLogo({ hideMhsLogo: true })).toBe(true);
  });
  it.each([
    [{ hideMhsLogo: false }],
    [{}],
    [null],
    [undefined],
    [{ hideMhsLogo: "true" }],
    [{ hideMhsLogo: 1 }],
  ])("%j shows the mark", (practice) => {
    expect(hidesMhsLogo(practice as never)).toBe(false);
  });
});
