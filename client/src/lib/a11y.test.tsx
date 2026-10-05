// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { pressable } from "./a11y";

afterEach(cleanup);

// The rows, cards and words that are clickable without being a <button> had no
// keyboard route at all. `pressable()` gives them one by calling the element's
// OWN onClick, so there is one handler and the two routes cannot drift apart.
describe("pressable — a clickable element that is not a button", () => {
  it("joins the tab order and is announced as a button", () => {
    render(<div onClick={() => {}} {...pressable()}>Profile</div>);
    const row = screen.getByRole("button", { name: "Profile" });
    expect(row.getAttribute("tabindex")).toBe("0");
  });

  it("Enter and Space press it — through the element's own onClick", () => {
    const open = vi.fn();
    render(<div onClick={open} {...pressable()}>Profile</div>);
    const row = screen.getByRole("button", { name: "Profile" });
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("any other key does nothing", () => {
    const open = vi.fn();
    render(<div onClick={open} {...pressable()}>Profile</div>);
    const row = screen.getByRole("button", { name: "Profile" });
    for (const key of ["a", "Tab", "Escape", "ArrowDown"]) fireEvent.keyDown(row, { key });
    expect(open).not.toHaveBeenCalled();
  });

  it("a key typed in a field INSIDE the element does not press the element", () => {
    // A row that holds a note box: a space in the note must stay a space.
    const open = vi.fn();
    render(
      <div onClick={open} {...pressable()}>
        Row <input aria-label="note" />
      </div>,
    );
    fireEvent.keyDown(screen.getByLabelText("note"), { key: " " });
    fireEvent.keyDown(screen.getByLabelText("note"), { key: "Enter" });
    expect(open).not.toHaveBeenCalled();
  });

  it("Space is not left to scroll the page", () => {
    render(<div onClick={() => {}} {...pressable()}>Profile</div>);
    const notPrevented = fireEvent.keyDown(screen.getByRole("button", { name: "Profile" }), { key: " " });
    expect(notPrevented).toBe(false);
  });

  it("a row that cannot be pressed says so and is not a tab stop", () => {
    render(<div {...pressable(false)}>Coming soon</div>);
    const row = screen.getByText("Coming soon");
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row.hasAttribute("tabindex")).toBe(false);
    expect(row.getAttribute("role")).toBeNull();
  });
});
