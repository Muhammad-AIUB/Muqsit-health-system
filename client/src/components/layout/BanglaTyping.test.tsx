// @vitest-environment jsdom
//
// BAN / EN (physician's decision, 2026-09-23). The conversion rules are pinned
// in lib/banglaInput.test.ts; this pins the wiring that makes them safe:
// only fields that opt in are converted, every other field keeps typing
// English and says why, and a digit is never intercepted.

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BanglaTyping, LanguageToggle, setKbdLang } from "./BanglaTyping";
import ExpandableField from "@/components/common/ExpandableField";
import { BANGLA_ATTR, BANGLA_FIELDS } from "@/lib/banglaInput";
import type { RxItem } from "@/types";
import type { Row } from "@/components/prescription/MedicinePad";

const setRxItems = vi.hoisted(() => vi.fn());
const visit = vi.hoisted(() => ({ printed: false }));
const setRxPadHeld = vi.hoisted(() => vi.fn());
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useFieldRecents", () => ({
  useFieldRecents: () => ({ getRecents: () => [], addRecents: vi.fn() }),
}));
vi.mock("@/hooks/useDoctorPhrases", () => ({
  useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }),
}));
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({ canEditLabel: () => true, can: () => true, setRxItems, setRxPadHeld, visitPrinted: visit.printed }),
}));

afterEach(() => {
  cleanup();
  setRxItems.mockClear();
  setRxPadHeld.mockClear();
  try { window.localStorage.removeItem("mhs_kbd_lang:u1"); } catch { /* none */ }
  act(() => setKbdLang("en"));
});

// ⚕️ BAN writes the ℞ pad's dose / food / duration in Bangla, EN writes them
// back (physician's decision, 2026-10-14). The wording is pinned in
// lib/rxLanguage.test.ts; this pins that pressing the switch is what does it.
describe("LanguageToggle — the switch writes the ℞ columns in its language", () => {
  const pad: RxItem[] = [{ drug: "Tablet. Napa 500 mg", dose: "1+0+1", instruction: "Before meal", duration: "7 days" }];
  const lastUpdate = () => setRxItems.mock.calls.at(-1)![0] as (p: RxItem[]) => RxItem[];

  it("BAN turns them Bangla, and EN turns them back", () => {
    render(<LanguageToggle />);
    fireEvent.click(screen.getByText("BAN"));
    const bn = lastUpdate()(pad);
    expect(bn[0]).toEqual({ drug: "Tablet. Napa 500 mg", dose: "১+০+১", instruction: "খাবারের আগে", duration: "৭ দিন" });
    fireEvent.click(screen.getByText("EN"));
    expect(lastUpdate()(bn)[0]).toEqual(pad[0]);
  });

  // ⚕️ 19/10/2026 (third review): the press rewrote a PRINTED visit still on the
  // pad — what it said was no longer what was printed, and the patient went
  // back to "Incomplete" (and a round trip does not even come back exactly:
  // "2 weeks" returns as "2 week"). A printed, unchanged visit is left as it
  // was printed; the language is set for what is typed next.
  it("a printed visit still on the pad is not rewritten — the language is set for what comes next", () => {
    visit.printed = true;
    try {
      render(<LanguageToggle />);
      fireEvent.click(screen.getByText("BAN"));
      expect(screen.getByText("BAN").getAttribute("aria-pressed")).toBe("true");
      expect(setRxItems).not.toHaveBeenCalled();
      expect(setRxPadHeld).not.toHaveBeenCalled();
    } finally {
      visit.printed = false;
    }
  });

  it("restoring a remembered BAN does not touch the pad — only a press does", () => {
    window.localStorage.setItem("mhs_kbd_lang:u1", "bn");
    render(<LanguageToggle />);
    expect(screen.getByText("BAN").getAttribute("aria-pressed")).toBe("true");
    expect(setRxItems).not.toHaveBeenCalled();
    expect(setRxPadHeld).not.toHaveBeenCalled();
  });

  // ⚕️ 19/10/2026: the lines the pad holds and cannot write (lib/rxPadHold.ts)
  // are written with the rest — on one side only they no longer fitted.
  it("the same press writes the lines the pad holds and cannot write", () => {
    render(<LanguageToggle />);
    fireEvent.click(screen.getByText("BAN"));
    const update = setRxPadHeld.mock.calls.at(-1)![0] as (h: Row[] | null) => Row[] | null;
    const red: Row = { drug: "", dose: "1+0+1", food: "Before meal", duration: "7 days", checked: true, isMedicine: true, continuation: false };
    expect(update([red])?.[0]).toMatchObject({ dose: "১+০+১", food: "খাবারের আগে", duration: "৭ দিন" });
    expect(update(null)).toBeNull();
  });
});

