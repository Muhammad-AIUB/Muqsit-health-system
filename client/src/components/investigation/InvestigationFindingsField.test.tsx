// @vitest-environment jsdom
//
// ⚕️ The ⊘ Hide surface (physician's decision, 2026-09-21). What prints is
// decided in `lib/investigationHidden.ts` and pinned there; this file holds the
// screen down — above all the part the physician asked for twice: a hidden
// finding must STILL BE READABLE here. A line the doctor cannot see is a line
// they cannot check before they print.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import InvestigationFindingsField from "./InvestigationFindingsField";
import { sortFindingsByDate } from "@/lib/investigationOrder";
import { printableInvestigation } from "@/lib/investigationHidden";

afterEach(cleanup);

const HB = "19/09/2026:CBC:Hb 11.2 g/dL";
const CREAT = "19/09/2026:S. Creatinine:1.4 mg/dL";
const A1C = "21/09/2026:HbA1c:7.8 %";
const ITEMS = [HB, "19/09/2026:CBC:[image attached]", "19/09/2026:Report 2", CREAT, A1C];

const view = (props: Partial<React.ComponentProps<typeof InvestigationFindingsField>> = {}) =>
  render(
    <InvestigationFindingsField
      label="Investigation report findings"
      items={ITEMS}
      invImages={{}}
      onOpen={() => {}}
      {...props}
    />,
  );

// Matched on the accessible name the shared HideToggle gives it, which is the
// same in both directions ("Hide …" / "Show … in printed prescription").
const HIDE_BTN = /in printed prescription$/i;
const hideButton = () => screen.getByRole("button", { name: HIDE_BTN });

