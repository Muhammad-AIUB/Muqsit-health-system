// @vitest-environment jsdom
//
// ⚕️ The ℞ pad is ALWAYS English (physician's decision, 2026-11-23, replacing
// the 2026-10-14 one that wrote Bangla into it): BAN changes only the printout
// (PrescriptionView, pinned in PrescriptionView.print.test.tsx; the wording in
// lib/rxLanguage.test.ts). This pins that BAN never reaches a pad cell.

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import MedicinePad, { type Row } from "./MedicinePad";
import { setKbdLang } from "@/lib/kbdLang";

vi.mock("@/hooks/useMedicineSearch", () => ({ useMedicineSearch: () => ({ results: [] }) }));
vi.mock("@/hooks/useRxHabits", () => ({ useRxHabits: () => ({ groups: [], refresh: vi.fn() }) }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ rxHabitsApi: { setFlags: vi.fn() } }));

afterEach(() => { cleanup(); act(() => setKbdLang("en")); });

const napa = (): Row => ({ drug: "Tablet. Napa 500 mg", dose: "", food: "", duration: "", checked: true, isMedicine: true, continuation: false });
const blank = (): Row => ({ drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false });

function Pad() {
  const [rows, setRows] = useState<Row[]>([napa(), blank()]);
  return <MedicinePad rows={rows} setRows={setRows} showCheck={false} />;
}

const cell = (placeholder: string) => screen.getAllByPlaceholderText(placeholder)[0] as HTMLTextAreaElement;
const write = (placeholder: string, value: string) => {
  const el = cell(placeholder);
  fireEvent.focus(el);
  fireEvent.change(el, { target: { value } });
  return el;
};

describe("MedicinePad — BAN never writes Bangla into the pad", () => {
  it("a committed dose / food / duration stays English, by blur and by Enter", () => {
    render(<Pad />);
    act(() => setKbdLang("bn"));
    fireEvent.blur(write("dose", "1+0+1"));
    expect(cell("dose").value).toBe("1+0+1");
    fireEvent.keyDown(write("food", "Before meal"), { key: "Enter" });
    expect(cell("food").value).toBe("Before meal");
    fireEvent.blur(write("duration", "7d"));
    expect(cell("duration").value).toBe("7 days"); // the shorthand still expands, in English
  });

  it("the cells carry no Bangla-typing mark, so the BAN keyboard leaves them alone", () => {
    render(<Pad />);
    act(() => setKbdLang("bn"));
    for (const p of ["dose", "food", "duration"]) expect(cell(p).getAttribute("data-bangla")).toBeNull();
  });
});
