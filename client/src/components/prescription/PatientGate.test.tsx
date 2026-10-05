// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PatientGate from "./PatientGate";

afterEach(cleanup);

// ⚕️ "Nothing can be written on the prescription until a patient is chosen."
// The gate stopped the mouse only; Tab walked into the blurred editor and text
// landed in the ℞ pad with no patient (DEFECT-E2). The browser journey that
// found it is e2e/tests/prescription.spec.ts; this pins the mechanism.
describe("PatientGate", () => {
  const Editor = () => (
    <>
      <input aria-label="Medicine" placeholder="Start typing a medicine…" />
      <button type="button">Save &amp; print</button>
    </>
  );

  it("⚕️ closed: the editor is inert, so nothing in it can take the focus — by Tab or by any other route", () => {
    render(<PatientGate open={false}><Editor /></PatientGate>);
    const pad = screen.getByLabelText("Medicine") as HTMLInputElement;
    const gate = pad.closest("[inert]");
    expect(gate).not.toBeNull();
    expect(gate!.getAttribute("aria-disabled")).toBe("true");
    expect(gate!.contains(screen.getByText("Save & print"))).toBe(true);
    pad.focus();
    expect(document.activeElement).not.toBe(pad);
    screen.getByText("Save & print").focus();
    expect(document.activeElement).toBe(document.body);
  });

  it("closed: it still stops the mouse and still looks closed", () => {
    render(<PatientGate open={false}><Editor /></PatientGate>);
    const gate = screen.getByLabelText("Medicine").closest("[inert]") as HTMLElement;
    expect(gate.style.pointerEvents).toBe("none");
    expect(gate.style.filter).toBe("blur(2px)");
  });

  it("open: the editor is exactly its children, fully usable", () => {
    render(<PatientGate open><Editor /></PatientGate>);
    const pad = screen.getByLabelText("Medicine") as HTMLInputElement;
    expect(pad.closest("[inert]")).toBeNull();
    pad.focus();
    expect(document.activeElement).toBe(pad);
  });

  it("opening the gate leaves no inert wrapper behind", () => {
    const { rerender } = render(<PatientGate open={false}><Editor /></PatientGate>);
    rerender(<PatientGate open><Editor /></PatientGate>);
    expect(document.querySelector("[inert]")).toBeNull();
    const pad = screen.getByLabelText("Medicine") as HTMLInputElement;
    pad.focus();
    expect(document.activeElement).toBe(pad);
  });
});

// Found in the browser on the day the gate was made inert: with a <div> as the
// editor's root — which is what the real editor is — React does not replace the
// gate's wrapper when the gate opens, it RE-USES that <div> for the editor. An
// attribute set by hand stays on a re-used node, so the editor came back from
// behind the gate still inert: a patient chosen and nothing could be typed.
describe("PatientGate — opening really opens", () => {
  // A plain element, as PrescriptionView passes it — NOT a component: wrapped in
  // one, React sees a different type and replaces the node, and the trap hides.
  const grid = (
    <div className="rxEditorGrid" style={{ display: "grid" }}>
      <input aria-label="Medicine" />
    </div>
  );

  it("⚕️ a chosen patient gets an editor that takes the keyboard, when the editor's root is a <div>", () => {
    const { rerender } = render(<PatientGate open={false}>{grid}</PatientGate>);
    expect(document.querySelector("[inert]")).not.toBeNull();
    rerender(<PatientGate open>{grid}</PatientGate>);
    expect(document.querySelector("[inert]")).toBeNull();
    const pad = screen.getByLabelText("Medicine") as HTMLInputElement;
    pad.focus();
    expect(document.activeElement).toBe(pad);
  });

  it("closing it again (a new prescription) closes it again", () => {
    const { rerender } = render(<PatientGate open>{grid}</PatientGate>);
    rerender(<PatientGate open={false}>{grid}</PatientGate>);
    const pad = screen.getByLabelText("Medicine") as HTMLInputElement;
    expect(pad.closest("[inert]")).not.toBeNull();
    rerender(<PatientGate open>{grid}</PatientGate>);
    expect(document.querySelector("[inert]")).toBeNull();
  });
});
