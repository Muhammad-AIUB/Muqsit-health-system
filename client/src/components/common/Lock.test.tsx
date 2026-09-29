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
