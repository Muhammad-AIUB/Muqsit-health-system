// @vitest-environment jsdom
//
// The print sheet covers the whole screen. Until 2026-10-12 it closed on Escape
// and that was all the keyboard got: the focus was left on the page underneath
// and Tab walked on through it (measured in the browser: three presses reached
// the patient chat's message box, where Enter sends). And once the focus was
// INSIDE the sheet — it always is after Print, which focuses the frame — a key
// never reached the app at all: Escape did nothing, and Tab left the frame for
// the page behind the overlay.

import { useState } from "react";
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

  it("names itself by the label it is given, 'Prescription' by default", () => {
    const { unmount } = render(<PrintSheetModal html={SHEET} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Prescription" })).toBeTruthy();
    unmount();
    render(<PrintSheetModal html={SHEET} onClose={() => {}} label="OPD queue" />);
    expect(screen.getByRole("dialog", { name: "OPD queue" })).toBeTruthy();
    expect(screen.getByTitle("OPD queue")).toBeTruthy();
  });

  it("writes the sheet into its frame", () => {
    render(<PrintSheetModal html={SHEET} onClose={() => {}} />);
    expect(frameOf().contentDocument?.body.textContent).toContain("Tablet. Napa 500 mg");
  });

  // ⚕️ The sheet is a legal document, and the frame is what gets printed and
  // what the gallery snapshot pictures. Listening for keys in it must add
  // nothing to it: the frame holds what a bare frame given the same string
  // holds, element for element.
  it("⚕️ the frame holds exactly the sheet it was given — nothing is added to what prints", () => {
    const FULL = `<!doctype html><html><head><title>Rx</title><style>@page { size: A4 } .sheet { color: #111 }</style></head><body><div class="sheet"><p>Tablet. Napa 500 mg</p><p>1+0+1 — 5 days</p></div><script>document.body.dataset.fit = "1";</script></body></html>`;
    render(<PrintSheetModal html={FULL} onClose={() => {}} />);
    const bare = document.createElement("iframe");
    document.body.appendChild(bare);
    try {
      const d = bare.contentDocument as Document;
      d.open(); d.write(FULL); d.close();
      const got = frameOf().contentDocument as Document;
      expect(got.documentElement.outerHTML).toBe(d.documentElement.outerHTML);
      expect(got.querySelectorAll("*").length).toBe(d.querySelectorAll("*").length);
    } finally {
      bare.remove();
    }
  });

  // Writing the sheet again would throw away where the doctor had scrolled to
  // and run the sheet's own fitting a second time.
  it("⚕️ the sheet is written ONCE — the app re-rendering around it does not write it again", () => {
    const { rerender } = render(<PrintSheetModal html={SHEET} onClose={() => {}} />);
    const body = frameOf().contentDocument?.body;
    expect(body).toBeTruthy();
    rerender(<PrintSheetModal html={SHEET} onClose={() => {}} />); // a new onClose, the same sheet
    rerender(<PrintSheetModal html={SHEET} afterSave onClose={() => {}} />);
    expect(frameOf().contentDocument?.body).toBe(body);
  });

  // The popup keeps Tab on the controls it knows about, and a frame is not one
  // unless it says so: without the attribute Tab went Print → Close → Print, and
  // a doctor at a keyboard could not get INTO the sheet to scroll it.
  it("the sheet itself is one of the popup's Tab stops, so it can be scrolled before it is printed", () => {
    const { container } = render(<PrintSheetModal html={SHEET} onClose={() => {}} />);
    expect(frameOf().getAttribute("tabindex")).toBe("0");
    // In order: Print, Close, then the sheet.
    const stops = Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'));
    expect(stops.map((el) => el.tagName)).toEqual(["BUTTON", "BUTTON", "IFRAME"]);
  });

  it("⚕️ Shift+Tab on Print goes back INTO the sheet, and Tab from the sheet's place comes round to Print", () => {
    render(<PrintSheetModal html={SHEET} onClose={() => {}} />);
    const print = screen.getByRole("button", { name: /Print/ });
    print.focus();
    expect(fireEvent.keyDown(print, { key: "Tab", shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(frameOf());
    expect(fireEvent.keyDown(frameOf(), { key: "Tab" })).toBe(false);
    expect(document.activeElement).toBe(print);
  });

  it("from Close, Tab is the browser's own step into the sheet — the popup does not send it round", () => {
    render(<PrintSheetModal html={SHEET} onClose={() => {}} />);
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    expect(fireEvent.keyDown(close, { key: "Tab" })).toBe(true); // not prevented
  });

  it("…but not while it is still being saved and there is nothing in it", () => {
    render(<PrintSheetModal html={null} onClose={() => {}} />);
    expect(frameOf().getAttribute("tabindex")).toBe("-1");
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    expect(fireEvent.keyDown(close, { key: "Tab" })).toBe(false); // Close is the only stop: Tab stays on it
    expect(document.activeElement).toBe(close);
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

// ⚕️ "Save & print" SAVES. Every other popup gives the focus back to what
// opened it; this one must not, when that was the Save button: with the focus
// there, Enter or Space — the key that scrolls a page — files the consultation
// a second time (a second Prescription row; the server does not dedupe), and
// Enter held down on Close does it with no second press at all. Before the
// sheet was a popup like the others (2026-10-12) the focus ended on the page,
// so this is that behaviour kept, for this one route. "Preview PDF" saves
// nothing and gets its focus back like any popup (the contract above).
describe("PrintSheetModal — opened by the button that saves", () => {
  function SaveAndPrint() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Save &amp; print prescription</button>
        {open && <PrintSheetModal html={SHEET} afterSave onClose={() => setOpen(false)} />}
      </>
    );
  }
  const openIt = () => {
    render(<SaveAndPrint />);
    const save = screen.getByRole("button", { name: "Save & print prescription" });
    save.focus();
    fireEvent.click(save);
    return save;
  };

  it("⚕️ Close does NOT put the focus back on Save & print", () => {
    const save = openIt();
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    fireEvent.click(close);
    expect(screen.queryByRole("dialog", { name: "Prescription" })).toBeNull();
    expect(document.activeElement).not.toBe(save);
  });

  it("⚕️ nor does Escape", () => {
    const save = openIt();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Prescription" })).toBeNull();
    expect(document.activeElement).not.toBe(save);
  });

  it("⚕️ nor Escape pressed inside the sheet, where the focus is after Print", () => {
    const save = openIt();
    const { doc } = stubFrame();
    fireEvent.keyDown(doc.body, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Prescription" })).toBeNull();
    expect(document.activeElement).not.toBe(save);
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
