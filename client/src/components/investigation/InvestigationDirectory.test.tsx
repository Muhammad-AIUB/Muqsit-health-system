// @vitest-environment jsdom
//
// "Select from Directories" in Advised tests / investigation (physician's
// request, 2026-09-24): the catalog's own categories and test names, ticked
// into the popup's Added list. Nothing is invented — every name comes from
// INV_CATS or from the doctor's own favourites.

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import InvestigationDirectory from "./InvestigationDirectory";
import ExpandableField from "@/components/common/ExpandableField";
import { INV_CATS } from "@/data/investigations";

let favourites: string[] = [];
vi.mock("@/hooks/useInvestigationPrefs", () => ({ useInvestigationPrefs: () => ({ favourites, unitPrefs: {}, isLoading: false }) }));
vi.mock("@/hooks/useFieldRecents", () => ({ useFieldRecents: () => ({ getRecents: () => [], addRecents: vi.fn() }) }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }) }));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({ canEditLabel: () => true, can: () => true }) }));

afterEach(() => { cleanup(); favourites = []; });

function Harness() {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <>
      <div data-testid="sel">{sel.join("|")}</div>
      <InvestigationDirectory selected={sel} onToggle={(n) => setSel((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]))} />
    </>
  );
}
const heads = () => screen.getAllByRole("button").map((b) => b.textContent?.replace(/^[+−]/, "").trim());
const hema = INV_CATS.find((c) => c.cat === "Hematology")!;

describe("InvestigationDirectory", () => {
  it("lists every catalog directory in the catalog's order, Favourite first, all closed", () => {
    render(<Harness />);
    expect(heads()).toEqual(INV_CATS.map((c) => c.cat));
    expect(heads()[0]).toBe("Favourite");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("+ opens a directory to its test NAMES only — a tick box each, no result fields", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Hematology/ }));
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(hema.tests.length);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    for (const t of hema.tests) expect(screen.getByText(t.name)).toBeTruthy();
  });

  it("a tick selects the test and a second tick takes it back", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Hematology/ }));
    const first = hema.tests[0].name;
    fireEvent.click(screen.getByLabelText(first));
    expect(screen.getByTestId("sel").textContent).toBe(first);
    expect(screen.getByRole("button", { name: /Hematology/ }).textContent).toMatch(/1 selected/);
    fireEvent.click(screen.getByLabelText(first));
    expect(screen.getByTestId("sel").textContent).toBe("");
  });

  it("Favourite shows the doctor's own favourites, and says so when there are none", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Favourite/ }));
    expect(screen.getByText(/No favourites yet/)).toBeTruthy();
    cleanup();
    favourites = [hema.tests[1].name, "Not in the catalog"];
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Favourite/ }));
    // A favourite no longer in the catalog is not offered.
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByText(hema.tests[1].name)).toBeTruthy();
  });
});

describe("Advised tests / investigation — Select from Directories", () => {
  it("a ticked test lands in Added, and Done applies it with the rest", () => {
    const setItems = vi.fn();
    render(
      <ExpandableField
        label="Advised tests / investigation" items={["ESR"]} setItems={setItems} suggestions={["CBC"]} investigationTabs
        renderDirectory={(selected, toggle) => <InvestigationDirectory selected={selected} onToggle={toggle} />}
      />,
    );
    fireEvent.click(screen.getByText("+"));
    expect(screen.getByText("Select from Directories")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Hematology/ }));
    fireEvent.click(screen.getByLabelText(hema.tests[0].name));
    expect(screen.getByText("Added (2)")).toBeTruthy();
    fireEvent.click(screen.getByText("Done"));
    expect(setItems).toHaveBeenCalledWith(["ESR", hema.tests[0].name]);
  });

  it("is not on the Investigations group tab", () => {
    render(
      <ExpandableField
        label="Advised tests / investigation" items={[]} setItems={vi.fn()} investigationTabs
        renderDirectory={(selected, toggle) => <InvestigationDirectory selected={selected} onToggle={toggle} />}
      />,
    );
    fireEvent.click(screen.getByText("+"));
    fireEvent.click(screen.getByRole("tab", { name: "Investigations group" }));
    expect(screen.queryByText("Select from Directories")).toBeNull();
  });
});
