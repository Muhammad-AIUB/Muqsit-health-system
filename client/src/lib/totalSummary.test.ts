import { describe, expect, it } from "vitest";
import { buildTotalSummary, SUMMARY_KINDS, UNDATED, type SummarySources } from "./totalSummary";
import { ddmmyyyyMs } from "./dateInput";

// The physician's own example (sheet 07/11/2026).
const src: SummarySources = {
  complaints: [
    { date: "05/09/2026", items: ["Jaundice"] },
    { date: "02/02/2026", items: ["fever , sore throat"] },
  ],
  hx: { disease: [{ text: "DM", date: "02/02/2026", by: null }], surgical: [] },
  oe: [
    { date: "02/02/2026", text: "BP: 120/80, temp.102" },
    { date: "02/02/2026", text: "Disease Hx: DM" }, // shown as history, not as an examination
  ] as never,
  inv: [{ date: "05/09/2026", category: "LFT", test: "S. bilirubin", value: "4.6mg/dl" }, { date: "05/09/2026", category: "LFT", test: "SGPT", value: "1120 U/L" }],
  diagnoses: [{ date: "05/09/2026", items: ["AVH"] }],
  drug: [
    { date: "05/09/2026", items: [{ raw: "", date: "05/09/2026", kind: "med", body: "Tab. Famotac 20 mg — 1+0+1 —  — 1 month" }] },
    { date: "02/02/2026", items: [
      { raw: "", date: "02/02/2026", kind: "med", body: "Tab. Napa 500 mg — 1+1+1 —  — 5 days" },
      { raw: "", date: "02/02/2026", kind: "cont", body: "0+0+1 —  — 3 days" },
    ] },
  ],
};

describe("buildTotalSummary", () => {
  it("puts each date's kinds in the sheet's order, whatever order they arrive in", () => {
    const days = buildTotalSummary(src, { newestFirst: false });
    expect(days.map((d) => d.date)).toEqual(["02/02/2026", "05/09/2026"]);
    const order = SUMMARY_KINDS.map((k) => k.key);
    for (const d of days) {
      const idx = d.blocks.map((b) => order.indexOf(b.kind));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    }
    expect(days[1].blocks.map((b) => b.kind)).toEqual(["cc", "inv", "dx", "drug"]);
  });

  it("shows the lines as written, and a taper under its medicine", () => {
    const d = buildTotalSummary(src, { newestFirst: false })[0];
    expect(d.blocks.find((b) => b.kind === "drug")?.lines).toEqual([
      { text: "Tab. Napa 500 mg — 1+1+1 — 5 days" },
      { text: "↳ 0+0+1 — 3 days", indent: true },
    ]);
    expect(d.blocks.find((b) => b.kind === "inv")).toBeUndefined();
  });

  it("keeps Disease/Surgical Hx lines out of On examination", () => {
    const d = buildTotalSummary(src, { newestFirst: false })[0];
    expect(d.blocks.find((b) => b.kind === "oe")?.lines.map((l) => l.text)).toEqual(["BP: 120/80, temp.102"]);
    expect(d.blocks.find((b) => b.kind === "hx")?.lines.map((l) => l.text)).toEqual(["Disease history: DM"]);
  });

  it("newest date first by default; a record with no date goes last either way", () => {
    const withUndated: SummarySources = { ...src, complaints: [...src.complaints, { date: "", items: ["old"] }] };
    expect(buildTotalSummary(withUndated).map((d) => d.date)).toEqual(["05/09/2026", "02/02/2026", UNDATED]);
    expect(buildTotalSummary(withUndated, { newestFirst: false }).map((d) => d.date)).toEqual(["02/02/2026", "05/09/2026", UNDATED]);
  });

  it("a kind filter drops the other kinds and the days left empty", () => {
    const days = buildTotalSummary(src, { kinds: new Set(["inv"]) });
    expect(days.map((d) => d.date)).toEqual(["05/09/2026"]);
    expect(days[0].blocks.map((b) => b.kind)).toEqual(["inv"]);
  });

  it("a date window keeps its ends, and does not guess where an undated line falls", () => {
    const withUndated: SummarySources = { ...src, complaints: [...src.complaints, { date: "", items: ["old"] }] };
    const days = buildTotalSummary(withUndated, { fromMs: ddmmyyyyMs("02/02/2026"), toMs: ddmmyyyyMs("02/02/2026") });
    expect(days.map((d) => d.date)).toEqual(["02/02/2026"]);
  });

  it("nothing in, nothing out", () => {
    expect(buildTotalSummary({ complaints: [], hx: { disease: [], surgical: [] }, oe: [], inv: [], diagnoses: [], drug: [] })).toEqual([]);
  });
});
