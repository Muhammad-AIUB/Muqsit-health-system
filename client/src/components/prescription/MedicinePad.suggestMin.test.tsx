// @vitest-environment jsdom
//
// "Your usual" lines and "Your usual notes" wait for 3 letters (physician's
// request, 2026-09-25) so they stop popping up on the first keystroke. The
// medicine list itself is deliberately NOT gated here — it keeps its own
// 2-letter start. The rule is pinned in lib/rxSuggest.test.ts; this pins what
// the pad actually asks the two hooks for.

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MedicinePad, { type Row } from "./MedicinePad";

const calls = vi.hoisted(() => ({ habits: [] as string[], phrases: [] as boolean[], medicine: [] as string[] }));
vi.mock("@/hooks/useMedicineSearch", () => ({ useMedicineSearch: (q: string) => { calls.medicine.push(q); return { results: [] }; } }));
vi.mock("@/hooks/useRxHabits", () => ({ useRxHabits: (q: string) => { calls.habits.push(q); return { groups: [], refresh: vi.fn() }; } }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: (_s: string, _q: string, enabled: boolean) => { calls.phrases.push(enabled); return { phrases: [], refresh: vi.fn() }; } }));
vi.mock("@/lib/api", () => ({ rxHabitsApi: { setFlags: vi.fn() } }));

afterEach(() => { cleanup(); calls.habits = []; calls.phrases = []; calls.medicine = []; });

const blank = (): Row => ({ drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false });
function Pad() {
  const [rows, setRows] = useState<Row[]>([blank()]);
  return <MedicinePad rows={rows} setRows={setRows} showCheck={false} showHabits />;
}
const type = (text: string) => {
  const input = screen.getByPlaceholderText("Start typing a medicine or note…");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
};

describe("MedicinePad — learned suggestions wait for 3 letters", () => {
  it("asks for nothing at 2 letters", () => {
    render(<Pad />);
    type("na");
    expect(calls.habits.at(-1)).toBe("");
    expect(calls.phrases.at(-1)).toBe(false);
  });

  it("asks at 3 letters", () => {
    render(<Pad />);
    type("nap");
    expect(calls.habits.at(-1)).toBe("nap");
    expect(calls.phrases.at(-1)).toBe(true);
  });

  it("does not count spaces as letters", () => {
    render(<Pad />);
    type("  n a ");
    expect(calls.habits.at(-1)).toBe("");
  });

  it("leaves the medicine list's own start alone", () => {
    render(<Pad />);
    type("na");
    expect(calls.medicine.at(-1)).toBe("na");
  });
});
