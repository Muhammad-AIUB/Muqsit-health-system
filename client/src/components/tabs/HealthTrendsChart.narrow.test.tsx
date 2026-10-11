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

const draw = () =>
  render(
    <HealthTrendsChart
      investigationSummary={[
        { date: daysAgo(180), category: "Hematology", test: "CBC", value: "Hb:9.8g/dL" },
        { date: daysAgo(90), category: "Hematology", test: "CBC", value: "Hb:10.6g/dL" },
        { date: daysAgo(10), category: "Hematology", test: "CBC", value: "Hb:12.1g/dL" },
      ]}
      drugRanges={[{ name: LONG_NAME, start: daysAgo(180), end: daysAgo(10) }]}
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

  it("⚕️ a long name is cut at its END to fit the column — never from its start", () => {
    giveBox(280);
    const { container } = draw();
    const plot = plotOf(container);
    const names = drawings(container).find((s) => s !== plot) as SVGSVGElement;
    const label = Array.from(names.querySelectorAll("text")).find((t) => (t.textContent ?? "").trim().startsWith("Capsule"));
    expect(label).toBeTruthy();
    const text = (label?.textContent ?? "").trim();
    expect(text.endsWith("…")).toBe(true);
    expect(LONG_NAME.startsWith(text.slice(0, -1))).toBe(true);
    // Set from the column's own left edge, so it is the end that gives way.
    expect(label?.getAttribute("text-anchor")).toBe("start");
    const [x] = box(names);
    expect(Number(label?.getAttribute("x"))).toBeGreaterThanOrEqual(x);
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
