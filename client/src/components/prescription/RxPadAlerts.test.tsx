// @vitest-environment jsdom
//
// ⚕️ The ℞ pad's warning surface. What matters clinically: the sign lights up
// whenever a warned medicine is on the pad, one sign however many warnings, and
// it STAYS lit for as long as that medicine is on the pad — ignoring a warning
// dismisses the message, never the sign (physician's flow, 2026-09-24). A
// warning appears on its own the moment its medicine is written; the sign
// brings a dismissed one back. The wording is untouched.

import { afterEach, describe, expect, it, vi } from "vitest";
import { useSyncExternalStore } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import RxAlertSign, { RxLineWarning, padAlerts } from "./RxPadAlerts";
import type { RxAlertInput } from "@/lib/rxAlerts";

// A real (tiny) store behind the mocked context, so a dismissal re-renders the
// pad exactly as MuqsitContext's state does.
const store = vi.hoisted(() => {
  let hidden: ReadonlySet<string> = new Set();
  const subs = new Set<() => void>();
  const set = (next: ReadonlySet<string>) => { hidden = next; subs.forEach((f) => f()); };
  return {
    get: () => hidden,
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    hide: (ids: string[]) => set(new Set([...hidden, ...ids])),
    show: (ids: string[]) => set(new Set([...hidden].filter((x) => !ids.includes(x)))),
    reset: () => set(new Set()),
  };
});
const ignoreAlert = vi.fn((id: string) => store.hide([id]));
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    ignoredAlerts: useSyncExternalStore(store.subscribe, store.get),
    ignoreAlert,
    hideAlerts: store.hide,
    showAlerts: store.show,
  }),
}));

afterEach(() => {
  cleanup();
  act(() => store.reset());
  ignoreAlert.mockClear();
});

const PREGNANCY_MSG = "Entecavir is contraindicated in pregnancy and lactation. Use tenofovir disoproxil.";
const PPI_MSG = "Sofosbuvir/Velpatasvir dose must have atleast 4 hours gap before taking Proton Pump Inhibitor";

const withEntecavir = (conditions: string[]): RxAlertInput => ({
  rxDrugs: [{ text: "Tablet. Barcavir 0.5 mg", generic: "Entecavir" }],
  sidebar: [{ label: "Final diagnosis", items: conditions }],
});

// The pad's own wiring, in miniature: one sign, and a warning slot under each
// ℞ line (which shows whatever has not been dismissed).
function Pad({ input }: { input: RxAlertInput }) {
  return (
    <div>
      <RxAlertSign input={input} />
      {input.rxDrugs.map((d, i) => (
        <div key={i} data-testid={`line-${i}`}>
          <span>{d.text}</span>
          <RxLineWarning input={input} lineIndex={i} />
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
    expect(screen.getAllByRole("button", { name: /prescribing warning/i })).toHaveLength(1);
  });

  it("stays ONE sign however many warnings there are", () => {
    render(<Pad input={withEntecavir(["Pregnant", "CKD", "Decompensated liver cirrhosis"])} />);
    expect(screen.getAllByRole("button", { name: /prescribing warning/i })).toHaveLength(1);
    expect(sign()!.getAttribute("aria-label")).toMatch(/^3 prescribing warnings/);
  });

  it("shows the warning on its own the moment a warned medicine is written", () => {
    render(<Pad input={withEntecavir(["Pregnant"])} />);
    expect(screen.getByText(PREGNANCY_MSG)).toBeTruthy();
  });

  it("hides every warning on a press and brings them all back on the next", () => {
    render(<Pad input={withEntecavir(["Pregnant"])} />);
    press();
    expect(screen.queryByText(PREGNANCY_MSG)).toBeNull();
    expect(sign()).not.toBeNull(); // the sign itself never goes
    press();
    expect(screen.getByText(PREGNANCY_MSG)).toBeTruthy();
  });
});

// ⚕️ Regression (physician's report, 2026-09-24): pressing Ignore used to put
// the sign out too, leaving no way back to the warning while the medicine was
// still on the prescription.
describe("Ignore Warning dismisses the message, never the sign", () => {
  it("keeps the sign lit after Ignore, for as long as the medicine is on the pad", () => {
    render(<Pad input={withEntecavir(["Pregnant"])} />);
    fireEvent.click(screen.getByText("Ignore Warning"));
    expect(screen.queryByText(PREGNANCY_MSG)).toBeNull();
    expect(sign()).not.toBeNull();
    expect(sign()!.getAttribute("aria-label")).toMatch(/^1 prescribing warning/);
  });

  it("brings an ignored warning back when the sign is pressed", () => {
    render(<Pad input={withEntecavir(["Pregnant"])} />);
    fireEvent.click(screen.getByText("Ignore Warning"));
    press();
    expect(screen.getByText(PREGNANCY_MSG)).toBeTruthy();
  });

  it("puts the sign out only when the medicine leaves the pad", () => {
    const { rerender } = render(<Pad input={withEntecavir(["Pregnant"])} />);
    fireEvent.click(screen.getByText("Ignore Warning"));
    rerender(<Pad input={{ rxDrugs: [{ text: "Tab. Napa 500mg" }], sidebar: [{ label: "Final diagnosis", items: ["Pregnant"] }] }} />);
    expect(sign()).toBeNull();
  });

  it("shows the warning again when the medicine is written anew", () => {
    const { rerender } = render(<Pad input={withEntecavir(["Pregnant"])} />);
    fireEvent.click(screen.getByText("Ignore Warning"));
    rerender(<Pad input={{ rxDrugs: [], sidebar: [{ label: "Final diagnosis", items: ["Pregnant"] }] }} />);
    rerender(<Pad input={withEntecavir(["Pregnant"])} />);
    expect(screen.getByText(PREGNANCY_MSG)).toBeTruthy();
  });
});

describe("the warning under the medicine", () => {
  it("sits inside the line it belongs to, not floating over the page", () => {
    render(<Pad input={withEntecavir(["Pregnant"])} />);
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
    expect(screen.getAllByText(PPI_MSG)).toHaveLength(2);
  });

  it("stacks every warning of one medicine in its own bubble", () => {
    render(<Pad input={withEntecavir(["Pregnant", "CKD"])} />);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText(PREGNANCY_MSG)).toBeTruthy();
    expect(screen.getByText(/CrCl at least 50 mL\/min: 0.5 mg orally once a day/)).toBeTruthy();
  });

  it("keeps a dosing table's line breaks", () => {
    const { container } = render(<Pad input={withEntecavir(["CKD"])} />);
    const body = [...container.querySelectorAll("span")].find((el) => el.style.whiteSpace === "pre-line");
    expect(body).toBeTruthy();
    expect(body!.textContent).toContain("CrCl less than 10 mL/min: 0.05 mg orally once a day or 0.5 mg orally every 7 days");
  });

  it("offers Ignore Warning on entecavir only", () => {
    render(<Pad input={withEntecavir(["Pregnant"])} />);
    fireEvent.click(screen.getByText("Ignore Warning"));
    expect(ignoreAlert).toHaveBeenCalledWith(`Entecavir|${PREGNANCY_MSG}`);
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
