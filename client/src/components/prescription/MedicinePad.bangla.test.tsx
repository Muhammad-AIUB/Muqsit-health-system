// @vitest-environment jsdom
//
// ⚕️ BAN writes the OPD ℞ pad's dose / food / duration in Bangla (physician's
// decision, 2026-10-14). A cell is written when it is COMMITTED — blur or Enter,
// the moment the shorthand is expanded — never while it is being typed. The
// wording itself is pinned in lib/rxLanguage.test.ts; this pins where it runs.

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

function Pad({ bangla }: { bangla?: boolean }) {
  const [rows, setRows] = useState<Row[]>([napa(), blank()]);
  return <MedicinePad rows={rows} setRows={setRows} showCheck={false} bangla={bangla} />;
}

const cell = (placeholder: string) => screen.getAllByPlaceholderText(placeholder)[0] as HTMLTextAreaElement;
const write = (placeholder: string, value: string) => {
  const el = cell(placeholder);
  fireEvent.focus(el);
  fireEvent.change(el, { target: { value } });
  return el;
};

describe("MedicinePad — BAN writes a committed cell in Bangla", () => {
  it("on blur: a dose in Bangla digits", () => {
    render(<Pad bangla />);
    act(() => setKbdLang("bn"));
    const el = write("dose", "1+0+1");
    expect(el.value).toBe("1+0+1"); // while typing, as keyed
    fireEvent.blur(el);
    expect(cell("dose").value).toBe("১+০+১");
  });

  it("on Enter: the food the physician's table names", () => {
    render(<Pad bangla />);
    act(() => setKbdLang("bn"));
    const el = write("food", "Before meal");
    fireEvent.keyDown(el, { key: "Enter" });
    expect(cell("food").value).toBe("খাবারের আগে");
  });

  it("expands the shorthand first, then writes it in Bangla", () => {
    render(<Pad bangla />);
    act(() => setKbdLang("bn"));
    fireEvent.blur(write("duration", "7d"));
    expect(cell("duration").value).toBe("৭ দিন");
    fireEvent.blur(write("dose", "101"));
    expect(cell("dose").value).toBe("১+০+১");
  });

  it("leaves text the table does not cover as typed", () => {
    render(<Pad bangla />);
    act(() => setKbdLang("bn"));
    fireEvent.blur(write("dose", "2.5 ml"));
    expect(cell("dose").value).toBe("2.5 ml");
  });

  it("in EN mode, commits exactly as before", () => {
    render(<Pad bangla />);
    fireEvent.blur(write("dose", "1+0+1"));
    expect(cell("dose").value).toBe("1+0+1");
    fireEvent.blur(write("duration", "7d"));
    expect(cell("duration").value).toBe("7 days");
  });

  it("a pad that did not opt in (the IPD sheet) is never converted", () => {
    render(<Pad />);
    act(() => setKbdLang("bn"));
    fireEvent.blur(write("dose", "1+0+1"));
    expect(cell("dose").value).toBe("1+0+1");
  });
});

// ⚕️ Review of dfdd1c4: in BAN, passing through a cell of a printed visit
// (blur, Enter) rewrote it in Bangla — the visit no longer what was printed.
describe("MedicinePad — a printed visit's cells are kept as written (keepCells)", () => {
  function Printed({ keepCells }: { keepCells: boolean }) {
    const [rows, setRows] = useState<Row[]>([{ ...napa(), dose: "1+0+1", food: "After meal", duration: "7 days" }, blank()]);
    return <MedicinePad rows={rows} setRows={setRows} showCheck={false} bangla keepCells={keepCells} />;
  }
  const passThrough = (placeholder: string) => { const el = cell(placeholder); fireEvent.focus(el); fireEvent.blur(el); };

  it("a cell only passed through in BAN stays as written", () => {
    render(<Printed keepCells />);
    act(() => setKbdLang("bn"));
    passThrough("dose");
    passThrough("food");
    fireEvent.keyDown(cell("duration"), { key: "Enter" });
    expect(cell("dose").value).toBe("1+0+1");
    expect(cell("food").value).toBe("After meal");
    expect(cell("duration").value).toBe("7 days");
  });

  it("…where without it the same pass writes them in Bangla", () => {
    render(<Printed keepCells={false} />);
    act(() => setKbdLang("bn"));
    passThrough("dose");
    expect(cell("dose").value).toBe("১+০+১");
  });
});
