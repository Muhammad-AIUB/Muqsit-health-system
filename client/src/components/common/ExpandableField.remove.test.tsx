// @vitest-environment jsdom
//
// ⚕️ Taking a line off the OPD clinical sidebar.
//
// From 2026-09-25 a × stood beside every line, always, and one click took the
// line off (with an Undo). The physician asked for it to go (sheet of
// 15/10/2026, item 4: "cross delete koro, ageo bolsi accidental delete hoa
// jabe" — it caused accidental deletes). A line is now taken off only inside
// ✎ Edit: a field corrected in place shows a red ✕ beside each of its boxes,
// and the popup fields keep the × on each chip of their popup. The Undo bar is
// kept — a mis-click must never cost the doctor the line.

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
function Field({ initial, removable = true, inlineEdit = true, label = "Chief complaints" }: { initial: string[]; removable?: boolean; inlineEdit?: boolean; label?: string }) {
  const [items, setItems] = useState(initial);
  latest = items;
  return <ExpandableField label={label} items={items} setItems={setItems} removable={removable} inlineEdit={inlineEdit} />;
}
const xFor = (text: string) => screen.getByLabelText(`Remove "${text}"`);
const edit = () => fireEvent.click(screen.getByText("✎ Edit"));

describe("ExpandableField — no × beside a line that is being read", () => {
  it("⚕️ the list carries no × at all — one click can no longer take a line off", () => {
    render(<Field initial={["Headache", "Fever", "Cough"]} />);
    expect(screen.queryAllByLabelText(/^Remove "/)).toHaveLength(0);
    expect(screen.queryByText("×")).toBeNull();
  });

  it("nor does a popup field's list (History, Associated illness)", () => {
    render(<Field label="History" initial={["DM for 5 years"]} inlineEdit={false} />);
    expect(screen.queryAllByLabelText(/^Remove "/)).toHaveLength(0);
  });

  it("a popup field's line is still taken off inside ✎ Edit, from its chip", () => {
    render(<Field label="History" initial={["DM for 5 years", "HTN"]} inlineEdit={false} />);
    edit();
    const dialog = screen.getByRole("dialog", { name: "History" });
    const chip = Array.from(dialog.querySelectorAll("span")).find((s) => s.textContent?.startsWith("DM for 5 years"))!;
    fireEvent.click(chip.querySelector("button, [role=button]") ?? chip.lastElementChild!);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(latest).toEqual(["HTN"]);
  });
});

describe("ExpandableField — inside ✎ Edit, a ✕ takes ONE line off", () => {
  it("puts a ✕ beside every box", () => {
    render(<Field initial={["Headache", "Fever", "Cough"]} />);
    edit();
    expect(screen.getAllByLabelText(/^Remove "/)).toHaveLength(3);
  });

  it("removes exactly the line pressed, and the edit stays open", () => {
    render(<Field initial={["Headache", "Fever", "Cough"]} />);
    edit();
    fireEvent.click(xFor("Fever"));
    expect(latest).toEqual(["Headache", "Cough"]);
    expect((screen.getByTestId("edit-0") as HTMLInputElement).value).toBe("Headache");
    expect((screen.getByTestId("edit-1") as HTMLInputElement).value).toBe("Cough");
  });

  it("removes only the one pressed when two lines read the same", () => {
    render(<Field initial={["Fever", "Fever", "Cough"]} />);
    edit();
    fireEvent.click(screen.getAllByLabelText('Remove "Fever"')[1]);
    expect(latest).toEqual(["Fever", "Cough"]);
  });

  it("⚕️ a correction typed in another box survives the removal", () => {
    render(<Field initial={["Headache", "Fevr", "Cough"]} />);
    edit();
    fireEvent.change(screen.getByTestId("edit-1"), { target: { value: "Fever" } });
    fireEvent.click(xFor("Headache"));
    fireEvent.keyDown(screen.getByTestId("edit-0"), { key: "Enter" });
    expect(latest).toEqual(["Fever", "Cough"]);
  });

  it("⚕️ Undo puts the line back in its old place", () => {
    render(<Field initial={["Headache", "Fever", "Cough"]} />);
    edit();
    fireEvent.click(xFor("Fever"));
    expect(screen.getByText(/Removed/).textContent).toContain("Fever");
    fireEvent.click(screen.getByText("Undo"));
    expect(latest).toEqual(["Headache", "Fever", "Cough"]);
    expect(screen.queryByText(/Removed/)).toBeNull();
  });

  it("Undo still works after the edit is finished", () => {
    render(<Field initial={["Headache", "Fever"]} />);
    edit();
    fireEvent.click(xFor("Fever"));
    fireEvent.click(screen.getByText("✓ Done"));
    fireEvent.click(screen.getByText("Undo"));
    expect(latest).toEqual(["Headache", "Fever"]);
  });

  it("the Undo bar can be dismissed, and the line stays removed", () => {
    render(<Field initial={["Headache", "Fever"]} />);
    edit();
    fireEvent.click(xFor("Fever"));
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText(/Removed/)).toBeNull();
    expect(latest).toEqual(["Headache"]);
  });

  it("removing the last line still offers Undo", () => {
    render(<Field initial={["Headache"]} />);
    edit();
    fireEvent.click(xFor("Headache"));
    expect(latest).toEqual([]);
    fireEvent.click(screen.getByText("Undo"));
    expect(latest).toEqual(["Headache"]);
  });

  it("offers nothing to an assistant who cannot edit this field", () => {
    canEdit = false;
    render(<Field initial={["Headache"]} />);
    expect(screen.queryByText("✎ Edit")).toBeNull();
    expect(screen.queryAllByLabelText(/^Remove "/)).toHaveLength(0);
  });

  it("⚕️ switching patient drops the Undo — one patient's line can never land in another's list", () => {
    const { rerender } = render(<ExpandableField label="Chief complaints" items={["HIV", "Fever"]} setItems={vi.fn()} removable inlineEdit />);
    edit();
    fireEvent.click(xFor("HIV"));
    expect(screen.getByText(/Removed/)).toBeTruthy();
    patientId = "B";
    rerender(<ExpandableField label="Chief complaints" items={["Cough"]} setItems={vi.fn()} removable inlineEdit />);
    expect(screen.queryByText("Undo")).toBeNull();
  });

  it("a field that did not opt in has no ✕, even in ✎ Edit", () => {
    render(<Field initial={["Headache"]} removable={false} />);
    edit();
    expect(screen.queryAllByLabelText(/^Remove "/)).toHaveLength(0);
  });
});
