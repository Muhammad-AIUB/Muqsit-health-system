// What every popup owes a doctor at a keyboard, as ONE check a popup's own test
// file runs against the real component (lib/useDialog.ts is what provides it):
//
//   • Tab stays inside — past the last control it comes round to the first, and
//     focus left on the page behind is brought in. Without this a doctor tabs
//     out of a full-screen popup into the prescription editor behind it and
//     types into a field they cannot see.
//   • Escape closes it, ONCE — a popup with two listeners runs its close twice,
//     and a close that asks "discard your changes?" then answers itself.
//   • A question raised over it owns Escape; the popup underneath stays.
//   • Opening it takes the focus off the button behind it, and closing puts it
//     back there.
//
// jsdom has no layout, so "the controls Tab can land on" are simply the enabled
// ones in the popup, in document order — the same fallback the hook itself
// uses, from the hook's own list: a stop the hook counts and this file did not
// (the print sheet's frame, once it became one) would make the two disagree
// about which control is "the last".

import { useState, type ReactElement } from "react";
import { expect, it, vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TABBABLE } from "@/lib/useDialog";

export const tabStopsOf = (panel: HTMLElement) =>
  Array.from(panel.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.closest('[inert], [aria-hidden="true"]'),
  );

const tab = (shiftKey = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab", shiftKey });

export interface DialogKeyboardOptions {
  /** The popup's `aria-label`. */
  label: string;
  /** The popup, open, closing through the handler it is given. */
  render: (onClose: () => void) => ReactElement;
  /** Wait for the popup to be ready (a popup that loads something first). */
  ready?: () => Promise<unknown>;
}

export function itKeepsTheKeyboard({ label, render: popup, ready }: DialogKeyboardOptions) {
  const panelOf = () => screen.getByRole("dialog", { name: label });

  const mount = async (): Promise<{ panel: HTMLElement; onClose: Mock; behind: HTMLElement }> => {
    const onClose = vi.fn();
    render(<><button type="button">Behind the popup</button>{popup(onClose)}</>);
    if (ready) await ready();
    return { panel: panelOf(), onClose, behind: screen.getByRole("button", { name: "Behind the popup" }) };
  };

  it("⚕️ Tab on the last control comes round to the first — not into the page behind", async () => {
    const { panel } = await mount();
    const stops = tabStopsOf(panel);
    expect(stops.length).toBeGreaterThan(0);
    stops[stops.length - 1].focus();
    expect(tab()).toBe(false); // the browser's own move was stopped
    expect(document.activeElement).toBe(stops[0]);
  });

  it("Shift+Tab on the first control goes to the last", async () => {
    const { panel } = await mount();
    const stops = tabStopsOf(panel);
    stops[0].focus();
    expect(tab(true)).toBe(false);
    expect(document.activeElement).toBe(stops[stops.length - 1]);
  });

  it("⚕️ focus left on the page behind is brought into the popup", async () => {
    const { panel, behind } = await mount();
    behind.focus();
    expect(tab()).toBe(false);
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it("Escape closes it, once", async () => {
    const { onClose } = await mount();
    // On the body, where a real key press starts: it reaches `document` and
    // `window` alike, so a popup listening in two places would close twice.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("⚕️ a question raised over it owns Escape — the popup underneath stays open", async () => {
    const { onClose } = await mount();
    const question = document.createElement("div");
    question.setAttribute("role", "alertdialog");
    question.setAttribute("aria-label", "Remove this page?");
    document.body.appendChild(question);
    try {
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      question.remove();
    }
  });

  function Opener() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Open it</button>
        {open && popup(() => setOpen(false))}
      </>
    );
  }
  const openFromButton = async () => {
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "Open it" });
    opener.focus();
    fireEvent.click(opener);
    if (ready) await ready();
    return opener;
  };

  it("⚕️ opening it takes the focus off the button behind it", async () => {
    // Left behind the popup, the focus is on a control the doctor cannot see:
    // Enter presses it again, and Tab starts from the page underneath.
    const opener = await openFromButton();
    await waitFor(() => expect(panelOf().contains(document.activeElement)).toBe(true));
    expect(document.activeElement).not.toBe(opener);
  });

  it("closing puts the focus back on what opened it", async () => {
    const opener = await openFromButton();
    // Wherever the popup put the focus while it was open…
    const stops = tabStopsOf(panelOf());
    stops[stops.length - 1]?.focus();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: label })).toBeNull();
    // …it is back on the button that opened it, not lost on the page.
    expect(document.activeElement).toBe(opener);
  });
}
