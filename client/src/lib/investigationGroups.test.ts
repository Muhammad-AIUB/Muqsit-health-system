import { describe, expect, it } from "vitest";
import { groupTicked, newGroupProblem, safeGroups, toggleGroup, type InvestigationGroup } from "./investigationGroups";

const dm: InvestigationGroup = { name: "DM follow-up", tests: ["FBS", "HbA1c", "Lipid profile"] };
const lipid: InvestigationGroup = { name: "Lipid", tests: ["Lipid profile"] };

describe("safeGroups — a Json column is read without ever throwing", () => {
  it("keeps well-formed groups", () => {
    expect(safeGroups([dm])).toEqual([dm]);
  });
  it.each([null, undefined, "x", 5, {}, [null], [{}], [{ name: "" , tests: ["A"] }], [{ name: "X", tests: [] }], [{ name: "X", tests: "A" }]])(
    "skips %j",
    (raw) => {
      expect(safeGroups(raw)).toEqual([]);
    },
  );
  it("drops non-string or blank test names but keeps the group", () => {
    expect(safeGroups([{ name: " G ", tests: ["A", 3, "", "B"] }])).toEqual([{ name: "G", tests: ["A", "B"] }]);
  });
});

describe("newGroupProblem", () => {
  it("needs a name", () => {
    expect(newGroupProblem("  ", ["FBS"], [])).toMatch(/name/);
  });
  it("needs at least one test", () => {
    expect(newGroupProblem("New", [], [])).toMatch(/at least one test/);
  });
  it("refuses a name already used, whatever the case or spacing", () => {
    expect(newGroupProblem(" dm FOLLOW-up ", ["FBS"], [dm])).toMatch(/already exists/);
  });
  it("accepts a good group", () => {
    expect(newGroupProblem("Thyroid", ["S. TSH"], [dm])).toBeNull();
  });
});

describe("ticking a group", () => {
  it("is ticked only when every test is in the list", () => {
    expect(groupTicked(dm, ["FBS", "HbA1c"])).toBe(false);
    expect(groupTicked(dm, ["FBS", "HbA1c", "Lipid profile", "CBC"])).toBe(true);
  });

  it("adds only the tests that are missing — never a duplicate", () => {
    expect(toggleGroup(dm, ["HbA1c", "CBC"], [dm])).toEqual({ add: ["FBS", "Lipid profile"], remove: [] });
  });

  it("unticking takes the group's tests back out", () => {
    expect(toggleGroup(dm, ["FBS", "HbA1c", "Lipid profile", "CBC"], [dm])).toEqual({ add: [], remove: ["FBS", "HbA1c", "Lipid profile"] });
  });

  it("⚕️ unticking never removes a test another ticked group still asks for", () => {
    const sel = ["FBS", "HbA1c", "Lipid profile"];
    expect(toggleGroup(dm, sel, [dm, lipid])).toEqual({ add: [], remove: ["FBS", "HbA1c"] });
  });
});
