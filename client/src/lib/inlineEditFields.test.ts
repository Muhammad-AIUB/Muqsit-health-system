// ⚕️ The opt-in list for in-place editing. It is pinned because it is a
// physician's decision about how a clinical list is corrected, not a styling
// choice: adding a field here changes what the ✎ Edit button does on it, and
// removing one silently sends the doctor back through a modal to fix a typo.

import { describe, expect, it } from "vitest";
import { INLINE_EDIT_FIELDS, isInlineEditField } from "./inlineEditFields";

describe("inlineEditFields", () => {
  it("is exactly the lists the physician asked for", () => {
    expect([...INLINE_EDIT_FIELDS]).toEqual([
      "Chief complaints",
      "Provisional diagnosis",
      "Final diagnosis",
      // Added 2026-09-07 with the split of the old single "Note / plan" field.
      "Note",
      "Plan",
    ]);
  });

  it("leaves every other clinical field on the popup flow", () => {
    for (const label of [
      "Previous complaints",
      "History",
      "Investigation report findings",
      "Drug history",
      "On examination",
      // The label the split replaced — it must not still open the boxes.
      "Note / plan",
      "Associated illness",
    ]) {
      expect(isInlineEditField(label)).toBe(false);
    }
  });

  it("matches the label exactly — no near miss opens the boxes", () => {
    expect(isInlineEditField("Final diagnosis")).toBe(true);
    expect(isInlineEditField("final diagnosis")).toBe(false);
    expect(isInlineEditField("Diagnosis")).toBe(false);
  });
});