describe("⊘ Hide — the control", () => {
  // The IPD detail view renders this same component and passes no handler.
  it("is absent unless the screen opts in", () => {
    const { container } = view();
    expect(screen.queryByRole("button", { name: HIDE_BTN })).toBeNull();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it("carries the physician's own wording as its tooltip", () => {
    view({ hidden: [], onHidden: vi.fn() });
    expect(hideButton().getAttribute("title")).toBe("Hide in Printed Prescription");
  });

  it("hides every printable finding in one press — and nothing that never printed", () => {
    const onHidden = vi.fn();
    view({ hidden: [], onHidden });
    fireEvent.click(hideButton());
    expect(onHidden).toHaveBeenCalledWith([HB, CREAT, A1C]);
  });

  it("brings them all back on the second press", () => {
    const onHidden = vi.fn();
    view({ hidden: [HB, CREAT, A1C], onHidden });
    fireEvent.click(hideButton());
    expect(onHidden).toHaveBeenCalledWith([]);
  });

  // The doctor has to be able to tell at a glance that this field is not
  // printing in full, without opening anything.
  it("says how many are hidden and marks itself pressed", () => {
    view({ hidden: [HB], onHidden: vi.fn() });
    const b = hideButton();
    expect(b.textContent).toContain("Hidden (1)");
    expect(b.getAttribute("aria-pressed")).toBe("true");
  });

  it("reads plain 'Hide' and is unpressed while everything prints", () => {
    view({ hidden: [], onHidden: vi.fn() });
    const b = hideButton();
    expect(b.textContent).toContain("Hide");
    expect(b.textContent).not.toContain("Hidden");
    expect(b.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("⊘ Hide — the rows", () => {
  it("ticks by the exact stored finding, not the displayed text", () => {
    const onHidden = vi.fn();
    view({ hidden: [], onHidden });
    fireEvent.click(screen.getByLabelText(/Hide "S\. Creatinine:1\.4 mg\/dL"/));
    expect(onHidden).toHaveBeenCalledWith([CREAT]);
  });

  it("unticks a finding that was hidden, leaving the others alone", () => {
    const onHidden = vi.fn();
    view({ hidden: [HB, CREAT], onHidden });
    fireEvent.click(screen.getByLabelText(/Hide "CBC:Hb 11\.2 g\/dL"/));
    expect(onHidden).toHaveBeenCalledWith([CREAT]);
  });

  it("shows the tick as checked for a hidden finding only", () => {
    view({ hidden: [A1C], onHidden: vi.fn() });
    expect((screen.getByLabelText(/Hide "HbA1c:7\.8 %"/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Hide "CBC:Hb 11\.2 g\/dL"/) as HTMLInputElement).checked).toBe(false);
  });

  // ⚕️ The physician's instruction, verbatim: "Don't hide or remove any lines
  // from the website." A hidden finding is marked, never taken away.
  it("keeps a hidden finding fully readable on screen", () => {
    const { container } = view({ hidden: [HB, CREAT, A1C], onHidden: vi.fn() });
    const text = container.textContent ?? "";
    expect(text).toContain("CBC:Hb 11.2 g/dL");
    expect(text).toContain("S. Creatinine:1.4 mg/dL");
    expect(text).toContain("HbA1c:7.8 %");
    expect(text).toContain("⊘"); // the marker that says it will not print
  });

  // A tick here would change nothing on paper, which would be a lie on screen.
  it("offers no tick on lines the sheet never carried", () => {
    const { container } = view({ hidden: [], onHidden: vi.fn() });
    // Three printable findings, three ticks — the image marker and the
    // report-pool row get none.
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
  });

  it("offers no tick on a synthesised row (a report attached, no value yet)", () => {
    const { container } = view({
      items: ["19/09/2026:Ultrasound:[image attached]"],
      invImages: { "19/09/2026|Ultrasound": "https://x/y.jpg" },
      hidden: [], onHidden: vi.fn(),
    });
    expect(container.textContent).toContain("Ultrasound");
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });
});

// ⚕️ A year of labs typed across many visits has no order of its own. The
// sidebar and the printed sheet are ordered by the SAME module
// (`lib/investigationOrder.ts`), so what the doctor checks here is what prints.
describe("date order", () => {
  const MIXED = [
    "08/09/2026:CBC:Hb 11.7 g/dL",
    "19/06/2026:USG:Chronic liver disease",
    "24/01/2025:CBC:Hb 11.7 g/dL",
    "08/09/2026:TSH:2.75 mIU/L",
    "19/09/2026:AFP:5.57 ng/mL",
  ];
  const headings = (container: HTMLElement) =>
    (container.textContent ?? "").match(/\d{2}\/\d{2}\/\d{4}/g) ?? [];

  it("puts the most recent date at the top and the oldest last", () => {
    const { container } = view({ items: MIXED });
    expect(headings(container)).toEqual(["19/09/2026", "08/09/2026", "19/06/2026", "24/01/2025"]);
  });

  it("gathers every finding of one date under a single heading", () => {
    const { container } = view({ items: MIXED });
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    // The two 08/09 findings sit together, under one date, in the order typed.
    expect(text).toMatch(/08\/09\/2026.*CBC:Hb 11\.7 g\/dL.*TSH:2\.75 mIU\/L/);
    expect(headings(container).filter((d) => d === "08/09/2026")).toHaveLength(1);
  });

  it("keeps an undated finding at the end rather than dating it", () => {
    const { container } = view({ items: ["Urine R/E normal", "08/09/2026:CBC:Hb 11.7 g/dL"] });
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toMatch(/08\/09\/2026.*CBC:Hb 11\.7 g\/dL.*Urine R\/E normal/);
  });
});

// ⚕️ The physician's requirement, 2026-09-21: "the website screen and printed
// prescription must follow exactly the same serial order". Both read their
// order from `lib/investigationOrder.ts`; this test is what stops them drifting
// apart, by walking the rendered DOM and comparing it to the list the printed
// sheet is built from.
describe("screen order === printed order", () => {
  const SCRAMBLED = [
    "08/09/2026:CBC:Hb 11.7 g/dL",
    "19/06/2026:USG:Chronic liver disease",
    "24/01/2025:CBC:Hb 11.7 g/dL",
    "08/09/2026:TSH:2.75 mIU/L",
    "19/09/2026:AFP:5.57 ng/mL",
    "23/01/2025:HbA1c:7.4 %",
    "08/09/2026:Bilirubin Total:2.14 mg/dL",
    "22/01/2025:Dengue NS1:Negative",
    "19/06/2026:HBV DNA:Not Detected IU/mL",
    "12/06/2025:S. Insulin (Fasting):1.37 uIU/mL",
  ];

  /** Every finding row the sidebar renders, in DOM order. The trailing ⊘ on a
   *  hidden row is a marker, not part of the finding, so it is stripped. */
  const onScreen = (container: HTMLElement): string[] =>
    [...container.querySelectorAll("span")]
      .map((el) => (el.textContent ?? "").replace(/⊘/g, "").trim())
      .filter((t) => t.includes(":") && !/^\d{2}\/\d{2}\/\d{4}$/.test(t));

  it("renders the findings in the exact order the printed sheet lists them", () => {
    const { container } = view({ items: SCRAMBLED });
    // What PrescriptionView hands to the document, minus the date stamps that
    // the sidebar prints once per group instead of once per row.
    const printed = sortFindingsByDate(printableInvestigation(SCRAMBLED, []))
      .map((s) => s.replace(/^\d{2}\/\d{2}\/\d{4}:/, ""));
    expect(onScreen(container)).toEqual(printed);
  });

  // A hidden finding stays on screen and leaves the paper; the ones that remain
  // must not be re-ordered by its absence.
  it("keeps the same relative order when a finding is hidden from the print", () => {
    const hidden = ["08/09/2026:TSH:2.75 mIU/L"];
    const { container } = view({ items: SCRAMBLED, hidden, onHidden: vi.fn() });
    const printed = sortFindingsByDate(printableInvestigation(SCRAMBLED, hidden))
      .map((s) => s.replace(/^\d{2}\/\d{2}\/\d{4}:/, ""));
    const screenMinusHidden = onScreen(container).filter((t) => t !== "TSH:2.75 mIU/L");
    expect(screenMinusHidden).toEqual(printed);
  });
});
