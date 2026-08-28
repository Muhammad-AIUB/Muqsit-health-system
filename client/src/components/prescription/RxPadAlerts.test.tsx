// @vitest-environment jsdom
//
// ⚕️ The ℞ pad's warning surface. What matters clinically is that the sign
// lights up whenever a warned medicine is on the pad, that pressing it shows
// the physician's wording untouched, and that it says WHICH medicine — the pad
// no longer answers that by position.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RxPadAlerts, { panelAnchor, PANEL_W } from "./RxPadAlerts";
import type { RxAlertInput } from "@/lib/rxAlerts";

const ignored = new Set<string>();
const ignoreAlert = vi.fn((id: string) => ignored.add(id));
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({ ignoredAlerts: ignored, ignoreAlert }),
}));

afterEach(() => {
  cleanup();
  ignored.clear();
  ignoreAlert.mockClear();
});

const PREGNANCY_MSG = "Entecavir is contraindicated in pregnancy and lactation. Use tenofovir disoproxil.";
const PPI_MSG = "Sofosbuvir/Velpatasvir dose must have atleast 4 hours gap before taking Proton Pump Inhibitor";

const sign = () => screen.queryByRole("button", { name: /prescribing warning/i });
const press = () => fireEvent.click(sign() as HTMLElement);

const withEntecavir = (conditions: string[]): RxAlertInput => ({
  rxDrugs: [{ text: "Tablet. Barcavir 0.5 mg", generic: "Entecavir" }],
  sidebar: [{ label: "Final diagnosis", items: conditions }],
});

describe("RxPadAlerts", () => {
  it("shows nothing at all when no rule fires", () => {
    render(<RxPadAlerts input={{ rxDrugs: [{ text: "Tab. Napa 500mg" }], sidebar: [] }} />);
    expect(sign()).toBeNull();
  });

  it("lights ONE sign when a warned medicine is written", () => {
    render(<RxPadAlerts input={withEntecavir(["Pregnant"])} />);
    expect(sign()).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("keeps the advice out of the way until the sign is pressed", () => {
    render(<RxPadAlerts input={withEntecavir(["Pregnant"])} />);
    expect(screen.queryByText(PREGNANCY_MSG)).toBeNull();
    press();
    expect(screen.getByText(PREGNANCY_MSG)).toBeTruthy();
  });

  it("stays ONE sign however many warnings there are, and lists them all", () => {
    render(<RxPadAlerts input={withEntecavir(["Pregnant", "CKD", "Decompensated liver cirrhosis"])} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(sign()!.getAttribute("aria-label")).toMatch(/^3 prescribing warnings/);
    press();
    expect(screen.getByText(PREGNANCY_MSG)).toBeTruthy();
    expect(screen.getByText(/CrCl at least 50 mL\/min: 0.5 mg orally once a day/)).toBeTruthy();
    expect(screen.getByText(/use entecavir -double of usual dose/)).toBeTruthy();
  });

  it("names the medicine that raised each warning", () => {
    render(<RxPadAlerts input={withEntecavir(["Pregnant"])} />);
    press();
    expect(screen.getByText("Tablet. Barcavir 0.5 mg")).toBeTruthy();
  });

  it("names both medicines of a drug-drug rule, on one entry", () => {
    render(
      <RxPadAlerts
        input={{
          rxDrugs: [{ text: "Tab. Velpatasvir/Sofosbuvir" }, { text: "Tab. Omeprazole 20mg" }],
          sidebar: [],
        }}
      />,
    );
    press();
    expect(screen.getAllByText(PPI_MSG)).toHaveLength(1);
    expect(screen.getByText("Tab. Velpatasvir/Sofosbuvir + Tab. Omeprazole 20mg")).toBeTruthy();
  });

  it("renders a dosing table with its line breaks intact", () => {
    const { container } = render(<RxPadAlerts input={withEntecavir(["CKD"])} />);
    press();
    const body = [...container.querySelectorAll("div")].find((d) => d.style.whiteSpace === "pre-line");
    expect(body).toBeTruthy();
    expect(body!.textContent).toContain("CrCl less than 10 mL/min: 0.05 mg orally once a day or 0.5 mg orally every 7 days");
  });

  it("closes again on a second press, and on Escape", () => {
    render(<RxPadAlerts input={withEntecavir(["Pregnant"])} />);
    press();
    press();
    expect(screen.queryByText(PREGNANCY_MSG)).toBeNull();
    press();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText(PREGNANCY_MSG)).toBeNull();
  });

  it("offers Ignore Warning on entecavir only, and puts the sign out once used", () => {
    const { rerender } = render(<RxPadAlerts input={withEntecavir(["Pregnant"])} />);
    press();
    fireEvent.click(screen.getByText("Ignore Warning"));
    expect(ignoreAlert).toHaveBeenCalledWith(`Entecavir|${PREGNANCY_MSG}`);
    rerender(<RxPadAlerts input={withEntecavir(["Pregnant"])} />);
    expect(sign()).toBeNull(); // the doctor has set it aside for this prescription
  });

  it("gives no Ignore Warning to a rule the physician did not name", () => {
    render(
      <RxPadAlerts
        input={{
          rxDrugs: [{ text: "Tab. Velpatasvir/Sofosbuvir" }, { text: "Tab. Omeprazole 20mg" }],
          sidebar: [],
        }}
      />,
    );
    press();
    expect(screen.queryByText("Ignore Warning")).toBeNull();
  });
});

// The panel hangs from the sign's right edge. On a phone that put 36px of it
// off the left of the screen, with no scrollbar to get the advice back —
// measured at 375px before this was anchored against the viewport.
describe("panelAnchor", () => {
  const sign = (top: number, right: number) => ({ top, bottom: top + 26, right });

  it("opens back across the pad on a desktop, right edge under the sign", () => {
    const a = panelAnchor(sign(60, 1180), { width: 1280, height: 800 });
    expect(a.width).toBe(PANEL_W);
    expect(a.left + a.width).toBe(1180);
    expect(a.top).toBe(92); // sign bottom + the 4px offset + the 2px gap
  });

  it("pulls it back inside the screen on a phone", () => {
    const a = panelAnchor(sign(60, 257), { width: 375, height: 812 });
    expect(a.left).toBeGreaterThanOrEqual(0);
    expect(a.left + a.width).toBeLessThanOrEqual(375);
  });

  it("never asks for more width than the screen has", () => {
    expect(panelAnchor(sign(60, 300), { width: 320, height: 640 }).width).toBe(304);
  });

  it("flips above the sign when it is near the foot of the screen", () => {
    const a = panelAnchor(sign(760, 1180), { width: 1280, height: 800 });
    expect(a.top).toBeUndefined();
    expect(a.bottom).toBeGreaterThan(0);
  });
});
