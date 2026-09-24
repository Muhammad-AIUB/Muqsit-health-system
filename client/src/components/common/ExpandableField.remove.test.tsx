// @vitest-environment jsdom
//
// ⚕️ × beside each line of the OPD clinical sidebar (physician's request,
// 2026-09-25). One click takes that ONE line off, and an Undo bar puts it back
// where it was — a mis-click beside a diagnosis must never cost the doctor the
// line. Opt-in (`removable`), passed by LeftColumn only.

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ExpandableField from "./ExpandableField";

vi.mock("@/hooks/useFieldRecents", () => ({ useFieldRecents: () => ({ getRecents: () => [], addRecents: vi.fn() }) }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }) }));
let canEdit = true;
let patientId = "A";
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({ canEditLabel: () => canEdit, can: () => canEdit, currentPatientId: patientId }) }));

afterEach(() => { cleanup(); canEdit = true; patientId = "A"; });

let latest: string[] = [];
function Field({ initial, removable = true, inlineEdit }: { initial: string[]; removable?: boolean; inlineEdit?: boolean }) {
  const [items, setItems] = useState(initial);
  latest = items;
  return <ExpandableField label="Chief complaints" items={items} setItems={setItems} removable={removable} inlineEdit={inlineEdit} />;
}
const xFor = (text: string) => screen.getByLabelText(`Remove "${text}"`);

describe("ExpandableField — × removes one line", () => {
  it("puts a × beside every line", () => {
    render(<Field initial={["Headache", "Fever", "Cough"]} />);
    expect(screen.getAllByLabelText(/^Remove "/)).toHaveLength(3);
  });

  it("removes exactly the line clicked", () => {
    render(<Field initial={["Headache", "Fever", "Cough"]} />);
    fireEvent.click(xFor("Fever"));
    expect(latest).toEqual(["Headache", "Cough"]);
  });

  it("removes only the one clicked when two lines read the same", () => {
    render(<Field initial={["Fever", "Fever", "Cough"]} />);
    fireEvent.click(screen.getAllByLabelText('Remove "Fever"')[1]);
    expect(latest).toEqual(["Fever", "Cough"]);
  });

  it("⚕️ Undo puts the line back in its old place", () => {
    render(<Field initial={["Headache", "Fever", "Cough"]} />);
    fireEvent.click(xFor("Fever"));
    expect(screen.getByText(/Removed/).textContent).toContain("Fever");
    fireEvent.click(screen.getByText("Undo"));
    expect(latest).toEqual(["Headache", "Fever", "Cough"]);
    expect(screen.queryByText(/Removed/)).toBeNull();
  });

  it("the Undo bar can be dismissed, and the line stays removed", () => {
    render(<Field initial={["Headache", "Fever"]} />);
    fireEvent.click(xFor("Fever"));
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText(/Removed/)).toBeNull();
    expect(latest).toEqual(["Headache"]);
  });

  it("removing the last line still offers Undo", () => {
    render(<Field initial={["Headache"]} />);
    fireEvent.click(xFor("Headache"));
    expect(latest).toEqual([]);
    fireEvent.click(screen.getByText("Undo"));
    expect(latest).toEqual(["Headache"]);
  });

  it("offers no × to an assistant who cannot edit this field", () => {
    canEdit = false;
    render(<Field initial={["Headache"]} />);
    expect(screen.queryAllByLabelText(/^Remove "/)).toHaveLength(0);
  });

  it("offers no × while the in-place edit boxes are open", () => {
    render(<Field initial={["Headache"]} inlineEdit />);
    fireEvent.click(screen.getByText("✎ Edit"));
    expect(screen.queryAllByLabelText(/^Remove "/)).toHaveLength(0);
  });

  it("⚕️ switching patient drops the Undo — one patient's line can never land in another's list", () => {
    // The field stays mounted across a patient switch (it is keyed by label).
    const { rerender } = render(<ExpandableField label="Chief complaints" items={["HIV", "Fever"]} setItems={vi.fn()} removable />);
    fireEvent.click(xFor("HIV"));
    expect(screen.getByText(/Removed/)).toBeTruthy();
    patientId = "B";
    rerender(<ExpandableField label="Chief complaints" items={["Cough"]} setItems={vi.fn()} removable />);
    expect(screen.queryByText("Undo")).toBeNull();
  });

  it("hides the Undo from someone who can no longer edit the field", () => {
    const { rerender } = render(<ExpandableField label="Chief complaints" items={["Headache"]} setItems={vi.fn()} removable />);
    fireEvent.click(xFor("Headache"));
    canEdit = false;
    rerender(<ExpandableField label="Chief complaints" items={[]} setItems={vi.fn()} removable />);
    expect(screen.queryByText("Undo")).toBeNull();
  });

  it("a field that did not opt in has no × at all", () => {
    render(<Field initial={["Headache"]} removable={false} />);
    expect(screen.queryAllByLabelText(/^Remove "/)).toHaveLength(0);
  });
});
