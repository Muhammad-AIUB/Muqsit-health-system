// @vitest-environment jsdom
//
// ⚕️ "Your usual" SHOWS a learned line in the pad's language — Bangla in BAN,
// English in EN (physician's request, 2026-10-15) — exactly as a pick would
// insert it. Before this, a line learned in English read `1+0+1 · Before meal ·
// 7 days` in the dropdown with BAN on, and landed on the pad in Bangla.
// Display only: the stored habit is untouched.

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import MedicinePad, { type Row } from "./MedicinePad";
import { setKbdLang } from "@/lib/kbdLang";

const groups = vi.hoisted(() => [
  {
    drugKey: "tablet. napa 500mg",
    drugLabel: "Tablet. Napa 500 mg",
    generic: "Paracetamol",
    hidden: [],
    hiddenCount: 0,
    items: [
      {
        id: "h1",
        drugLabel: "Tablet. Napa 500 mg",
        dose: "1+0+1",
        food: "Before meal",
        duration: "7 days",
        contLines: [{ dose: "0+0+1", food: "", duration: "Continue" }],
        patientCount: 2,
        lastUsedAt: "2026-10-14T00:00:00Z",
        pinned: false,
      },
    ],
  },
]);
vi.mock("@/hooks/useMedicineSearch", () => ({ useMedicineSearch: () => ({ results: [] }) }));
vi.mock("@/hooks/useRxHabits", () => ({ useRxHabits: () => ({ groups, refresh: vi.fn() }) }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ rxHabitsApi: { setFlags: vi.fn() } }));

afterEach(() => { cleanup(); act(() => setKbdLang("en")); });

const blank = (): Row => ({ drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false });
function Pad({ bangla }: { bangla?: boolean }) {
  const [rows, setRows] = useState<Row[]>([blank()]);
  return <MedicinePad rows={rows} setRows={setRows} showCheck={false} showHabits bangla={bangla} />;
}
const openDropdown = () => {
  const input = screen.getByPlaceholderText("Start typing a medicine or note…");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "napa" } });
};
const dropdown = () => (document.body.textContent ?? "").replace(/\s+/g, " ");

describe("MedicinePad — 'Your usual' in the pad's language", () => {
  it("BAN shows a line learned in English in Bangla, tapering lines too", () => {
    render(<Pad bangla />);
    act(() => setKbdLang("bn"));
    openDropdown();
    expect(dropdown()).toContain("১+০+১ · খাবারের আগে · ৭ দিন");
    expect(dropdown()).toContain("↳ ০+০+১ · চলবে");
    expect(dropdown()).not.toContain("Before meal");
    expect(dropdown()).toContain("Tablet. Napa 500 mg"); // the name is never touched
  });

  it("EN shows it in English", () => {
    render(<Pad bangla />);
    openDropdown();
    expect(dropdown()).toContain("1+0+1 · Before meal · 7 days");
  });

  it("what is shown is what a pick inserts", () => {
    render(<Pad bangla />);
    act(() => setKbdLang("bn"));
    openDropdown();
    fireEvent.mouseDown(screen.getByText("১+০+১ · খাবারের আগে · ৭ দিন"));
    const cells = (p: string) => (screen.getAllByPlaceholderText(p)[0] as HTMLTextAreaElement).value;
    expect([cells("dose"), cells("food"), cells("duration")]).toEqual(["১+০+১", "খাবারের আগে", "৭ দিন"]);
  });

  it("a pad that did not opt in shows the line as stored", () => {
    render(<Pad />);
    act(() => setKbdLang("bn"));
    openDropdown();
    expect(dropdown()).toContain("1+0+1 · Before meal · 7 days");
  });
});
