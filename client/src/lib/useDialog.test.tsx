// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
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

// ── Tab stays inside, and closing goes back to where the doctor was ──
describe("useDialog — Tab stays inside the popup", () => {
  const tab = (shiftKey = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab", shiftKey });
  const Form = ({ label = "Add family member" }: { label?: string }) => (
    <Popup label={label} onClose={() => {}}>
      <input aria-label="Name" />
      <input aria-label="Mobile" />
      <button type="button" disabled>Skipped</button>
      <button type="button">Save</button>
    </Popup>
  );

  it("⚕️ Tab on the last control comes round to the first, instead of into the page behind", () => {
    render(<><button type="button">Behind the backdrop</button><Form /></>);
    screen.getByRole("button", { name: "Save" }).focus();
    const e = tab();
    expect(e).toBe(false); // the browser's own move was stopped
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("Shift+Tab on the first control goes to the last — a disabled one is not a stop", () => {
    render(<Form />);
    screen.getByLabelText("Name").focus();
    tab(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save" }));
  });

  it("in between, Tab is left to the browser and to the popup's own fields", () => {
    render(<Form />);
    screen.getByLabelText("Name").focus();
    expect(tab()).toBe(true); // not prevented
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("with the focus on nothing at all, Tab starts at the first control and Shift+Tab at the last", () => {
    render(<Form />);
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save" }));
  });

  it("a popup with nothing to press keeps the focus on itself", () => {
    render(<><button type="button">Behind the backdrop</button><Popup label="Notice" onClose={() => {}}>Saved.</Popup></>);
    const panel = screen.getByRole("dialog", { name: "Notice" });
    panel.focus();
    expect(tab()).toBe(false);
    expect(document.activeElement).toBe(panel);
  });

  it("⚕️ focus still on the page behind — the button that opened the popup — is brought in, not walked along the page", () => {
    render(<><button type="button">+ Add</button><Form /></>);
    const behind = screen.getByRole("button", { name: "+ Add" });
    behind.focus();
    expect(tab()).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
    behind.focus();
    tab(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save" }));
  });

  it("⚕️ only the popup on top holds Tab — a question raised over it does", () => {
    render(
      <>
        <Form label="Investigation report findings" />
        <div role="alertdialog" aria-label="Remove this page?"><button type="button">Cancel</button></div>
      </>,
    );
    const cancel = screen.getByRole("button", { name: "Cancel" });
    cancel.focus();
    // The popup underneath must not pull the focus back out of the question.
    expect(tab()).toBe(true);
    expect(document.activeElement).toBe(cancel);
  });

  it("an alertdialog counts as the popup on top for Escape too", () => {
    const closeUnder = vi.fn();
    render(
      <>
        <Popup label="Investigation report findings" onClose={closeUnder} />
        <div role="alertdialog" aria-label="Remove this page?" />
      </>,
    );
    escape();
    expect(closeUnder).not.toHaveBeenCalled();
  });
});

describe("useDialog — closing puts the focus back where it was", () => {
  function Opener({ handOn }: { handOn?: boolean }) {
    const [open, setOpen] = useState(false);
    const next = useRef<HTMLInputElement>(null);
    const close = () => { setOpen(false); if (handOn) next.current?.focus(); };
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>+ Add</button>
        <input aria-label="Next box" ref={next} />
        {open && <Inner onClose={close} />}
      </>
    );
  }
  function Inner({ onClose }: { onClose: () => void }) {
    const dialog = useDialog(true, onClose);
    // A box that takes the focus for itself as the popup opens.
    return <div role="dialog" aria-label="Chief complaints" {...dialog}><input aria-label="Entry" autoFocus /><button type="button" onClick={onClose}>Done</button></div>;
  }
  const open = () => {
    const add = screen.getByRole("button", { name: "+ Add" });
    add.focus();
    fireEvent.click(add);
    return add;
  };

  it("⚕️ after Done, the focus is on the button that opened the popup — not lost on the page", () => {
    render(<Opener />);
    const add = open();
    expect(document.activeElement).toBe(screen.getByLabelText("Entry"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(add);
  });

  it("the same after Escape", () => {
    render(<Opener />);
    const add = open();
    escape();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(add);
  });

  it("a popup that hands the focus on by itself keeps its own choice", () => {
    render(<Opener handOn />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Next box"));
  });
});
