// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { buildPrescriptionHtml, type PrescriptionDoc, type RxLine } from "./prescriptionDoc";

// ⚕️ The fitting script that runs INSIDE the printed document, run here against
// a document whose geometry is stood in for.
//
// jsdom lays nothing out, so "this cell's text is 6px wider than its column" has
// to be said by the test. What is under test is the script's DECISIONS, which no
// other check can see:
//   · a cell of several words that did not fit is let go and wraps at its spaces;
//   · a single word never is — it would be split mid-word ("Continu / e"), which
//     is worse than the few pixels it spills;
//   · a cell that fits is left exactly as the builder made it;
//   · a spill that cannot be wrapped makes the fill factor back off instead.
// The browser side of it (that a wider font really prints clean) was checked in
// Chromium on 2026-11-15; docs/rules/printing.md says how.

const line = (drug: string, dose: string, duration: string, instruction = ""): RxLine =>
  ({ drug, dose, duration, instruction });

const sheetDoc = (rx: RxLine[]): PrescriptionDoc => ({
  doctorName: "Dr Test",
  patient: { name: "Patient", age: "39", gender: "Male", address: "", weight: "", date: "15/11/2026", phone: "01700000000" },
  clinical: [], rx, advice: [], adviceTest: [], followUp: "",
});

// The non-breaking space the builder prints between a number and its unit.
// Spelled out: a literal one is invisible in source.
const NB = String.fromCharCode(0xa0);

const CELL_RIGHT = 400;   // where every cell's content box ends
const PAD = 4;
const kOf = (sheet: Element) => parseFloat((sheet as HTMLElement).style.getPropertyValue("--k"));

/**
 * Builds the sheet, parses it into a document of its own, and runs the
 * document's own script against it. `textRight(cell, k)` is where the browser
 * would draw the end of that cell's text, in the same pixels as CELL_RIGHT.
 */
function run(
  rx: RxLine[],
  textRight: (cell: HTMLElement, k: number) => number,
  prepare?: (doc: Document) => void,
) {
  const html = buildPrescriptionHtml(sheetDoc(rx));
  const doc = new DOMParser().parseFromString(html, "text/html");
  const script = /<script>([\s\S]*)<\/script>/.exec(html)![1];
  const sheet = doc.querySelector(".sheet") as HTMLElement;
  prepare?.(doc);

  const kNow = () => {
    const k = parseFloat(sheet.style.getPropertyValue("--k"));
    return Number.isFinite(k) ? k : 1;
  };
  // Every cell ends at CELL_RIGHT; the page is never too tall.
  for (const el of Array.from(doc.querySelectorAll("td"))) {
    (el as HTMLElement).getBoundingClientRect = () => ({ right: CELL_RIGHT, height: 20 }) as DOMRect;
  }
  for (const sel of [".pagecontent", ".pagefoot"]) {
    const el = doc.querySelector(sel) as HTMLElement;
    el.getBoundingClientRect = () => ({ right: 0, height: 100 }) as DOMRect;
  }
  let current: HTMLElement | null = null;
  (doc as unknown as { createRange: () => unknown }).createRange = () => ({
    selectNodeContents(n: HTMLElement) { current = n; },
    getClientRects: () => [{ right: textRight(current!, kNow()) }],
  });
  const win = {
    getComputedStyle: () => ({ paddingRight: `${PAD}px` }),
    addEventListener() {},
  };
  new Function("document", "window", script)(doc, win);
  return { doc, sheet };
}

const cellsOf = (doc: Document, text: string) =>
  Array.from(doc.querySelectorAll<HTMLElement>("td.rx-drug, td.rx-mid")).filter((c) => (c.textContent ?? "").includes(text));

describe("the fitting script: an ℞ cell too long for its column", () => {
  beforeAll(() => {
    // jsdom has no canvas; the builder then measures with its own estimate.
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
  });

  const rows = [
    line("Tablet. Napa 500 mg", "1+1+1", "5 days", "Before meal"),
    line("Tablet. Seclo 20 mg", "1+0+0", "Continue", "After meal"),
  ];
  const fitting = (c: HTMLElement) => CELL_RIGHT - PAD - 10;       // 10px of room to spare
  const spilling = (c: HTMLElement) => CELL_RIGHT - PAD + 6;       // 6px past the content box

  it("leaves every cell exactly as built when everything fits", () => {
    const { doc } = run(rows, fitting);
    for (const c of Array.from(doc.querySelectorAll<HTMLElement>("td.rx-drug, td.rx-mid"))) {
      expect(c.style.whiteSpace, c.textContent ?? "").toBe("nowrap");
    }
  });

  it("lets a cell of several words wrap at its spaces — and only that cell", () => {
    const { doc } = run(rows, (c) => ((c.textContent ?? "").includes("Before meal") ? spilling(c) : fitting(c)));
    const [before] = cellsOf(doc, "Before meal");
    expect(before.style.whiteSpace).toBe("normal");
    // Its neighbours in the same row stay on one line.
    for (const text of ["Tablet. Napa", `5${NB}days`]) {
      expect(cellsOf(doc, text)[0].style.whiteSpace, text).toBe("nowrap");
    }
    // And so does the next row.
    expect(cellsOf(doc, "After meal")[0].style.whiteSpace).toBe("nowrap");
  });

  it("never lets a single word go: it would be split mid-word", () => {
    const { doc } = run(rows, (c) => ((c.textContent ?? "").trim() === "Continue" ? spilling(c) : fitting(c)));
    expect(cellsOf(doc, "Continue")[0].style.whiteSpace).toBe("nowrap");
  });

  it("backs the fill factor off when a word that cannot wrap would spill, instead of letting it", () => {
    // "Continue" has 10px to spare at k = 1 and spills once the sheet is grown
    // past k = 1.055 (11px past the content box).
    const spillsFrom = (11 / 200) + 1;
    const grown = run(rows, (c, k) =>
      (c.textContent ?? "").trim() === "Continue" ? CELL_RIGHT - PAD - 10 + (k - 1) * 200 : fitting(c));
    // It grew right up to where nothing spills — not to the sheet's own limit,
    // and not left at its floor.
    expect(kOf(grown.sheet)).toBeLessThanOrEqual(spillsFrom + 0.001);
    expect(kOf(grown.sheet)).toBeGreaterThan(spillsFrom - 0.02);
    // The same sheet with nothing spilling grows well past that.
    expect(kOf(run(rows, fitting).sheet)).toBeGreaterThan(spillsFrom + 0.05);
  });

  // A cell already allowed to wrap (the builder printed that row wrapped) is the
  // browser's to break; it is not a spill the script has to stop, whatever its
  // words measure.
  it("does not count a cell that is already allowed to wrap as a spill", () => {
    const { sheet } = run(
      rows,
      (c) => ((c.textContent ?? "").includes("Tablet. Napa") ? spilling(c) : fitting(c)),
      (doc) => { cellsOf(doc, "Tablet. Napa")[0].style.whiteSpace = "normal"; },
    );
    expect(kOf(sheet)).toBeGreaterThan(1.1);
  });

  it("grows the sheet as far as the width allows when nothing spills", () => {
    const { sheet } = run(rows, fitting);
    expect(kOf(sheet)).toBeGreaterThan(1.1);
  });
});
