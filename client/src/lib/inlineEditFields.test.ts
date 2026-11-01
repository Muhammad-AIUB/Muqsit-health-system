// ⚕️ The opt-in list for in-place editing. It is pinned because it is a
// physician's decision about how a clinical list is corrected, not a styling
// choice: adding a field here changes what the ✎ Edit button does on it, and
// removing one silently sends the doctor back through a modal to fix a typo.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
      // Added 2026-09-25: "edit like Chief complaints" (OPD ℞ side only).
      "Advised tests / investigation",
      // Added 31/10/2026: "Sob jaigai edit … final diagnosis a jevabe ase".
      "History",
      "Associated illness",
      "Advice",
    ]);
  });

  it("does not reach the IPD sheet's differently-named test list", () => {
    expect(isInlineEditField("Advice tests")).toBe(false);
  });

  it("leaves every other clinical field on the popup flow", () => {
    for (const label of [
      "Previous complaints",
      "Investigation report findings",
      "Drug history",
      "On examination",
      // The label the split replaced — it must not still open the boxes.
      "Note / plan",
      // The IPD sheet's own lists keep their popup.
      "Diagnosis",
      "Sign",
      "Symptoms",
      "Procedure",
    ]) {
      expect(isInlineEditField(label)).toBe(false);
    }
  });

  it("matches the label exactly — no near miss opens the boxes", () => {
    expect(isInlineEditField("Final diagnosis")).toBe(true);
    expect(isInlineEditField("final diagnosis")).toBe(false);
    expect(isInlineEditField("Diagnosis")).toBe(false);
  });

  // Physician's sheet, 31/10/2026: "Sob jaigai edit … final diagnosis a jevabe
  // ase". Every list the OPD sidebar draws with ExpandableField is on the list.
  it("covers every ExpandableField list of the OPD sidebar", () => {
    for (const label of ["Chief complaints", "History", "Note", "Plan", "Provisional diagnosis", "Associated illness", "Final diagnosis"]) {
      expect(isInlineEditField(label), label).toBe(true);
    }
  });

  it("the ℞ side's Advice opts in, with ✕ in Edit, and offers no built-in list", () => {
    const src = readFileSync(join(__dirname, "../components/prescription/RightColumn.tsx"), "utf8");
    const tag = src.slice(src.indexOf('<ExpandableField label="Advice"'));
    const advice = tag.slice(0, tag.indexOf("/>"));
    expect(advice).toContain('inlineEdit={isInlineEditField("Advice")}');
    expect(advice).toContain("removable");
    expect(advice).not.toContain("suggestions=");
  });
});
