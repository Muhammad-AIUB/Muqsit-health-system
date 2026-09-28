// @vitest-environment jsdom
//
// ⚕️ Every radio/select in a calculator starts UNSELECTED. Seeding option 0
// made each `required` choice silently answered: NEWS opened at 15 "High risk"
// with nothing touched, eGFR ran CKD-EPI as a man, CHA₂DS₂-VASc added +1 for
// female. A result must not exist until the doctor has picked every choice.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CalcRenderer from "./CalcRenderer";

afterEach(cleanup);

const selectWithOption = (container: HTMLElement, label: string): HTMLSelectElement => {
  const sel = Array.from(container.querySelectorAll("select")).find((s) =>
    Array.from(s.options).some((o) => o.text === label),
  );
  if (!sel) throw new Error(`no select offering "${label}"`);
  return sel;
};
const pick = (sel: HTMLSelectElement, label: string) => {
  const opt = Array.from(sel.options).find((o) => o.text === label)!;
  fireEvent.change(sel, { target: { value: opt.value } });
};
const numberInputs = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLInputElement>('input[type="number"]'));

describe("CalcRenderer — choices start unselected", () => {
  it("NEWS shows no score until every choice is picked", () => {
    const { container } = render(<CalcRenderer calcId="news" onAdd={() => {}} />);
    const selects = Array.from(container.querySelectorAll("select"));
    expect(selects).toHaveLength(7);
    for (const s of selects) expect(s.value).toBe("");
    expect(screen.queryByText("Add result")).toBeNull();

    // Pick the 0-point answer on every row → a real, low score.
    pick(selectWithOption(container, "12-20 (0)"), "12-20 (0)");
    pick(selectWithOption(container, "≥96% (0)"), "≥96% (0)");
    pick(selectWithOption(container, "Yes (+2)"), "No (0)");
    pick(selectWithOption(container, "36.1-38.0°C (0)"), "36.1-38.0°C (0)");
    pick(selectWithOption(container, "111-219 (0)"), "111-219 (0)");
    expect(screen.queryByText("Add result")).toBeNull(); // still two unanswered
    pick(selectWithOption(container, "51-90 (0)"), "51-90 (0)");
    pick(selectWithOption(container, "Alert (0)"), "Alert (0)");
    expect(screen.getByText("Add result")).toBeTruthy();
  });

  it("eGFR does not compute until sex is chosen", () => {
    const { container } = render(<CalcRenderer calcId="egfr" onAdd={() => {}} />);
    const [cr, age] = numberInputs(container);
    fireEvent.change(cr, { target: { value: "1" } });
    fireEvent.change(age, { target: { value: "50" } });
    const sex = selectWithOption(container, "Female");
    expect(sex.value).toBe("");
    expect(screen.queryByText("Add result")).toBeNull();
    pick(sex, "Female");
    expect(screen.getByText("Add result")).toBeTruthy();
  });

  it("Cockcroft-Gault offers sex and computes once it is chosen", () => {
    const { container } = render(<CalcRenderer calcId="cockcroft-gault" onAdd={() => {}} />);
    const [age, weight, cr] = numberInputs(container);
    fireEvent.change(age, { target: { value: "40" } });
    fireEvent.change(weight, { target: { value: "72" } });
    fireEvent.change(cr, { target: { value: "1" } });
    expect(screen.queryByText("Add result")).toBeNull();
    // (140 − 40) × 72 × 0.85 / (72 × 1) = 85 mL/min for a woman.
    pick(selectWithOption(container, "Female"), "Female");
    expect(screen.getByText("Add result")).toBeTruthy();
    expect(container.textContent).toContain("85");
  });

  it("offers one placeholder, not two, on the blood-volume sex select", () => {
    const { container } = render(<CalcRenderer calcId="blood-volume" onAdd={() => {}} />);
    pick(selectWithOption(container, "Child ≥25 kg or adult"), "Child ≥25 kg or adult");
    const sex = selectWithOption(container, "Male");
    expect(Array.from(sex.options).map((o) => o.text)).toEqual(["Select…", "Male", "Female"]);
    expect(sex.value).toBe("");
  });
});
