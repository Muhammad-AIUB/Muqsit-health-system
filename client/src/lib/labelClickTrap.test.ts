import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { detectLabelClickTraps } from "./labelClickTrap";

// ⚕️ REGRESSION — "Keep eye on this patient" did nothing when clicked.
//
// The markup below is the EXACT source that shipped until 2026-08-17. A <label>
// with its own onClick, wrapping a hidden checkbox, fires that onClick twice per
// user click (real click + the browser's activation click at the labelled
// control, bubbling back up). React flushes between them, the second call reads
// the state the first just wrote, and the toggle lands back where it started.
//
// Measured in a browser before the fix: 2 trusted click events per click, tick
// never rendered. Suppressing exactly one of them made it work — which is what
// confirmed the cause rather than guessing at it.
//
// The first test proves this detector actually catches the bug; the last proves
// the shape is gone from the codebase and cannot quietly return.

const BROKEN = `
  <label onClick={toggleWatch} style={{ display: "flex", cursor: "pointer" }}>
    <span>{watchPatient ? "👁️" : "👁"}</span>
    <span>Keep eye on this patient</span>
    <input type="checkbox" checked={watchPatient} onChange={() => {}} style={{ display: "none" }} />
    <span>{watchPatient ? "✓" : ""}</span>
  </label>
`;

const FIXED = `
  <button type="button" role="switch" aria-checked={watchPatient} onClick={toggleWatch}>
    <span>{watchPatient ? "👁️" : "👁"}</span>
    <span>Keep eye on this patient</span>
    <span aria-hidden>{watchPatient ? "✓" : ""}</span>
  </button>
`;

describe("detectLabelClickTraps", () => {
  it("CATCHES the exact markup that broke the watch toggle", () => {
    const found = detectLabelClickTraps(BROKEN);
    expect(found).toHaveLength(1);
    expect(found[0].snippet).toContain("onClick={toggleWatch}");
  });

  it("passes the fixed markup — a button cannot activate a labelled control", () => {
    expect(detectLabelClickTraps(FIXED)).toEqual([]);
  });

  it("leaves an ordinary label alone", () => {
    // A label with no click handler is the whole point of labels.
    expect(detectLabelClickTraps(`<label><input type="checkbox" onChange={f} /> Select all</label>`)).toEqual([]);
  });

  it("leaves a click-handling label with NO control alone", () => {
    // No labelled control means no activation click, so no double fire.
    expect(detectLabelClickTraps(`<label onClick={f}><span>Just text</span></label>`)).toEqual([]);
  });

  it("catches select and textarea too, not only checkboxes", () => {
    expect(detectLabelClickTraps(`<label onClick={f}><select /></label>`)).toHaveLength(1);
    expect(detectLabelClickTraps(`<label onClick={f}><textarea /></label>`)).toHaveLength(1);
  });

  it("does not blame a label for an onClick on a CHILD element", () => {
    expect(
      detectLabelClickTraps(`<label><button onClick={f}>x</button><input /></label>`),
    ).toEqual([]);
  });

  it("reports the line number so the failure is actionable", () => {
    expect(detectLabelClickTraps(`\n\n${BROKEN}`)[0].line).toBe(4);
  });

  it("never throws on odd input", () => {
    for (const v of ["", "<label", "</label>", "<label onClick={f}>", null, undefined]) {
      expect(() => detectLabelClickTraps(v as unknown as string)).not.toThrow();
    }
  });
});

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, acc);
    else if (entry.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

describe("no label click traps anywhere in the app", () => {
  it("scans every .tsx and finds none", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(join(process.cwd(), "src"))) {
      for (const t of detectLabelClickTraps(readFileSync(file, "utf8"))) {
        offenders.push(`${file.replace(process.cwd(), ".")}:${t.line} — ${t.snippet}`);
      }
    }
    // A failure here means a control that looks clickable does nothing.
    // Move the handler to a <button>, or handle onChange on the input.
    expect(offenders).toEqual([]);
  });
});
