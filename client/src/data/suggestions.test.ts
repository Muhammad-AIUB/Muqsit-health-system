// Physician's sheet, 31/10/2026: the Advice popup offers only the advice the
// doctor has written himself — the built-in list ("Rest for 3 days", "Drink
// plenty of fluids", "Avoid cold water", …) is gone. The other fields' static
// lists were not named and stay.
import { describe, expect, it } from "vitest";
import * as mod from "./suggestions";

describe("built-in suggestions", () => {
  it("has no Advice list", () => {
    expect("adviceSuggestions" in mod).toBe(false);
    expect(Object.keys(mod.suggestionDB)).not.toContain("Advice");
    const all = Object.values(mod.suggestionDB).flat();
    for (const gone of ["Rest for 3 days", "Drink plenty of fluids", "Avoid cold water"]) expect(all).not.toContain(gone);
  });
});
