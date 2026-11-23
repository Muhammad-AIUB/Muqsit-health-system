// @vitest-environment jsdom
//
// ⚕️ "Your usual" is shown and inserted exactly as learned, in BAN too: the ℞
// pad is always English (physician's decision, 2026-11-23, replacing the
// 2026-10-15 request that showed it in Bangla). BAN changes only the printout.

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
function Pad() {
  const [rows, setRows] = useState<Row[]>([blank()]);
  return <MedicinePad rows={rows} setRows={setRows} showCheck={false} showHabits />;
}
const openDropdown = () => {
  const input = screen.getByPlaceholderText("Start typing a medicine or note…");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "napa" } });
};
const dropdown = () => (document.body.textContent ?? "").replace(/\s+/g, " ");

describe("MedicinePad — 'Your usual' stays English in BAN", () => {
  it("is shown as learned, tapering lines too", () => {
    render(<Pad />);
    act(() => setKbdLang("bn"));
    openDropdown();
    expect(dropdown()).toContain("1+0+1 · Before meal · 7 days");
    expect(dropdown()).toContain("↳ 0+0+1 · Continue");
    expect(dropdown()).not.toContain("খাবারের");
  });

  it("what is shown is what a pick inserts", () => {
    render(<Pad />);
    act(() => setKbdLang("bn"));
    openDropdown();
    fireEvent.mouseDown(screen.getByText("1+0+1 · Before meal · 7 days"));
    const cells = (p: string) => (screen.getAllByPlaceholderText(p)[0] as HTMLTextAreaElement).value;
    expect([cells("dose"), cells("food"), cells("duration")]).toEqual(["1+0+1", "Before meal", "7 days"]);
  });
});
