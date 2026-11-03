import { describe, expect, it } from "vitest";
import { diseaseSurgicalHistory, drugHistoryByDate, perVisit, rxDay } from "./patientRecords";
import { buildRecordsDoc } from "./recordsDoc";

describe("drugHistoryByDate", () => {
  it("groups by date, newest first, the no-date marker last, tapers under their medicine", () => {
    const g = drugHistoryByDate([
      "01/01/2000: Tablet. Secla 20 mg —  —  — ",
      "20/10/2026: Tablet. Napa 500 mg — 1+0+1 —  — 7 days",
      "20/10/2026(cont): 0+0+1 —  — 7 days",
      "28/10/2026: Tablet. Bexa 1 mg — 1+0+0 —  — ",
      "20/10/2026(note): stopped by patient",
    ], "01/11/2026");
    expect(g.map((x) => x.date)).toEqual(["28/10/2026", "20/10/2026", "01/01/2000"]);
    expect(g[1].items.map((r) => r.kind)).toEqual(["med", "cont", "note"]);
    expect(g[1].items[1].body).toBe("0+0+1 —  — 7 days");
  });

  it("a taper stays with its medicine even if it carries another date", () => {
    const g = drugHistoryByDate(["20/10/2026: Tablet. Napa 500 mg —  —  — ", "28/10/2026(cont): 0+0+1 —  — "], "01/11/2026");
    expect(g).toHaveLength(1);
    expect(g[0].date).toBe("20/10/2026");
    expect(g[0].items.map((r) => r.kind)).toEqual(["med", "cont"]);
  });

  it("reads the legacy Current:/Past: lines as the modal does, and skips junk", () => {
    const g = drugHistoryByDate(["Current: Napa", "Past: Secla", "", 7 as unknown as string], "01/11/2026");
    expect(g.map((x) => x.date)).toEqual(["01/11/2026", "01/01/2000"]);
  });
});

describe("diseaseSurgicalHistory", () => {
  it("lists each entry once, at the visit it was first recorded, with its author when stored", () => {
    const r = diseaseSurgicalHistory([
      { date: "28/10/2026", text: "Disease Hx: DM 10/01/2020", by: "Rahim" },
      { date: "20/10/2026", text: "Disease Hx: DM 10/01/2020" }, // older, no author
      { date: "28/10/2026", text: "Surgical Hx: Appendicectomy 01/02/2015", by: "Rahim" },
      { date: "28/10/2026", text: "BP: 120/80 mmHg", by: "Rahim" },
      { date: "29/10/2026", text: "Disease Hx: HTN" },
    ]);
    expect(r.disease).toEqual([
      { text: "HTN", date: "29/10/2026", by: null },
      { text: "DM 10/01/2020", date: "20/10/2026", by: null },
    ]);
    expect(r.surgical).toEqual([{ text: "Appendicectomy 01/02/2015", date: "28/10/2026", by: "Rahim" }]);
  });

  it("leaves out an entry taken off in the sidebar (02/11/2026), and keeps its other copies' kind apart", () => {
    const r = diseaseSurgicalHistory([
      { date: "20/10/2026", text: "Disease Hx: DM", removedAt: "2026-11-02T10:00:00.000Z" },
      { date: "28/10/2026", text: "Disease Hx: DM", removedAt: "2026-11-02T10:00:00.000Z" },
      { date: "28/10/2026", text: "Surgical Hx: DM" },
    ]);
    expect(r.disease).toEqual([]);
    expect(r.surgical.map((e) => e.text)).toEqual(["DM"]);
  });

  it("two different texts are never folded together", () => {
    const r = diseaseSurgicalHistory([
      { date: "20/10/2026", text: "Disease Hx: DM" },
      { date: "20/10/2026", text: "Disease Hx: DM type 2" },
    ]);
    expect(r.disease.map((e) => e.text)).toEqual(["DM", "DM type 2"]);
  });
});

describe("perVisit — chief complaints / diagnosis history", () => {
  const rx = [
    { createdAt: "2026-10-20T04:00:00.000Z", chiefComplaints: ["Fever 3 days"], finalDiagnosis: ["Viral fever"] },
    { createdAt: "2026-10-28T19:30:00.000Z", chiefComplaints: ["Cough"], finalDiagnosis: [] }, // 29/10 in Dhaka
    { createdAt: "2026-10-25T04:00:00.000Z", chiefComplaints: [" "], finalDiagnosis: ["Asthma"] },
  ];
  it("newest visit first, each line as written, visits with nothing skipped", () => {
    expect(perVisit(rx, "chiefComplaints")).toEqual([
      { date: "29/10/2026", items: ["Cough"] },
      { date: "20/10/2026", items: ["Fever 3 days"] },
    ]);
    expect(perVisit(rx, "finalDiagnosis")).toEqual([
      { date: "25/10/2026", items: ["Asthma"] },
      { date: "20/10/2026", items: ["Viral fever"] },
    ]);
  });
  it("the day is the Dhaka day; an unreadable stamp is no date, never Invalid Date", () => {
    expect(rxDay("2026-10-28T18:00:00.000Z")).toBe("29/10/2026");
    expect(rxDay("nope")).toBe("");
    expect(perVisit(undefined, "finalDiagnosis")).toEqual([]);
  });
});

describe("buildRecordsDoc", () => {
  it("escapes what was typed and keeps every line whole", () => {
    const long = "x".repeat(500);
    const html = buildRecordsDoc({ title: "Drug history", printed: "01/11/2026", patient: [["Name", "<b>A</b>"]], groups: [{ heading: "20/10/2026", lines: [{ text: long }, { text: "a & b", indent: true }] }] });
    expect(html).toContain(long);
    expect(html).toContain("&lt;b&gt;A&lt;/b&gt;");
    expect(html).toContain('class="row ind">a &amp; b');
    expect(html).not.toContain("<b>A</b>");
  });
});
