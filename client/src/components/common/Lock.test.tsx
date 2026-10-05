// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Lock from "./Lock";

afterEach(cleanup);

// ⚕️ Lock is a permission boundary: an assistant without the key can SEE the
// section and must not edit it — by mouse OR keyboard.
describe("Lock", () => {
  it("makes a locked section inert, so its inputs cannot take focus", () => {
    render(<Lock locked><input aria-label="field" /></Lock>);
    const input = screen.getByLabelText("field") as HTMLInputElement;
    expect(input.closest("[inert]")).not.toBeNull();
    expect(input.closest("[aria-disabled='true']")).not.toBeNull();
    input.focus();
    expect(document.activeElement).not.toBe(input);
  });

  it("leaves an unlocked section fully usable", () => {
    render(<Lock locked={false}><input aria-label="field" /></Lock>);
    const input = screen.getByLabelText("field") as HTMLInputElement;
    expect(input.closest("[inert]")).toBeNull();
    input.focus();
    expect(document.activeElement).toBe(input);
  });
});

// The same trap as PatientGate (2026-10-06): when the section's root is a
// <div>, React re-uses the lock's own <div> for it on unlocking, and an `inert`
// set by hand would stay on the re-used node — a section the assistant was just
// granted would stay dead until the page was reloaded.
describe("Lock — unlocking really unlocks", () => {
  // A plain element, not a component: wrapped in one, React sees a different
  // type and replaces the node, and the trap hides.
  const section = <div><div><input aria-label="field" /></div></div>;

  it("⚕️ nothing stays inert once the key is granted, when the section's root is a <div>", () => {
    const { rerender } = render(<Lock locked>{section}</Lock>);
    expect(document.querySelector("[inert]")).not.toBeNull();
    rerender(<Lock locked={false}>{section}</Lock>);
    expect(document.querySelector("[inert]")).toBeNull();
    const input = screen.getByLabelText("field") as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it("and locking it again locks it again", () => {
    const { rerender } = render(<Lock locked={false}>{section}</Lock>);
    rerender(<Lock locked>{section}</Lock>);
    expect((screen.getByLabelText("field") as HTMLInputElement).closest("[inert]")).not.toBeNull();
  });
});
