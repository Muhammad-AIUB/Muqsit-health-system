// @vitest-environment jsdom
//
// The health-trend chart on a narrow screen.
//
// ⚕️ The chart is one drawing, 800 units wide, and it used to be stretched or
// SHRUNK to whatever width it was given. On a phone that is half size: measured
// at 375px, a lab value ("9.8g/dL") stood 5px tall — a number a doctor cannot
// read is a number they will guess. Below about 720px the drawing now keeps its
// own size, the plot scrolls sideways, and the column of names stays put.
//
// jsdom lays nothing out, so the width of the chart's own box is given by hand.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import HealthTrendsChart from "./HealthTrendsChart";

const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
const giveBox = (width: number, plotScrollWidth = 0) => {
  Object.defineProperty(proto, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) { return this.hasAttribute("data-chart-wrap") ? width : 0; },
  });
  Object.defineProperty(proto, "scrollWidth", {
    configurable: true,
    get(this: HTMLElement) { return this.hasAttribute("data-chart-scroll") ? plotScrollWidth : 0; },
  });
};

afterEach(() => {
  cleanup();
  delete proto.clientWidth;
  delete proto.scrollWidth;
});

// Dates counted back from today, so "Today" is always on the axis whenever the
// suite is run.
const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86_400_000);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const LONG_NAME = "Capsule (Enteric Coated). Sergel 40 mg";

const draw = (drugs: string[] = [LONG_NAME]) =>
  render(
    <HealthTrendsChart
      investigationSummary={[
        { date: daysAgo(180), category: "Hematology", test: "CBC", value: "Hb:9.8g/dL" },
        { date: daysAgo(90), category: "Hematology", test: "CBC", value: "Hb:10.6g/dL" },
        { date: daysAgo(10), category: "Hematology", test: "CBC", value: "Hb:12.1g/dL" },
      ]}
      drugRanges={drugs.map((name, i) => ({ name, start: daysAgo(180 - i * 40), end: daysAgo(10 + i * 5) }))}
      symptomRanges={[]}
      drugDates={{}}
      symptomDates={{}}
      canEdit={false}
      saveError={null}
      onSaveDrugDates={vi.fn()}
      onSaveSymptomDates={vi.fn()}
    />,
  );

