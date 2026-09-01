// @vitest-environment jsdom
//
// ⚕️ Chief complaints, Provisional diagnosis and Final diagnosis are corrected
// IN PLACE: ✎ Edit beside the + opens a box on every line at once, and Enter in
// any of them finishes the edit. The rest of the clinical sidebar keeps the
// popup flow behind the same-looking button, so both shapes are pinned here — a
// tidy-up that unified them would silently change how a diagnosis is entered.
// Which fields get which shape lives in lib/inlineEditFields, pinned there.

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

  const openEdit = () => fireEvent.click(screen.getByText("\u270e Edit"));
  const boxes = () => screen.queryAllByDisplayValue(/.*/) as HTMLInputElement[];
  const box = (i: number) => screen.getByTestId(`edit-${i}`) as HTMLInputElement;
  const type = (i: number, v: string) => fireEvent.change(box(i), { target: { value: v } });
  const enter = (i: number) => fireEvent.keyDown(box(i), { key: "Enter" });

  it("offers Edit beside the + and opens a box on EVERY line", () => {
    renderField(["CKD", "lactation", "anaemia"]);
    expect(boxes()).toHaveLength(0);
    openEdit();
    expect(boxes().map((b) => b.value)).toEqual(["CKD", "lactation", "anaemia"]);
  });

  it("Enter in any box finishes the whole edit", () => {
    const { setItems } = renderField(["CKD", "lactation"]);
    openEdit();
    type(0, "CKD stage 3");
    type(1, "lactating");
    enter(1);
    expect(setItems).toHaveBeenCalledWith(["CKD stage 3", "lactating"]);
    expect(boxes()).toHaveLength(0); // the boxes are gone — edit complete
  });

  it("saves only what was actually changed", () => {
    const { setItems } = renderField(["CKD", "lactation"]);
    openEdit();
    type(1, "lactating");
    enter(0);
    expect(setItems).toHaveBeenCalledWith(["CKD", "lactating"]);
  });

  it("the button says Done while the boxes are open, and finishes the edit too", () => {
    const { setItems } = renderField(["CKD"]);
    openEdit();
    expect(screen.queryByText("\u270e Edit")).toBeNull();
    type(0, "CKD stage 4");
    fireEvent.click(screen.getByText("\u2713 Done"));
    expect(setItems).toHaveBeenCalledWith(["CKD stage 4"]);
  });

  // The physician's report: pressing Done left the boxes open. The click was
  // preceded by the box's own blur, which saved and closed the edit — and by
  // the time the click landed the button had already become "✎ Edit" again and
  // re-opened them.
  it("Done really closes the boxes, blur and all", () => {
    const { setItems } = renderField(["CKD"]);
    openEdit();
    type(0, "CKD stage 4");
    const done = screen.getByText("✓ Done");
    fireEvent.blur(box(0), { relatedTarget: done }); // what the browser does first
    fireEvent.click(done);
    expect(setItems).toHaveBeenCalledTimes(1);
    expect(setItems).toHaveBeenCalledWith(["CKD stage 4"]);
    expect(boxes()).toHaveLength(0);
    expect(screen.getByText("✎ Edit")).toBeTruthy();
  });

  it("double-clicking a line opens the same boxes", () => {
    renderField(["CKD", "lactation"]);
    fireEvent.doubleClick(screen.getByText("lactation"));
    expect(boxes()).toHaveLength(2);
  });

  it("Escape leaves the recorded diagnoses alone", () => {
    const { setItems } = renderField(["CKD"]);
    openEdit();
    type(0, "typo");
    fireEvent.keyDown(box(0), { key: "Escape" });
    expect(setItems).not.toHaveBeenCalled();
    expect(screen.getByText("CKD")).toBeTruthy();
  });

  it("saves when the cursor leaves the list altogether", () => {
    const { setItems } = renderField(["CKD"]);
    openEdit();
    type(0, "CKD stage 4");
    fireEvent.blur(box(0), { relatedTarget: null });
    expect(setItems).toHaveBeenCalledWith(["CKD stage 4"]);
  });

  it("stays open while the cursor moves between the boxes", () => {
    const { setItems } = renderField(["CKD", "lactation"]);
    openEdit();
    type(0, "CKD stage 4");
    fireEvent.blur(box(0), { relatedTarget: box(1) });
    expect(setItems).not.toHaveBeenCalled();
    expect(boxes()).toHaveLength(2);
  });

  // Blanking a box is a mis-key, not a deletion. Removing a diagnosis stays a
  // deliberate act in the + popup, which is why that button never goes away.
  it("a blanked box does not delete the diagnosis", () => {
    const { setItems } = renderField(["CKD", "lactation"]);
    openEdit();
    type(0, "   ");
    enter(0);
    expect(setItems).not.toHaveBeenCalled();
    expect(screen.getByText("CKD")).toBeTruthy();
  });

  it("changing nothing is not a change", () => {
    const { setItems, onAdd } = renderField(["CKD"]);
    openEdit();
    enter(0);
    expect(setItems).not.toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("logs each corrected line as a new entry", () => {
    const { onAdd } = renderField(["CKD", "lactation"]);
    openEdit();
    type(0, "CKD stage 3");
    enter(0);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith("CKD stage 3");
  });

  it("an assistant without permission gets no Edit button and no boxes", () => {
    canEdit = false;
    const setItems = vi.fn();
    render(<ExpandableField label="Final diagnosis" items={["CKD"]} setItems={setItems} inlineEdit />);
    expect(screen.queryByText("\u270e Edit")).toBeNull();
    fireEvent.doubleClick(screen.getByText("CKD"));
    expect(screen.queryByTestId("edit-0")).toBeNull();
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
  // History is a popup-only field. It used to be Provisional diagnosis here,
  // until that one gained the in-place boxes on 2026-09-01 — an example that no
  // longer matches the app is worse than no example.
  it("keeps the Edit button when inlineEdit is not set", () => {
    render(<ExpandableField label="History" items={["Dengue fever"]} setItems={vi.fn()} />);
    expect(screen.getByText("✎ Edit")).toBeTruthy();
  });

  it("ignores a double-click on a bullet", () => {
    const setItems = vi.fn();
    render(<ExpandableField label="History" items={["Dengue fever"]} setItems={setItems} />);
    fireEvent.doubleClick(bullet("Dengue fever"));
    expect(screen.queryByDisplayValue("Dengue fever")).toBeNull();
    expect(setItems).not.toHaveBeenCalled();
  });
});

// ⚕️ Three fields now open boxes in place, one under the other in the sidebar.
// Each field's boxes are their OWN group: moving the cursor from one field's
// correction straight into the next field must SAVE the first, not read as
// "still inside this field" and drop what was typed.
describe("ExpandableField — two in-place fields side by side", () => {
  const renderPair = () => {
    const setChief = vi.fn();
    const setProv = vi.fn();
    render(
      <>
        <ExpandableField label="Chief complaints" items={["Fever 3 day"]} setItems={setChief} inlineEdit />
        <ExpandableField label="Provisional diagnosis" items={["Dengue"]} setItems={setProv} inlineEdit />
      </>,
    );
    const [chiefEdit, provEdit] = screen.getAllByText("✎ Edit");
    return { setChief, setProv, chiefEdit, provEdit };
  };

  it("saves the first field when the cursor moves to the next field's Edit", () => {
    const { setChief, chiefEdit, provEdit } = renderPair();
    fireEvent.click(chiefEdit);
    const box = screen.getByTestId("edit-0") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "Fever for 3 days" } });
    fireEvent.blur(box, { relatedTarget: provEdit });
    expect(setChief).toHaveBeenCalledWith(["Fever for 3 days"]);
  });

  it("opening one field's boxes leaves the other field's list alone", () => {
    const { setProv, chiefEdit } = renderPair();
    fireEvent.click(chiefEdit);
    // Only the field that was asked for is in edit mode.
    expect(screen.getAllByTestId(/^edit-/)).toHaveLength(1);
    expect(screen.getByText("Dengue")).toBeTruthy();
    expect(setProv).not.toHaveBeenCalled();
  });
});
