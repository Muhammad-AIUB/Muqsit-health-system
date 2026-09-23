// @vitest-environment jsdom
//
// The doctor's own investigation groups (physician's request, 2026-09-24).
// The tick rules are pinned in lib/investigationGroups.test.ts; this pins the
// screen: a tick stages every test of the group, "+ Add new group" saves a
// name with the tests ticked from the directories, and a failed save keeps the
// window open with the doctor's work in it.

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import InvestigationGroups from "./InvestigationGroups";
import { INV_CATS } from "@/data/investigations";
import type { InvestigationGroup } from "@/lib/investigationGroups";

let groups: InvestigationGroup[] = [];
const mutateAsync = vi.fn();
vi.mock("@/hooks/useInvestigationPrefs", () => ({
  useInvestigationPrefs: () => ({ favourites: [], unitPrefs: {}, groups, isLoading: false }),
  useSaveInvestigationGroups: () => ({ mutateAsync, isPending: false }),
}));

afterEach(() => { cleanup(); groups = []; mutateAsync.mockReset(); });

const hema = INV_CATS.find((c) => c.cat === "Hematology")!;

function Harness({ start = [] as string[] }) {
  const [sel, setSel] = useState<string[]>(start);
  return (
    <>
      <div data-testid="sel">{sel.join("|")}</div>
      <InvestigationGroups selected={sel} apply={(add, remove) => setSel((p) => [...p.filter((x) => !remove.includes(x)), ...add.filter((a) => !p.includes(a))])} />
    </>
  );
}

describe("InvestigationGroups", () => {
  it("says so when there are no groups, and still offers + Add new group", () => {
    render(<Harness />);
    expect(screen.getByText("No investigation groups yet.")).toBeTruthy();
    expect(screen.getByText("+ Add new group")).toBeTruthy();
  });

  it("ticking a group stages all its tests; unticking takes them back", () => {
    groups = [{ name: "DM follow-up", tests: ["FBS", "HbA1c"] }];
    render(<Harness start={["CBC"]} />);
    const box = screen.getByLabelText("Add group DM follow-up") as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(screen.getByTestId("sel").textContent).toBe("CBC|FBS|HbA1c");
    expect((screen.getByLabelText("Add group DM follow-up") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText("Add group DM follow-up"));
    expect(screen.getByTestId("sel").textContent).toBe("CBC");
  });

  it("+ Add new group: Save at the bottom stores the name and ticked tests together, with the existing groups", async () => {
    groups = [{ name: "DM follow-up", tests: ["FBS"] }];
    mutateAsync.mockResolvedValue({});
    render(<Harness />);
    fireEvent.click(screen.getByText("+ Add new group"));
    expect(screen.getByRole("dialog", { name: "Add new group" })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/DM follow-up/), { target: { value: "Anaemia work-up" } });
    fireEvent.click(screen.getByRole("button", { name: /Hematology/ }));
    fireEvent.click(screen.getByLabelText(hema.tests[0].name));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    expect(mutateAsync).toHaveBeenCalledWith([
      { name: "DM follow-up", tests: ["FBS"] },
      { name: "Anaemia work-up", tests: [hema.tests[0].name] },
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says what is missing instead of saving an empty or duplicate group", async () => {
    groups = [{ name: "DM follow-up", tests: ["FBS"] }];
    render(<Harness />);
    fireEvent.click(screen.getByText("+ Add new group"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    expect(screen.getByRole("alert").textContent).toMatch(/name/);
    fireEvent.change(screen.getByPlaceholderText(/DM follow-up/), { target: { value: "dm follow-up" } });
    fireEvent.click(screen.getByRole("button", { name: /Hematology/ }));
    fireEvent.click(screen.getByLabelText(hema.tests[0].name));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    expect(screen.getByRole("alert").textContent).toMatch(/already exists/);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("a failed save keeps the window open with the doctor's work", async () => {
    mutateAsync.mockRejectedValue(new Error("Network error"));
    render(<Harness />);
    fireEvent.click(screen.getByText("+ Add new group"));
    fireEvent.change(screen.getByPlaceholderText(/DM follow-up/), { target: { value: "Anaemia work-up" } });
    fireEvent.click(screen.getByRole("button", { name: /Hematology/ }));
    fireEvent.click(screen.getByLabelText(hema.tests[0].name));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/NOT saved/);
    expect((screen.getByPlaceholderText(/DM follow-up/) as HTMLInputElement).value).toBe("Anaemia work-up");
  });
});
