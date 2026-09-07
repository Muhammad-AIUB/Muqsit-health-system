// @vitest-environment jsdom
//
// ⚕️ The seam the reported bug fell through: what `lib/rxDrugHistory.ts` writes
// has to be what `DrugHistoryField` reads back as a CURRENT medication. Two
// independent parsers of one stored format is exactly how a doctor ends up
// looking at "0 current" with two medicines on the sheet in front of them.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DrugHistoryField from "./DrugHistoryField";
import { rxDrugHistoryEntries } from "@/lib/rxDrugHistory";
import type { RxItem } from "@/types";

const saveDrugHistory = vi.fn();
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({ setRxItems: vi.fn(), ptDate: "2026-09-07", saveDrugHistory }),
}));

afterEach(() => { cleanup(); saveDrugHistory.mockClear(); });

// The patient in the report: three medications from earlier visits, and today's
// two on the ℞ pad. The visit is 07/09/2026.
const PAST = [
  "10/01/2024: Losartan 50mg — 1+0+1 — after food — continuing",
  "27/06/2026: Losartan 50mg — 1+0+1 — after food — continuing",
  "20/07/2026: Metformin 500mg — 1+0+1 — after food — 1 month",
];
const TODAYS_RX: RxItem[] = [
  { drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "food", generic: "Paracetamol" },
  { drug: "Tablet. Napa One 1000 mg", dose: "", duration: "", instruction: "", generic: "Paracetamol" },
];
const mirrored = () => rxDrugHistoryEntries(TODAYS_RX, "07/09/2026");

const badge = () => screen.getAllByRole("button").find((b) => /current/.test(b.textContent ?? ""))!;
const badgeText = () => (badge().textContent ?? "").replace(/\s+/g, " ").trim();
const openModal = () => fireEvent.click(badge());
const inputValues = () => screen.getAllByRole("textbox").map((el) => (el as HTMLInputElement).value);

describe("Drug history — today's ℞ reaches Current medications", () => {
  it("counted 0 current before the mirror existed (the reported bug)", () => {
    render(<DrugHistoryField items={PAST} setItems={vi.fn()} />);
    expect(badgeText()).toBe("💊 0 current · 3 past · view");
  });

  it("counts today's prescribed medicines as current", () => {
    render(<DrugHistoryField items={[...PAST, ...mirrored()]} setItems={vi.fn()} />);
    expect(badgeText()).toBe("💊 2 current · 3 past · view");
  });

  it("lists them by name in the Current medications tab", () => {
    render(<DrugHistoryField items={[...PAST, ...mirrored()]} setItems={vi.fn()} />);
    openModal();
    expect(inputValues()).toContain("Tablet. Napa 500 mg");
    expect(inputValues()).toContain("Tablet. Napa One 1000 mg");
  });

  it("carries the dose across, and invents nothing for the line that has none", () => {
    render(<DrugHistoryField items={mirrored()} setItems={vi.fn()} />);
    openModal();
    const v = inputValues();
    expect(v).toContain("1+1+1");
    expect(v.filter((x) => x === "1+0+1")).toHaveLength(0); // MedicinePad's default, never applied here
  });

  it("leaves the earlier visits in Distant past, unmoved", () => {
    render(<DrugHistoryField items={[...PAST, ...mirrored()]} setItems={vi.fn()} />);
    openModal();
    fireEvent.click(screen.getByText(/Distant past medication/));
    expect(screen.getByText("Metformin 500mg")).toBeTruthy();
    expect(screen.queryByText("Tablet. Napa 500 mg")).toBeNull();
  });

  // A taper belongs under its medicine, not beside it as a second drug.
  it("does not count a tapering line as another current medicine", () => {
    const taper: RxItem[] = [
      { drug: "Tablet (Delayed Release). Mesacol 400 mg", dose: "2+2+2", duration: "7 week", instruction: "food" },
      { drug: "", dose: "2+0+2", duration: "4 week", instruction: "food", isCont: true },
    ];
    render(<DrugHistoryField items={rxDrugHistoryEntries(taper, "07/09/2026")} setItems={vi.fn()} />);
    expect(badgeText()).toBe("💊 1 current · view");
  });

  it("round-trips — pressing Done re-saves exactly the same entries", () => {
    const items = [...PAST, ...mirrored()];
    render(<DrugHistoryField items={items} setItems={vi.fn()} />);
    openModal();
    fireEvent.click(screen.getByText("Done"));
    expect(saveDrugHistory).toHaveBeenCalledTimes(1);
    expect([...(saveDrugHistory.mock.calls[0][0] as string[])].sort()).toEqual([...items].sort());
  });

  // Both modules must read the visit date the same way, or the split moves.
  it("stamps entries with the dd/mm/yyyy the field itself splits on", () => {
    const { container } = render(<DrugHistoryField items={mirrored()} setItems={vi.fn()} />);
    openModal();
    expect(container.textContent).toContain("07/09/2026");
  });
});
