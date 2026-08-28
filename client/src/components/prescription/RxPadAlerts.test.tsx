// @vitest-environment jsdom
//
// ⚕️ The ℞ pad's warning surface. What matters clinically: the sign lights up
// whenever a warned medicine is on the pad, one sign however many warnings;
// pressing it puts the physician's wording under the medicine that raised it,
// in the flow, so it travels with that line; and the wording is untouched.

import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RxAlertSign, { RxLineWarning, padAlerts } from "./RxPadAlerts";
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

const withEntecavir = (conditions: string[]): RxAlertInput => ({
  rxDrugs: [{ text: "Tablet. Barcavir 0.5 mg", generic: "Entecavir" }],
  sidebar: [{ label: "Final diagnosis", items: conditions }],
});

// The pad's own wiring, in miniature: one sign, and a warning under each ℞ line
// once it is pressed.
function Pad({ input }: { input: RxAlertInput }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <RxAlertSign input={input} open={open} onToggle={() => setOpen((o) => !o)} />
      {input.rxDrugs.map((d, i) => (
        <div key={i} data-testid={`line-${i}`}>
          <span>{d.text}</span>
          {open && <RxLineWarning input={input} lineIndex={i} />}
        </div>
      ))}
    </div>
  );
}

const sign = () => screen.queryByRole("button", { name: /prescribing warning/i });
const press = () => fireEvent.click(sign() as HTMLElement);

describe("the ℞ pad's alert sign", () => {
  it("shows nothing at all when no rule fires", () => {
    render(<Pad input={{ rxDrugs: [{ text: "Tab. Napa 500mg" }], sidebar: [] }} />);
    expect(sign()).toBeNull();
  });

  it("lights ONE sign when a warned medicine is written", () => {
    render(<Pad input={withEntecavir(["Pregnant"])} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("stays ONE sign however many warnings there are", () => {
    render(<Pad input={withEntecavir(["Pregnant", "CKD", "Decompensated liver cirrhosis"])} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(sign()!.getAttribute("aria-label")).toMatch(/^3 prescribing warnings/);
  });

  it("keeps the advice out of the way until it is pressed", () => {
    render(<Pad input={withEntecavir(["Pregnant"])} />);
    expect(screen.queryByText(PREGNANCY_MSG)).toBeNull();
    press();
    expect(screen.getByText(PREGNANCY_MSG)).toBeTruthy();
    press();
    expect(screen.queryByText(PREGNANCY_MSG)).toBeNull();
  });
});

describe("the warning under the medicine", () => {
  it("sits inside the line it belongs to, not floating over the page", () => {
    render(<Pad input={withEntecavir(["Pregnant"])} />);
    press();
    const bubble = screen.getByRole("alert");
    // In the flow of its own ℞ line: that is what makes it travel with the
    // medicine when the pad scrolls.
    expect(screen.getByTestId("line-0").contains(bubble)).toBe(true);
    expect(getComputedStyle(bubble).position).not.toBe("fixed");
  });

  it("puts each warning under the medicine that raised it", () => {
    render(
      <Pad
        input={{
          rxDrugs: [{ text: "Tab. Napa 500mg" }, { text: "Tablet. Barcavir 0.5 mg", generic: "Entecavir" }],
          sidebar: [{ label: "Final diagnosis", items: ["Pregnant"] }],
        }}
      />,
    );
    press();
    expect(screen.getByTestId("line-1").textContent).toContain(PREGNANCY_MSG);
    expect(screen.getByTestId("line-0").textContent).not.toContain(PREGNANCY_MSG);
  });

  it("draws a drug-drug warning against BOTH medicines — either is the one to change", () => {
    render(
      <Pad
        input={{
          rxDrugs: [{ text: "Tab. Velpatasvir/Sofosbuvir" }, { text: "Tab. Omeprazole 20mg" }],
          sidebar: [],
        }}
      />,
    );
    press();
    expect(screen.getAllByText(PPI_MSG)).toHaveLength(2);
  });

  it("stacks every warning of one medicine in its own bubble", () => {
    render(<Pad input={withEntecavir(["Pregnant", "CKD"])} />);
    press();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText(PREGNANCY_MSG)).toBeTruthy();
    expect(screen.getByText(/CrCl at least 50 mL\/min: 0.5 mg orally once a day/)).toBeTruthy();
  });

  it("keeps a dosing table's line breaks", () => {
    const { container } = render(<Pad input={withEntecavir(["CKD"])} />);
    press();
    const body = [...container.querySelectorAll("span")].find((el) => el.style.whiteSpace === "pre-line");
    expect(body).toBeTruthy();
    expect(body!.textContent).toContain("CrCl less than 10 mL/min: 0.05 mg orally once a day or 0.5 mg orally every 7 days");
  });

  it("offers Ignore Warning on entecavir only, and puts the sign out once used", () => {
    const { rerender } = render(<Pad input={withEntecavir(["Pregnant"])} />);
    press();
    fireEvent.click(screen.getByText("Ignore Warning"));
    expect(ignoreAlert).toHaveBeenCalledWith(`Entecavir|${PREGNANCY_MSG}`);
    rerender(<Pad input={withEntecavir(["Pregnant"])} />);
    expect(sign()).toBeNull(); // set aside for this prescription
  });

  it("gives no Ignore Warning to a rule the physician did not name", () => {
    render(
      <Pad
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

describe("padAlerts", () => {
  it("reports the warned lines in pad order", () => {
    const lines = padAlerts(
      {
        rxDrugs: [{ text: "Tab. Velpatasvir/Sofosbuvir" }, { text: "Tab. Omeprazole 20mg" }],
        sidebar: [],
      },
      new Set(),
    );
    expect(lines.map((l) => l.rxIndex)).toEqual([0, 1]);
  });

  it("leaves out what the doctor has set aside", () => {
    const input = withEntecavir(["Pregnant"]);
    expect(padAlerts(input, new Set())).toHaveLength(1);
    expect(padAlerts(input, new Set([`Entecavir|${PREGNANCY_MSG}`]))).toHaveLength(0);
  });
});
