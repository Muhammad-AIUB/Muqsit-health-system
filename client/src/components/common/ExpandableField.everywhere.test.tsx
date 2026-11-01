// @vitest-environment jsdom
//
// ⚕️ Physician's sheet of 31/10/2026, item by item:
//  • "Sob jaigai edit add nicher moto korbi, final diagnosis a jevabe ase" —
//    every list of the OPD prescription has the round + AND ✎ Edit, and Edit
//    opens a box on every line IN PLACE, with ✓ Done and a red ✕ per line shown
//    only while editing ("cross sign available thakle accidental delete").
//  • the popup's ADDED chips carry their × only after the "✎ Edit" at the end
//    of the ADDED heading is pressed;
//  • "Reset hobe na … amr age joto advice likhsi sob thakbe" — the doctor's own
//    lines (learned + recents) are never cut to ten, and no count is written;
//  • "Resue sign er bodle plus sign" — a recent line is marked with a plus icon,
//    not ↺.

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ExpandableField, { STATIC_SHOWN } from "./ExpandableField";
import { INLINE_EDIT_FIELDS } from "@/lib/inlineEditFields";

let recents: string[] = [];
vi.mock("@/hooks/useFieldRecents", () => ({
  useFieldRecents: () => ({ getRecents: () => recents, addRecents: vi.fn() }),
}));
let learned: { id: string; text: string; patientCount: number }[] = [];
vi.mock("@/hooks/useDoctorPhrases", () => ({
  useDoctorPhrases: (_s: string, _q: string, enabled: boolean) => ({ phrases: enabled ? learned : [], refresh: vi.fn() }),
}));
let canEdit = true;
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({ canEditLabel: () => canEdit, can: () => canEdit, currentPatientId: "A" }),
}));

afterEach(() => { cleanup(); canEdit = true; recents = []; learned = []; });

let latest: string[] = [];
function Field({ label, initial, ...rest }: { label: string; initial: string[] } & Partial<React.ComponentProps<typeof ExpandableField>>) {
  const [items, setItems] = useState(initial);
  latest = items;
  return <ExpandableField label={label} items={items} setItems={setItems} inlineEdit removable {...rest} />;
}

