// @vitest-environment jsdom
//
// The print sheet covers the whole screen. Until 2026-10-12 it closed on Escape
// and that was all the keyboard got: the focus was left on the page underneath
// and Tab walked on through it (measured in the browser: three presses reached
// the patient chat's message box, where Enter sends). And once the focus was
// INSIDE the sheet — it always is after Print, which focuses the frame — a key
// never reached the app at all: Escape did nothing, and Tab left the frame for
// the page behind the overlay.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PrintSheetModal from "./PrintSheetModal";
import { itKeepsTheKeyboard } from "@/test/dialogKeyboard";

afterEach(cleanup);

const SHEET = "<!doctype html><html><body><p>Tablet. Napa 500 mg</p></body></html>";

const frameOf = () => screen.getByTitle("Prescription") as HTMLIFrameElement;

// jsdom does not print or move window focus; stand in for both on the frame.
const stubFrame = () => {
  const win = frameOf().contentWindow as Window;
  const print = vi.fn();
  win.print = print;
  win.focus = vi.fn();
  return { win, print, doc: frameOf().contentDocument as Document };
};

describe("PrintSheetModal — the keyboard stays with the sheet", () => {
  itKeepsTheKeyboard({
    label: "Prescription",
    render: (onClose) => <PrintSheetModal html={SHEET} onClose={onClose} />,
  });

  it("writes the sheet into its frame", () => {
    render(<PrintSheetModal html={SHEET} onClose={() => {}} />);
    expect(frameOf().contentDocument?.body.textContent).toContain("Tablet. Napa 500 mg");
  });

  it("while the visit is still being saved, Print cannot be pressed", () => {
    render(<PrintSheetModal html={null} onClose={() => {}} />);
    const print = screen.getByRole("button", { name: /Print/ }) as HTMLButtonElement;
    expect(print.disabled).toBe(true);
    expect(screen.getByText("Saving the prescription…")).toBeTruthy();
  });

  it("Ctrl+P prints the SHEET, not the app page", () => {
    render(<PrintSheetModal html={SHEET} onClose={() => {}} />);
    const { print } = stubFrame();
    const notPrevented = fireEvent.keyDown(document.body, { key: "p", ctrlKey: true });
    expect(notPrevented).toBe(false); // the browser's own print was stopped
    expect(print).toHaveBeenCalledTimes(1);
  });
});

// After Print the focus is inside the frame, and a key pressed there never
// reaches the app's own document.
describe("PrintSheetModal — with the focus inside the sheet", () => {
  it("⚕️ Escape still closes it", () => {
    const onClose = vi.fn();
    render(<PrintSheetModal html={SHEET} onClose={onClose} />);
    const { doc } = stubFrame();
    fireEvent.keyDown(doc.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("⚕️ Ctrl+P prints the sheet, as it does from outside it", () => {
    render(<PrintSheetModal html={SHEET} onClose={() => {}} />);
    const { doc, print } = stubFrame();
    const notPrevented = fireEvent.keyDown(doc.body, { key: "p", ctrlKey: true });
    expect(notPrevented).toBe(false);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("⚕️ Tab comes back to the sheet's own buttons — not out to the editor behind", () => {
    render(<><button type="button">Behind the sheet</button><PrintSheetModal html={SHEET} onClose={() => {}} /></>);
    const { doc } = stubFrame();
    expect(fireEvent.keyDown(doc.body, { key: "Tab" })).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Print/ }));
    expect(fireEvent.keyDown(doc.body, { key: "Tab", shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("a sheet written again keeps answering the keyboard", () => {
    const onClose = vi.fn();
    const { rerender } = render(<PrintSheetModal html={SHEET} onClose={onClose} />);
    rerender(<PrintSheetModal html={SHEET.replace("Napa", "Ace")} onClose={onClose} />);
    const { doc } = stubFrame();
    expect(doc.body.textContent).toContain("Ace");
    fireEvent.keyDown(doc.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