const drawings = (c: HTMLElement) => Array.from(c.querySelectorAll<SVGSVGElement>("[data-chart-wrap] svg"));
const plotOf = (c: HTMLElement) => c.querySelector<SVGSVGElement>('[data-chart-wrap] svg[role="img"]') as SVGSVGElement;
const box = (svg: SVGSVGElement) => (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
/** The strip of names beside the plot (a phone only). */
const namesOf = (c: HTMLElement) => drawings(c).find((s) => s !== plotOf(c)) as SVGSVGElement;
const written = (svg: SVGSVGElement) => Array.from(svg.querySelectorAll("text")).map((t) => (t.textContent ?? "").trim());
const textOf = (svg: SVGSVGElement, s: string) => Array.from(svg.querySelectorAll("text")).find((t) => (t.textContent ?? "").trim() === s) as SVGTextElement;

describe("HealthTrendsChart — on a wide screen", () => {
  it("is one drawing that fills the width it is given", () => {
    giveBox(900);
    const { container } = draw();
    expect(drawings(container)).toHaveLength(1);
    const svg = plotOf(container);
    expect(svg.getAttribute("width")).toBe("100%");
    expect(box(svg).slice(0, 3)).toEqual([0, 0, 800]);
  });

  it("is drawn the same way before its box has been measured", () => {
    const { container } = draw();
    expect(drawings(container)).toHaveLength(1);
    expect(plotOf(container).getAttribute("width")).toBe("100%");
  });

  it("⚕️ draws no month line or month label outside the plot", () => {
    // The first month on the axis starts before the first reading, so its line
    // and its label used to be drawn to the LEFT of the plot — through the
    // column of names, where "Mar 26" stood under a medicine as if it were its date.
    giveBox(900);
    const { container } = draw();
    const svg = plotOf(container);
    const monthLabels = Array.from(svg.querySelectorAll("text")).filter((t) => /^[A-Z][a-z]{2} \d{2}$/.test((t.textContent ?? "").trim()));
    expect(monthLabels.length).toBeGreaterThan(1);
    for (const t of monthLabels) expect(Number(t.getAttribute("x"))).toBeGreaterThanOrEqual(150);
    // A label is about 28 units wide. Centred on a line within 14 units of an
    // edge it would hang half outside the plot, so there it is set inward.
    for (const t of monthLabels) {
      const x = Number(t.getAttribute("x"));
      const anchor = t.getAttribute("text-anchor");
      if (x - 14 < 150) expect(anchor).toBe("start");
      else if (x + 14 > 784) expect(anchor).toBe("end");
      else expect(anchor).toBe("middle");
    }
    const uprights = Array.from(svg.querySelectorAll("line")).filter((l) => l.getAttribute("x1") === l.getAttribute("x2"));
    expect(uprights.length).toBeGreaterThan(1);
    for (const l of uprights) expect(Number(l.getAttribute("x1"))).toBeGreaterThanOrEqual(150);
  });

  it("writes nothing smaller than the values it plots", () => {
    giveBox(900);
    const { container } = draw();
    const sizes = Array.from(container.querySelectorAll("[data-chart-wrap] svg text")).map((t) => Number(t.getAttribute("font-size")));
    expect(sizes.length).toBeGreaterThan(3);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(9);
  });

  it("a name is one line beside its bar, as it has always been there", () => {
    giveBox(900);
    const { container } = draw([LONG_NAME, "Tablet. Napa 500 mg"]);
    const texts = written(plotOf(container));
    expect(texts).toContain("Capsule (Enteric Co…");
    expect(texts).toContain("Tablet. Napa 500 mg");
    expect(texts).not.toContain("Sergel 40 mg");
  });
});

describe("HealthTrendsChart — on a phone", () => {
  it("⚕️ the plot is not shrunk with the screen: it keeps its size and scrolls sideways", () => {
    giveBox(280);
    const { container } = draw();
    const svg = plotOf(container);
    const drawn = Number(svg.getAttribute("width"));
    const [, , units] = box(svg);
    // Every unit of the drawing is at least a pixel, so a value written at 9
    // units is at least 9px — it was 4.
    expect(drawn / units).toBeGreaterThanOrEqual(1);
    expect(drawn).toBeGreaterThan(280);
    expect((svg.parentElement as HTMLElement).style.overflowX).toBe("auto");
  });

  it("⚕️ the names stay on screen while the plot scrolls under them", () => {
    giveBox(280);
    const { container } = draw();
    const all = drawings(container);
    expect(all).toHaveLength(2);
    const plot = plotOf(container);
    const names = all.find((s) => s !== plot) as SVGSVGElement;
    // Outside the part that scrolls…
    expect((plot.parentElement as HTMLElement).contains(names)).toBe(false);
    // …showing exactly the strip to the left of the plot (which starts at 150).
    const [x, , w] = box(names);
    expect(x + w).toBeCloseTo(150, 5);
    expect(box(plot)[0]).toBe(150);
    // One drawing is enough for a screen reader.
    expect(names.getAttribute("aria-hidden")).toBe("true");
    // …and it is narrow enough to leave the plot most of the phone.
    expect(Number(names.getAttribute("width"))).toBeLessThanOrEqual(280 * 0.4);
  });

  // In this app a medicine's label STARTS with its dosage form. Cut at its end
  // to fit a phone's column of names, "Capsule (Enteric Coated). Sergel 40 mg"
  // read "Capsule (Ente…" — the medicine itself gone.
  it("⚕️ a medicine is named by its brand and strength, whole — it is the dosage form that gives way", () => {
    giveBox(280);
    const { container } = draw();
    const names = namesOf(container);
    const texts = written(names);
    expect(texts).toContain("Sergel 40 mg");
    const form = texts.find((t) => t.startsWith("Capsule"));
    expect(form).toBeTruthy();
    expect(form?.endsWith("…")).toBe(true);
    expect(LONG_NAME.startsWith((form as string).slice(0, -1))).toBe(true);
    // Both lines set from the column's own left edge, inside it.
    const [x] = box(names);
    for (const s of ["Sergel 40 mg", form as string]) {
      const t = textOf(names, s);
      expect(t.getAttribute("text-anchor")).toBe("start");
      expect(Number(t.getAttribute("x"))).toBeGreaterThanOrEqual(x);
    }
  });

  it("⚕️ two strengths of one medicine are two different names — a dose change can be read off the bars", () => {
    giveBox(280);
    const { container } = draw(["Tablet. Entaliv 0.5 mg", "Tablet. Entaliv 1 mg"]);
    const texts = written(namesOf(container));
    expect(texts).toContain("Entaliv 0.5 mg");
    expect(texts).toContain("Entaliv 1 mg");
    // …where one line cut at its end gave "Tablet. Entali…" twice.
    expect(texts.filter((t) => t.startsWith("Tablet. Enta"))).toEqual([]);
  });

  it("the two lines of a name stand in their own row: the form above, quieter, the name under it", () => {
    giveBox(280);
    const { container } = draw(["Tablet. Entaliv 0.5 mg", "Tablet. Entaliv 1 mg"]);
    const names = namesOf(container);
    const rows = ["Entaliv 0.5 mg", "Entaliv 1 mg"].map((s) => {
      const name = textOf(names, s);
      const group = name.parentElement as Element;
      const lines = Array.from(group.querySelectorAll("text"));
      expect(lines.map((t) => (t.textContent ?? "").trim())).toEqual(["Tablet.", s]);
      const [formY, nameY] = lines.map((t) => Number(t.getAttribute("y")));
      // The bar marks the middle of the row, which is 28 units tall.
      const bar = group.querySelector("rect[rx]") as SVGRectElement;
      const mid = Number(bar.getAttribute("y")) + Number(bar.getAttribute("height")) / 2;
      expect(nameY - formY).toBeGreaterThanOrEqual(10); // one line clear of the other
      expect(formY - 8).toBeGreaterThanOrEqual(mid - 14);
      expect(nameY + 3).toBeLessThanOrEqual(mid + 14);
      expect(Number(lines[0].getAttribute("font-size"))).toBeLessThanOrEqual(Number(lines[1].getAttribute("font-size")));
      return { formY, nameY };
    });
    // …and the second medicine's lines are a whole row below the first's.
    expect(rows[1].formY).toBeGreaterThan(rows[0].nameY);
  });

  it("a name that fits its column is still one line", () => {
    giveBox(280);
    const { container } = draw(["Napa 500 mg"]);
    const texts = written(namesOf(container));
    expect(texts.filter((t) => t.includes("Napa"))).toEqual(["Napa 500 mg"]);
  });

  it("the full name is still there to be read: on the bar's own tooltip", () => {
    giveBox(280);
    const { container } = draw();
    const titles = Array.from(plotOf(container).querySelectorAll("title")).map((t) => t.textContent ?? "");
    expect(titles.some((t) => t.startsWith(LONG_NAME))).toBe(true);
  });

  it("opens on the newest readings — the plot starts scrolled to its end", () => {
    giveBox(280, 715);
    const { container } = draw();
    const scroller = container.querySelector("[data-chart-scroll]") as HTMLElement;
    expect(scroller).toBeTruthy();
    expect(scroller.scrollLeft).toBe(715);
  });

  it("says that it scrolls", () => {
    giveBox(280);
    const { container } = draw();
    expect(container.textContent).toMatch(/scroll sideways/i);
  });
});