// A controlled box, the way every field in the app holds its text.
function Box({ bangla, onValue }: { bangla?: boolean; onValue?: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <input
      data-testid="box"
      {...(bangla ? BANGLA_ATTR : {})}
      value={v}
      onChange={(e) => { setV(e.target.value); onValue?.(e.target.value); }}
    />
  );
}

const typeKeys = (el: HTMLElement, keys: string) => {
  for (const key of keys) fireEvent.keyDown(el, { key });
};

describe("BanglaTyping", () => {
  it("types Bangla into a field that opted in, through the field's own onChange", () => {
    const onValue = vi.fn();
    render(<><BanglaTyping /><Box bangla onValue={onValue} /></>);
    act(() => setKbdLang("bn"));
    const box = screen.getByTestId("box") as HTMLInputElement;
    box.focus();
    typeKeys(box, "khabar");
    expect(box.value).toBe("খাবার");
    expect(onValue).toHaveBeenLastCalledWith("খাবার");
  });

  it("does nothing in EN mode", () => {
    render(<><BanglaTyping /><Box bangla /></>);
    const box = screen.getByTestId("box") as HTMLInputElement;
    box.focus();
    const ev = fireEvent.keyDown(box, { key: "k" });
    expect(ev).toBe(true); // not prevented — the browser types "k"
    expect(box.value).toBe("");
  });

  it("⚕️ never intercepts a digit, so a dose is typed exactly as keyed", () => {
    render(<><BanglaTyping /><Box bangla /></>);
    act(() => setKbdLang("bn"));
    const box = screen.getByTestId("box");
    box.focus();
    for (const key of "0123456789+./") {
      expect(fireEvent.keyDown(box, { key })).toBe(true);
    }
  });

  it("leaves every other field in English and says so, once", () => {
    render(<><BanglaTyping /><Box /></>);
    act(() => setKbdLang("bn"));
    const box = screen.getByTestId("box") as HTMLInputElement;
    box.focus();
    expect(fireEvent.keyDown(box, { key: "a" })).toBe(true); // typed as English
    expect(box.value).toBe("");
    expect(screen.getByRole("status").textContent).toMatch(/Bangla typing is not allowed in this field/);
  });

  it("shows no notice in EN mode", () => {
    render(<><BanglaTyping /><Box /></>);
    const box = screen.getByTestId("box");
    box.focus();
    fireEvent.keyDown(box, { key: "a" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("an opted-in list field adds the Bangla line on Enter", () => {
    const setItems = vi.fn();
    render(<><BanglaTyping /><ExpandableField label="Advice" items={[]} setItems={setItems} bangla /></>);
    act(() => setKbdLang("bn"));
    fireEvent.click(screen.getByText("+"));
    const input = screen.getByPlaceholderText(/Type advice/) as HTMLInputElement;
    input.focus();
    typeKeys(input, "beshi");
    // The space is not ours: the handler lets it through and the browser types
    // it. jsdom types nothing on keydown, so add it the way the browser would.
    expect(fireEvent.keyDown(input, { key: " " })).toBe(true);
    fireEvent.change(input, { target: { value: input.value + " " } });
    typeKeys(input, "pani");
    expect(input.value).toBe("বেশি পানি");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByText("Done"));
    expect(setItems).toHaveBeenCalledWith(["বেশি পানি"]);
  });

  it("a list field that did not opt in carries no Bangla marker", () => {
    render(<ExpandableField label="History" items={[]} setItems={vi.fn()} />);
    fireEvent.click(screen.getByText("+"));
    expect(screen.getByPlaceholderText(/Type history/).getAttribute("data-bangla")).toBeNull();
  });

  it("opens exactly the fields the physician named", () => {
    expect([...BANGLA_FIELDS]).toEqual(["Chief complaints", "Previous complaints", "Note", "Plan", "Advice"]);
  });
});
