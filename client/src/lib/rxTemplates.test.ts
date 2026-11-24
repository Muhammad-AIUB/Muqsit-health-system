import { describe, expect, it } from "vitest";
import { withTemplateLines } from "./rxTemplates";

describe("withTemplateLines — a template's Advice / tests joining the visit", () => {
  it("appends after what is already there, in the template's order", () => {
    expect(withTemplateLines(["Rest"], ["Drink water", "ঠাণ্ডা লাগাবেন না"])).toEqual(["Rest", "Drink water", "ঠাণ্ডা লাগাবেন না"]);
  });
  it("never writes a line twice — present already, or repeated in the template", () => {
    expect(withTemplateLines(["Rest", "CBC"], ["CBC", "ESR", "ESR"])).toEqual(["Rest", "CBC", "ESR"]);
  });
  it("skips blanks, leaves text exactly as saved, and copes with an older template with none", () => {
    expect(withTemplateLines([], ["  ", " Keep spaces ", ""])).toEqual([" Keep spaces "]);
    expect(withTemplateLines(["a"], undefined)).toEqual(["a"]);
  });
});
