// @vitest-environment jsdom
//
// ⚕️ Two things this file holds down.
//
// The seam the reported bug fell through: what `lib/rxDrugHistory.ts` writes has
// to be what `DrugHistoryField` reads back as a CURRENT medication. Two
// independent parsers of one stored format is exactly how a doctor ends up
// looking at "0 current" with two medicines on the sheet in front of them.
//
// And the surface itself: both tabs are a READ-ONLY view (physician's decision,
// 2026-09-07). The ℞ pad owns Current medications and is where it is corrected,
// so this modal must offer no input, no checkbox and no "Add to main Rx". A
// second writable surface over one list is how a typed correction silently loses
// to the mirror.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DrugHistoryField from "./DrugHistoryField";
import { rxDrugHistoryEntries } from "@/lib/rxDrugHistory";
import type { RxItem } from "@/types";

const setRxItems = vi.fn();
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({ setRxItems, ptDate: "2026-09-07" }),
}));

afterEach(() => { cleanup(); setRxItems.mockClear(); });

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

describe("Drug history — today's ℞ reaches Current medications", () => {
  it("counted 0 current before the mirror existed (the reported bug)", () => {
    render(<DrugHistoryField items={PAST} />);
    expect(badgeText()).toBe("💊 0 current · 3 past · view");
  });

  it("counts today's prescribed medicines as current", () => {
    render(<DrugHistoryField items={[...PAST, ...mirrored()]} />);
    expect(badgeText()).toBe("💊 2 current · 3 past · view");
  });

  it("shows each medicine with the dose, food and duration the doctor wrote", () => {
    const { container } = render(<DrugHistoryField items={[...PAST, ...mirrored()]} />);
    openModal();
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("Tablet. Napa 500 mg");
    expect(text).toContain("1+1+1");
    expect(text).toContain("5 days");
    expect(text).toContain("Tablet. Napa One 1000 mg");
  });

  it("invents nothing for the line that has no dose yet", () => {
    const { container } = render(<DrugHistoryField items={mirrored()} />);
    openModal();
    const text = container.textContent ?? "";
    expect(text).not.toContain("1+0+1");     // the pad's default dose
    expect(text).not.toContain("After meal");
    expect(text).not.toContain("Continue");
  });

  it("leaves the earlier visits in Distant past, unmoved", () => {
    render(<DrugHistoryField items={[...PAST, ...mirrored()]} />);
    openModal();
    fireEvent.click(screen.getByText(/Distant past medication/));
    expect(screen.getByText("Metformin 500mg")).toBeTruthy();
    expect(screen.queryByText("Tablet. Napa 500 mg")).toBeNull();
  });

  // A taper belongs under its medicine, not beside it as a second drug.
  it("shows a tapering line under its medicine and does not count it", () => {
    const taper: RxItem[] = [
      { drug: "Tablet (Delayed Release). Mesacol 400 mg", dose: "2+2+2", duration: "7 week", instruction: "food" },
      { drug: "", dose: "2+0+2", duration: "4 week", instruction: "food", isCont: true },
    ];
    const { container } = render(<DrugHistoryField items={rxDrugHistoryEntries(taper, "07/09/2026")} />);
    expect(badgeText()).toBe("💊 1 current · view");
    openModal();
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("↳");
    expect(text).toContain("2+0+2");
  });

  it("stamps entries with the dd/mm/yyyy the field itself splits on", () => {
    const { container } = render(<DrugHistoryField items={mirrored()} />);
    openModal();
    expect(container.textContent).toContain("07/09/2026");
  });
});

describe("Drug history is a view, not an editor", () => {
  const openWith = (items: string[]) => {
    const r = render(<DrugHistoryField items={items} />);
    openModal();
    return r;
  };

  it("offers nothing to type into, on either tab", () => {
    const { container } = openWith([...PAST, ...mirrored()]);
    expect(container.querySelectorAll("input, textarea")).toHaveLength(0);
    fireEvent.click(screen.getByText(/Distant past medication/));
    expect(container.querySelectorAll("input, textarea")).toHaveLength(0);
  });

  it("has no 'Add to main Rx' button and no Select all", () => {
    const { container } = openWith([...PAST, ...mirrored()]);
    const text = container.textContent ?? "";
    expect(text).not.toContain("Add to main Rx");
    expect(text).not.toContain("Select all");
  });

  // Nothing is staged, so there is nothing to accept or abandon — one way out.
  it("closes with a single button, not Cancel/Done", () => {
    const { container } = openWith(mirrored());
    expect(screen.getByText("Close")).toBeTruthy();
    expect(screen.queryByText("Done")).toBeNull();
    expect(screen.queryByText("Cancel")).toBeNull();
    fireEvent.click(screen.getByText("Close"));
    expect((container.textContent ?? "")).not.toContain("Distant past medication");
  });

  it("re-prescribing a distant-past medicine still reaches the ℞", () => {
    openWith(PAST);
    fireEvent.click(screen.getByText(/Distant past medication/));
    fireEvent.click(screen.getAllByTitle("Add to current prescription")[0]);
    expect(setRxItems).toHaveBeenCalledTimes(1);
    const next = setRxItems.mock.calls[0][0] as (prev: RxItem[]) => RxItem[];
    expect(next([])).toEqual([{ drug: "Metformin 500mg", dose: "1+0+1", instruction: "after food", duration: "1 month" }]);
  });
});