describe("every OPD list edits in place, like Final diagnosis", () => {
  for (const label of INLINE_EDIT_FIELDS) {
    it(`${label}: + and ✎ Edit; boxes in place; ✕ only while editing; ✓ Done applies`, () => {
      render(<Field label={label} initial={["First line", "Second line"]} />);
      expect(screen.getByRole("button", { name: `Add ${label}` })).toBeTruthy();
      // Reading: no ✕ anywhere.
      expect(screen.queryAllByLabelText(/^Remove "/)).toHaveLength(0);
      fireEvent.click(screen.getByText("✎ Edit"));
      // In place — no popup.
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getAllByTestId(/^edit-/)).toHaveLength(2);
      expect(screen.getAllByLabelText(/^Remove "/)).toHaveLength(2);
      fireEvent.change(screen.getByTestId("edit-1"), { target: { value: "Second line, corrected" } });
      fireEvent.click(screen.getByText("✓ Done"));
      expect(latest).toEqual(["First line", "Second line, corrected"]);
      expect(screen.queryAllByLabelText(/^Remove "/)).toHaveLength(0);
    });
  }

  it("✕ inside Edit takes one line off, with Undo", () => {
    render(<Field label="Advice" initial={["Rest", "Fluids"]} />);
    fireEvent.click(screen.getByText("✎ Edit"));
    fireEvent.click(screen.getByLabelText('Remove "Rest"'));
    expect(latest).toEqual(["Fluids"]);
    fireEvent.click(screen.getByText("Undo"));
    expect(latest).toEqual(["Rest", "Fluids"]);
  });

  it("an assistant without the permission gets neither + nor Edit", () => {
    canEdit = false;
    render(<Field label="Advice" initial={["Rest"]} />);
    expect(screen.queryByRole("button", { name: "Add Advice" })).toBeNull();
    expect(screen.queryByText("✎ Edit")).toBeNull();
  });
});

describe("the popup's ADDED chips: × only after ✎ Edit", () => {
  const openPopup = () => {
    render(<Field label="Advice" initial={["Rest", "Fluids"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Advice" }));
    return screen.getByRole("dialog", { name: "Advice" });
  };

  it("shows no × on a chip until the toggle is on, then one on each", () => {
    const dialog = openPopup();
    expect(within(dialog).queryAllByLabelText(/^Remove from selection/)).toHaveLength(0);
    const toggle = within(dialog).getByRole("button", { name: "✎ Edit" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(within(dialog).getByRole("button", { name: "✓ Done editing" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(dialog).getAllByLabelText(/^Remove from selection/)).toHaveLength(2);
    fireEvent.click(within(dialog).getByLabelText("Remove from selection: Rest"));
    fireEvent.click(within(dialog).getByRole("button", { name: "✓ Done editing" }));
    expect(within(dialog).queryAllByLabelText(/^Remove from selection/)).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(latest).toEqual(["Fluids"]);
  });

  it("the toggle is off again at the next opening", () => {
    const dialog = openPopup();
    fireEvent.click(within(dialog).getByRole("button", { name: "✎ Edit" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Advice" }));
    expect(within(screen.getByRole("dialog")).queryAllByLabelText(/^Remove from selection/)).toHaveLength(0);
  });

  it("Cancel after removing a chip writes nothing back", () => {
    const dialog = openPopup();
    fireEvent.click(within(dialog).getByRole("button", { name: "✎ Edit" }));
    fireEvent.click(within(dialog).getByLabelText("Remove from selection: Rest"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(latest).toEqual(["Rest", "Fluids"]);
  });
});

describe("suggestions: everything the doctor wrote, no count, + for recent", () => {
  const openEmpty = (props: Partial<React.ComponentProps<typeof ExpandableField>> = {}) => {
    const label = props.label ?? "Note";
    render(<Field initial={[]} {...props} label={label} />);
    fireEvent.click(screen.getByRole("button", { name: `Add ${label}` }));
    return within(screen.getByTestId("suggestion-list"));
  };

  it("offers every recent line, not the first ten", () => {
    recents = Array.from({ length: 40 }, (_, i) => `Note line ${i + 1}`);
    const list = openEmpty();
    expect(list.getAllByRole("button")).toHaveLength(40);
  });

  it("offers every learned AND every recent line, learned first", () => {
    learned = Array.from({ length: 15 }, (_, i) => ({ id: `p${i}`, text: `Learned ${i + 1}`, patientCount: 15 - i }));
    recents = Array.from({ length: 15 }, (_, i) => `Recent ${i + 1}`);
    const list = openEmpty({ label: "Advice", learnedSource: "advice" });
    const texts = list.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(texts).toHaveLength(30);
    expect(texts.findIndex((t) => t.includes("Recent 1"))).toBeGreaterThan(texts.findIndex((t) => t.includes("Learned 15")));
  });

  it("still holds a long STATIC list to its first places", () => {
    const list = openEmpty({ suggestions: Array.from({ length: 30 }, (_, i) => `Static ${i + 1}`) });
    expect(list.getAllByRole("button")).toHaveLength(STATIC_SHOWN);
  });

  it("writes no patient count on a learned line", () => {
    learned = [{ id: "p1", text: "Insulin as before", patientCount: 7 }];
    const list = openEmpty({ label: "Advice", learnedSource: "advice" });
    expect(list.getByRole("button").textContent).toBe("★ Insulin as before");
  });

  it("marks a recent line with the plus icon, never ↺", () => {
    recents = ["Typed earlier"];
    const list = openEmpty();
    const chip = list.getByRole("button");
    expect(chip.querySelector('svg[data-icon="plus"]')).not.toBeNull();
    expect(chip.textContent).toBe("Typed earlier");
    expect(document.body.textContent).not.toContain("↺");
  });

  it("the list scrolls rather than dropping lines", () => {
    recents = ["a line"];
    openEmpty();
    expect(screen.getByTestId("suggestion-list").style.overflowY).toBe("auto");
  });
});
