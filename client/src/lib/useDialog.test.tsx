// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useDialog } from "./useDialog";

afterEach(cleanup);

function Popup({ label, onClose, children }: { label: string; onClose: () => void; children?: React.ReactNode }) {
  const dialog = useDialog(true, onClose);
  return <div role="dialog" aria-label={label} {...dialog}>{children}</div>;
}

const escape = (target: Element | Document = document) => fireEvent.keyDown(target, { key: "Escape" });

describe("useDialog — Escape closes the popup on top, and only that", () => {
  it("Escape closes an open popup", () => {
    const onClose = vi.fn();
    render(<Popup label="On examination" onClose={onClose} />);
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("no other key closes it", () => {
    const onClose = vi.fn();
    render(<Popup label="On examination" onClose={onClose} />);
    for (const key of ["Enter", "Tab", " ", "a"]) fireEvent.keyDown(document, { key });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a closed popup does not listen", () => {
    const onClose = vi.fn();
    function Closed() { useDialog(false, onClose); return null; }
    render(<Closed />);
    escape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("⚕️ a field that uses Escape for itself keeps the popup open", () => {
    // A date box abandons a typo with Escape. If that also closed the popup the
    // doctor would lose the whole form to correct one date.
    const onClose = vi.fn();
    const abandon = vi.fn();
    render(
      <Popup label="New patient" onClose={onClose}>
        <input aria-label="Date of birth" onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); abandon(); } }} />
      </Popup>,
    );
    escape(screen.getByLabelText("Date of birth"));
    expect(abandon).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("⚕️ with two popups open, Escape closes the one on top and leaves the one under it", () => {
    // A report image opened over the Investigation popup: one Escape must not
    // throw away the results being typed underneath.
    const closeUnder = vi.fn();
    const closeTop = vi.fn();
    render(
      <>
        <Popup label="Investigation report findings" onClose={closeUnder} />
        <Popup label="Report image" onClose={closeTop} />
      </>,
    );
    escape();
    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeUnder).not.toHaveBeenCalled();
  });

  it("a popup under a dialog it does not own also stays open", () => {
    // The lightbox closes itself on Escape with its own listener; the popup
    // beneath must still see that it is not the one on top.
    const closeUnder = vi.fn();
    render(
      <>
        <Popup label="Investigation report findings" onClose={closeUnder} />
        <div role="dialog" aria-label="Image viewer" />
      </>,
    );
    escape();
    expect(closeUnder).not.toHaveBeenCalled();
  });

  it("always calls the latest close handler", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Popup label="Drug history" onClose={first} />);
    rerender(<Popup label="Drug history" onClose={second} />);
    escape();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("the panel can take focus but is not a Tab stop", () => {
    render(<Popup label="Drug history" onClose={() => {}} />);
    const panel = screen.getByRole("dialog", { name: "Drug history" });
    expect(panel.getAttribute("tabindex")).toBe("-1");
  });
});
