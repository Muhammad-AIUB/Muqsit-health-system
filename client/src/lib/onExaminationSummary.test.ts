import { describe, expect, it } from "vitest";
import { groupOeForRecords, mergeOe, oeAuthorLabel, printableOnExamination, type OeFinding } from "./onExaminationSummary";

// ⚕️ The shared On-examination history (physician's sheets 28/10 item 7 and
// 31/10 item 3): each dated card says who wrote it — and an entry from before
// the author was stored says nobody, never a guess.
describe("On-examination author (`by`)", () => {
  const OLD: OeFinding = { date: "20/10/2026", text: "BP: 120/80 mmHg" };
  const A: OeFinding = { date: "28/10/2026", text: "Pulse: 78 b/min", by: "shahariar" };
  const B: OeFinding = { date: "28/10/2026", text: "Pallor: present", by: "Dr. Karim" };

  it("names the doctor with Dr. in front, unless the name already has it", () => {
    expect(oeAuthorLabel("shahariar")).toBe("by Dr. shahariar");
    expect(oeAuthorLabel("Dr. Karim")).toBe("by Dr. Karim");
    expect(oeAuthorLabel("dr karim")).toBe("by dr karim");
    expect(oeAuthorLabel("Drishti Das")).toBe("by Dr. Drishti Das"); // "Dr" must be a word of its own
  });

  it("an entry with no author has no label", () => {
    expect(oeAuthorLabel(undefined)).toBeNull();
    expect(oeAuthorLabel("  ")).toBeNull();
    expect(oeAuthorLabel(42)).toBeNull();
  });

  it("merging keeps the author on what it adds and on what was there", () => {
    expect(mergeOe([A], [OLD, B])).toEqual([A, OLD, B]);
    expect(mergeOe([A], [{ ...A, by: "someone else" }])).toEqual([A]); // same date + text: one finding
  });

  it("one card per date and author, newest date first; an old entry is never put under an author", () => {
    const groups = groupOeForRecords([OLD, A, { date: "20/10/2026", text: "Temp: 99 F", by: "shahariar" }, B]);
    expect(groups).toEqual([
      { date: "28/10/2026", by: "shahariar", items: [A] },
      { date: "28/10/2026", by: "Dr. Karim", items: [B] },
      { date: "20/10/2026", by: null, items: [OLD] },
      { date: "20/10/2026", by: "shahariar", items: [{ date: "20/10/2026", text: "Temp: 99 F", by: "shahariar" }] },
    ]);
  });
});

describe("printableOnExamination — ⊘ Hide", () => {
  it("prints the lines as entered unless hidden", () => {
    expect(printableOnExamination(["BP: 120/80"], false)).toEqual(["BP: 120/80"]);
    expect(printableOnExamination(["BP: 120/80"], true)).toEqual([]);
  });
});
