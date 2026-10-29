// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildQueueDoc, type QueueDocRow } from "./opdQueueDoc";

const row = (name: string, over: Partial<QueueDocRow> = {}): QueueDocRow =>
  ({ name, phone: "01810101515", age: 34, gender: "Male", ...over });

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const cellsOf = (html: string) =>
  Array.from(parse(html).querySelectorAll("tbody tr")).map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent));

describe("buildQueueDoc", () => {
  it("heads the sheet with the doctor, the day and the number of patients", () => {
    const doc = parse(buildQueueDoc({ doctorName: "Dr. Rahim", day: "2026-10-30", rows: [row("A"), row("B")], times: [] }));
    const head = doc.querySelector("header")?.textContent ?? "";
    expect(head).toContain("Dr. Rahim");
    expect(head).toContain("30/10/2026");
    expect(head).toContain("Total patients: 2");
  });

  it("prints no name line when no doctor is known", () => {
    const doc = parse(buildQueueDoc({ doctorName: "", day: "2026-10-30", rows: [row("A")], times: [] }));
    expect(doc.querySelector("[data-doctor]")).toBeNull();
  });

  it("lists the six columns in the serial order given", () => {
    const html = buildQueueDoc({ doctorName: "", day: "2026-10-30", rows: [row("Zed"), row("Amy", { gender: "F", age: 7 })], times: [18 * 60, 18 * 60 + 10] });
    const heads = Array.from(parse(html).querySelectorAll("thead th")).map((th) => th.textContent);
    expect(heads).toEqual(["Serial", "Name", "Gender", "Age", "Mobile", "Appointment time"]);
    expect(cellsOf(html)).toEqual([
      ["1", "Zed", "Male", "34y", "01810101515", "6:00 PM"],
      ["2", "Amy", "Female", "7y", "01810101515", "6:10 PM"],
    ]);
  });

  it("shows a dash for what is not recorded, and for a time the screen does not show", () => {
    const html = buildQueueDoc({ doctorName: "", day: "2026-10-30", rows: [row("A", { phone: null, age: null, gender: null })], times: [] });
    expect(cellsOf(html)).toEqual([["1", "A", "—", "—", "—", "—"]]);
  });

  it("keeps an age of 0 (a newborn is not 'not recorded')", () => {
    expect(cellsOf(buildQueueDoc({ doctorName: "", day: "2026-10-30", rows: [row("A", { age: 0 })], times: [] }))[0][3]).toBe("0y");
  });

  it("escapes what was typed", () => {
    const html = buildQueueDoc({ doctorName: "Dr <b>X</b>", day: "2026-10-30", rows: [row("<img src=x onerror=alert(1)>", { phone: "&<" })], times: [] });
    const doc = parse(html);
    expect(doc.querySelector("img")).toBeNull();
    expect(doc.querySelector("b")).toBeNull();
    expect(cellsOf(html)[0][1]).toBe("<img src=x onerror=alert(1)>");
    expect(cellsOf(html)[0][4]).toBe("&<");
  });

  it("prints every one of 300 patients, whole", () => {
    const long = "Mohammad Abdul Rahman Chowdhury Al-Mamun bin Kashem ".repeat(3).trim();
    const rows = Array.from({ length: 300 }, (_, i) => row(i === 299 ? long : `Patient ${i + 1}`));
    const cells = cellsOf(buildQueueDoc({ doctorName: "", day: "2026-10-30", rows, times: [] }));
    expect(cells).toHaveLength(300);
    expect(cells[299][0]).toBe("300");
    expect(cells[299][1]).toBe(long);
  });

  it("is an A4 page whose table head repeats and whose rows do not split", () => {
    const html = buildQueueDoc({ doctorName: "", day: "2026-10-30", rows: [row("A")], times: [] });
    expect(html).toMatch(/@page\s*{\s*size:\s*A4/);
    expect(html).toMatch(/thead\s*{[^}]*display:\s*table-header-group/);
    expect(html).toMatch(/tr\s*{[^}]*break-inside:\s*avoid/);
    expect(html).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("escapes the day too: a day string cannot open an element in the title", () => {
    const html = buildQueueDoc({ doctorName: "", day: '"><script>x', rows: [row("A")], times: [] });
    expect(parse(html).querySelector("script")).toBeNull();
  });

  it("prints an unbroken 60-character name and mobile whole, in their own cells", () => {
    const name = "N".repeat(60);
    const phone = "9".repeat(60);
    const cells = cellsOf(buildQueueDoc({ doctorName: "", day: "2026-10-30", rows: [row(name, { phone })], times: [] }));
    expect(cells[0][1]).toBe(name);
    expect(cells[0][4]).toBe(phone);
  });

  it("prints a dash for a name and a phone that are only spaces", () => {
    const cells = cellsOf(buildQueueDoc({ doctorName: "", day: "2026-10-30", rows: [row("   ", { phone: "  	 " })], times: [] }));
    expect(cells[0][1]).toBe("—");
    expect(cells[0][4]).toBe("—");
  });

  it("prints a time where there is one and a dash where there is none, row by row", () => {
    const cells = cellsOf(buildQueueDoc({ doctorName: "", day: "2026-10-30", rows: [row("A"), row("B")], times: [600, undefined] }));
    expect(cells[0][5]).toBe("10:00 AM");
    expect(cells[1][5]).toBe("—");
  });
});
