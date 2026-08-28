// @vitest-environment jsdom
//
// ⚕️ Final diagnosis is corrected in place: no "✎ Edit" button, a double-click
// on the bullet opens it, Enter or moving the cursor away saves. The rest of
// the clinical sidebar keeps the popup-and-Edit-button flow, so both shapes are
// pinned here — a tidy-up that unified them would silently change how a
// diagnosis is entered.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ExpandableField from "./ExpandableField";

vi.mock("@/hooks/useFieldRecents", () => ({
  useFieldRecents: () => ({ getRecents: () => [], addRecents: vi.fn() }),
}));

let canEdit = true;
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({ canEditLabel: () => canEdit }),
}));

afterEach(() => {
  cleanup();
  canEdit = true;
});

const bullet = (text: string) => screen.getByText(text);

describe("ExpandableField — inline edit (Final diagnosis)", () => {
  const renderField = (items: string[], setItems = vi.fn(), onAdd = vi.fn()) => {
    render(
      <ExpandableField label="Final diagnosis" items={items} setItems={setItems} inlineEdit onAdd={onAdd} />,
    );
    return { setItems, onAdd };
  };

  it("shows no Edit button, unlike every other field", () => {
    renderField(["CKD", "lactation"]);
    expect(screen.queryByText("✎ Edit")).toBeNull();
    // The + is still there — adding and removing still go through the popup.
    expect(screen.getByText("+")).toBeTruthy();
  });

  it("opens the bullet on double-click and saves on Enter", () => {
    const { setItems } = renderField(["CKD", "lactation"]);
    fireEvent.doubleClick(bullet("CKD"));
    const input = screen.getByDisplayValue("CKD") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "CKD stage 3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(setItems).toHaveBeenCalledWith(["CKD stage 3", "lactation"]);
  });

  it("saves when the cursor moves away (blur)", () => {
    const { setItems } = renderField(["CKD"]);
    fireEvent.doubleClick(bullet("CKD"));
    const input = screen.getByDisplayValue("CKD") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "CKD stage 4" } });
    fireEvent.blur(input);
    expect(setItems).toHaveBeenCalledWith(["CKD stage 4"]);
  });

  it("edits only the bullet that was opened", () => {
    const { setItems } = renderField(["CKD", "lactation", "anaemia"]);
    fireEvent.doubleClick(bullet("lactation"));
    fireEvent.change(screen.getByDisplayValue("lactation"), { target: { value: "lactating" } });
    fireEvent.keyDown(screen.getByDisplayValue("lactating"), { key: "Enter" });
    expect(setItems).toHaveBeenCalledWith(["CKD", "lactating", "anaemia"]);
  });

  it("Escape leaves the recorded diagnosis alone", () => {
    const { setItems } = renderField(["CKD"]);
    fireEvent.doubleClick(bullet("CKD"));
    const input = screen.getByDisplayValue("CKD") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "typo" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(setItems).not.toHaveBeenCalled();
    expect(screen.getByText("CKD")).toBeTruthy();
  });

  // Blanking the box is a mis-key, not a deletion. Removing a diagnosis stays a
  // deliberate act in the + popup.
  it("a blanked box does not delete the diagnosis", () => {
    const { setItems } = renderField(["CKD"]);
    fireEvent.doubleClick(bullet("CKD"));
    const input = screen.getByDisplayValue("CKD") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(setItems).not.toHaveBeenCalled();
    expect(screen.getByText("CKD")).toBeTruthy();
  });

  it("saving the same text is not a change", () => {
    const { setItems, onAdd } = renderField(["CKD"]);
    fireEvent.doubleClick(bullet("CKD"));
    fireEvent.blur(screen.getByDisplayValue("CKD"));
    expect(setItems).not.toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("logs the corrected text as a new entry", () => {
    const { onAdd } = renderField(["CKD"]);
    fireEvent.doubleClick(bullet("CKD"));
    fireEvent.change(screen.getByDisplayValue("CKD"), { target: { value: "CKD stage 3" } });
    fireEvent.keyDown(screen.getByDisplayValue("CKD stage 3"), { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith("CKD stage 3");
  });

  it("an assistant without permission cannot open a bullet", () => {
    canEdit = false;
    const setItems = vi.fn();
    render(<ExpandableField label="Final diagnosis" items={["CKD"]} setItems={setItems} inlineEdit />);
    fireEvent.doubleClick(bullet("CKD"));
    expect(screen.queryByDisplayValue("CKD")).toBeNull();
    expect(setItems).not.toHaveBeenCalled();
  });
});

// ⚕️ P.D = the patient's diagnoses from past visits, offered as ticks inside the
// Final diagnosis popup. It is a shortcut for retyping, never a rewrite: a tick
// only stages the text for TODAY's list, and nothing reaches the field until
// Done — so Cancel must leave the record exactly as it was.
describe("ExpandableField — the P.D (previous diagnosis) panel", () => {
  const openPopup = (previousItems: string[], items: string[] = []) => {
    const setItems = vi.fn();
    render(
      <ExpandableField label="Final diagnosis" items={items} setItems={setItems} inlineEdit previousItems={previousItems} />,
    );
    fireEvent.click(screen.getByText("+"));
    return { setItems };
  };

  // Scoped to the P.D row: a diagnosis already on today's list also appears as
  // an ADDED tag, so plain text lookup is ambiguous.
  const tickFor = (text: string) =>
    screen.getByTestId(`pd-${text}`).querySelector("input") as HTMLInputElement;

  it("lists every past diagnosis under its full-name heading", () => {
    openPopup(["CKD", "Dengue fever — NS1 positive"]);
    expect(screen.getByText("Previous diagnosis")).toBeTruthy();
    expect(screen.queryByText("P.D")).toBeNull(); // the abbreviation is not a heading
    expect(screen.getByText("Select all")).toBeTruthy();
    expect(screen.getByText("0/2")).toBeTruthy();
  });

  it("stays out of the way when the patient has no past diagnosis", () => {
    openPopup([]);
    expect(screen.queryByText("Previous diagnosis")).toBeNull();
  });

  // The physician's report: ticking the one diagnosis in the panel left
  // "Select all" looking pressed. A tickbox that mirrors the rows below cannot
  // tell "I chose this" from "the system chose for me", so there isn't one.
  it("picking a diagnosis never makes Select all look chosen", () => {
    openPopup(["Pregnant"]);
    fireEvent.click(tickFor("Pregnant"));
    expect(tickFor("Pregnant").checked).toBe(true);
    expect(screen.getByText("1/1")).toBeTruthy();
    // Nothing in the panel's action row is a checkbox at all.
    expect(screen.getByText("Select all").closest("label")).toBeNull();
    expect((screen.getByText("Select all") as HTMLButtonElement).tagName).toBe("BUTTON");
  });

  // A long history scrolls inside the list, so the heading and the actions stay
  // reachable — a doctor should never have to scroll back up to press Clear.
  it("scrolls the list, not the heading and actions", () => {
    openPopup(Array.from({ length: 30 }, (_, i) => `Diagnosis ${i + 1}`));
    const list = screen.getByTestId("pd-list");
    expect(list.style.overflowY).toBe("auto");
    expect(list.contains(screen.getByText("Previous diagnosis"))).toBe(false);
    expect(list.contains(screen.getByText("Select all"))).toBe(false);
    expect(list.contains(screen.getByTestId("pd-Diagnosis 30"))).toBe(true);
  });

  it("Clear appears only once something is ticked, and clears only P.D", () => {
    const { setItems } = openPopup(["CKD", "PUO"], ["Anaemia"]);
    expect(screen.queryByText("Clear")).toBeNull();
    fireEvent.click(tickFor("CKD"));
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByText("0/2")).toBeTruthy();
    fireEvent.click(screen.getByText("Done"));
    expect(setItems).toHaveBeenCalledWith(["Anaemia"]);
  });

  it("a ticked diagnosis is carried into today's list on Done", () => {
    const { setItems } = openPopup(["CKD", "PUO"]);
    fireEvent.click(tickFor("CKD"));
    fireEvent.click(screen.getByText("Done"));
    expect(setItems).toHaveBeenCalledWith(["CKD"]);
  });

  it("Select all ticks every row, and Clear takes only those back out", () => {
    const { setItems } = openPopup(["CKD", "PUO"], ["Anaemia"]);
    fireEvent.click(screen.getByText("Select all"));
    expect(screen.getByText("2/2")).toBeTruthy();
    fireEvent.click(screen.getByText("Clear"));
    fireEvent.click(screen.getByText("Done"));
    expect(setItems).toHaveBeenCalledWith(["Anaemia"]); // today's own entry survives
  });

  it("Select all keeps what the doctor typed this visit", () => {
    const { setItems } = openPopup(["CKD", "PUO"], ["Anaemia"]);
    fireEvent.click(screen.getByText("Select all"));
    fireEvent.click(screen.getByText("Done"));
    expect(setItems).toHaveBeenCalledWith(["Anaemia", "CKD", "PUO"]);
  });

  it("Cancel writes nothing back", () => {
    const { setItems } = openPopup(["CKD"]);
    fireEvent.click(screen.getByText("Select all"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(setItems).not.toHaveBeenCalled();
  });

  it("shows a diagnosis already on today's list as ticked", () => {
    openPopup(["CKD", "PUO"], ["CKD"]);
    expect(tickFor("CKD").checked).toBe(true);
    expect(tickFor("PUO").checked).toBe(false);
    expect(screen.getByText("1/2")).toBeTruthy();
  });
});

describe("ExpandableField — the other clinical fields are unchanged", () => {
  it("keeps the Edit button when inlineEdit is not set", () => {
    render(<ExpandableField label="Provisional diagnosis" items={["Dengue fever"]} setItems={vi.fn()} />);
    expect(screen.getByText("✎ Edit")).toBeTruthy();
  });

  it("ignores a double-click on a bullet", () => {
    const setItems = vi.fn();
    render(<ExpandableField label="Provisional diagnosis" items={["Dengue fever"]} setItems={setItems} />);
    fireEvent.doubleClick(bullet("Dengue fever"));
    expect(screen.queryByDisplayValue("Dengue fever")).toBeNull();
    expect(setItems).not.toHaveBeenCalled();
  });
});
