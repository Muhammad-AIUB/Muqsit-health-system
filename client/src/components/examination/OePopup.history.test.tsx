// @vitest-environment jsdom
//
// ⚕️ Physician's sheet, 18/10/2026, item 3: Disease history and Surgical /
// intervention history take SEVERAL entries, each with a date — "H/O
// cholecystectomy", 151026 → "H/O cholecystectomy 15/01/2024"-style, Add puts it
// under the others, and each prints as its own On-examination line.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
const ask = vi.hoisted(() => ({ answer: true, asked: [] as string[] }));
vi.mock("@/lib/dialogs", () => ({
  confirmAction: (r: { title: string }) => { ask.asked.push(r.title); return Promise.resolve(ask.answer); },
}));

import OePopup from "./OePopup";
import type { OeData } from "@/types";

const blankOe: OeData = {
  age: "", dob: "", heightCm: "", heightFt: "", heightIn: "", weightLb: "", weightKg: "",
  sbp: "", dbp: "", pulse: "", pulseNote: "", rr: "", spo2: "", anaemia: "", jaundice: "",
  ascites: "", auscHeart: "", auscLung: "", specialNote: "", diseaseHistory: "", surgicalHistory: "",
};

// A store that really holds the value, so what Add writes is what the list shows.
let oeData: OeData = blankOe;
let showOePopup = true;
const setShowOePopup = vi.fn((v: boolean) => { showOePopup = v; });
let currentPatientId: string | null = "A";
const setOnExamination = vi.fn();
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    showOePopup, setShowOePopup, oeData, currentPatientId,
    setOeData: (u: OeData | ((p: OeData) => OeData)) => { oeData = typeof u === "function" ? u(oeData) : u; },
    setOnExamination, setPtWeight: vi.fn(),
  }),
}));

afterEach(() => { cleanup(); setOnExamination.mockReset(); setShowOePopup.mockClear(); oeData = blankOe; showOePopup = true; currentPatientId = "A"; ask.answer = true; ask.asked = []; });

const view = (oe: Partial<OeData> = {}) => {
  oeData = { ...blankOe, ...oe };
  const r = render(<OePopup />);
  return { ...r, again: () => r.rerender(<OePopup />) };
};
const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

describe("On examination — dated history entries", () => {
  it("Add writes the text and its DDMMYY date as dd/mm/yyyy, and lists it", () => {
    const { again } = view();
    fireEvent.change(box("Disease history"), { target: { value: "H/O cholecystectomy" } });
    fireEvent.change(box("Disease history date"), { target: { value: "150124" } });
    fireEvent.click(screen.getByRole("button", { name: "Add disease history" }));
    expect(oeData.diseaseHistory).toBe("H/O cholecystectomy 15/01/2024");
    again();
    expect(screen.getByText("H/O cholecystectomy 15/01/2024")).toBeTruthy();
    // The boxes are emptied for the next one.
    expect(box("Disease history").value).toBe("");
    expect(box("Disease history date").value).toBe("");
  });

  it("a second entry goes under the first", () => {
    const { again } = view({ surgicalHistory: "H/O cholecystectomy 15/10/2025" });
    fireEvent.change(box("Surgical / intervention history"), { target: { value: "H/O ERCP" } });
    fireEvent.change(box("Surgical / intervention history date"), { target: { value: "16/01/2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Add surgical / intervention history" }));
    expect(oeData.surgicalHistory).toBe("H/O cholecystectomy 15/10/2025\nH/O ERCP 16/01/2026");
    again();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent?.replace(/[•×]/g, "").trim());
    expect(items).toEqual(["H/O cholecystectomy 15/10/2025", "H/O ERCP 16/01/2026"]);
  });

  it("Enter in the text box adds too", () => {
    view();
    fireEvent.change(box("Disease history"), { target: { value: "Known HTN" } });
    fireEvent.keyDown(box("Disease history"), { key: "Enter" });
    expect(oeData.diseaseHistory).toBe("Known HTN");
  });

  it("a date it cannot read writes nothing and says why", () => {
    view();
    fireEvent.change(box("Disease history"), { target: { value: "H/O ERCP" } });
    fireEvent.change(box("Disease history date"), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Add disease history" }));
    expect(oeData.diseaseHistory).toBe("");
    expect(screen.getByText(/Not a valid date/)).toBeTruthy();
    expect(box("Disease history").value).toBe("H/O ERCP"); // kept, to correct the date
  });

  it("× takes off that one entry", () => {
    view({ diseaseHistory: "Known DM\nKnown HTN" });
    fireEvent.click(screen.getByRole("button", { name: "Remove “Known DM”" }));
    expect(oeData.diseaseHistory).toBe("Known HTN");
  });

  it("an old single value shows as one entry", () => {
    view({ diseaseHistory: "First known 2019" });
    expect(screen.getByText("First known 2019")).toBeTruthy();
  });

  it("Save writes one On-examination line per entry", () => {
    view({ diseaseHistory: "Known DM\nKnown HTN", surgicalHistory: "H/O ERCP 16/10/2026" });
    fireEvent.click(screen.getByText("Save examination"));
    expect(setOnExamination.mock.calls[0][0]).toEqual(["Disease Hx: Known DM", "Disease Hx: Known HTN", "Surgical Hx: H/O ERCP 16/10/2026"]);
  });

  // What is typed and not yet added is not lost on Save: it is added first,
  // exactly as Add would (a doctor reads the box as part of the form).
  it("Save adds what is typed and not yet added", () => {
    view({ diseaseHistory: "Known DM" });
    fireEvent.change(box("Disease history"), { target: { value: "Known HTN" } });
    fireEvent.click(screen.getByText("Save examination"));
    expect(setOnExamination.mock.calls[0][0]).toEqual(["Disease Hx: Known DM", "Disease Hx: Known HTN"]);
  });

  it("Save with a typed entry whose date cannot be read saves nothing and says why", () => {
    view();
    fireEvent.change(box("Disease history"), { target: { value: "H/O ERCP" } });
    fireEvent.change(box("Disease history date"), { target: { value: "99" } });
    fireEvent.click(screen.getByText("Save examination"));
    expect(setOnExamination).not.toHaveBeenCalled();
    expect(screen.getByText(/Not a valid date/)).toBeTruthy();
  });

  // ⚕️ Independent review, 18/10/2026: the popup stays mounted for the whole
  // session, so what was typed and not added must not wait in it for the next
  // patient — Save would have added patient A's history to patient B.
  it("what is typed and not added is gone once the popup closes", () => {
    const { again } = view();
    fireEvent.change(box("Disease history"), { target: { value: "CKD stage 3" } });
    showOePopup = false; again();
    showOePopup = true; again();
    expect(box("Disease history").value).toBe("");
  });

  it("…and once another patient is loaded under it", () => {
    const { again } = view();
    fireEvent.change(box("Surgical / intervention history"), { target: { value: "H/O ERCP" } });
    currentPatientId = "B"; again();
    fireEvent.click(screen.getByText("Save examination"));
    expect(setOnExamination.mock.calls[0][0]).toEqual([]);
  });

  // ⚕️ Second review, 18/10/2026: closing the popup dropped what was typed and
  // not added, without a word. It asks — keep it (added as typed) or let it go.
  it("closing with history typed and not added asks; the answer Add keeps it", async () => {
    view();
    fireEvent.change(box("Disease history"), { target: { value: "CKD stage 3" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Close" })); });
    expect(ask.asked).toHaveLength(1);
    expect(oeData.diseaseHistory).toBe("CKD stage 3");
    expect(setShowOePopup).toHaveBeenCalledWith(false);
  });

  it("…and the answer Discard lets it go", async () => {
    ask.answer = false;
    view();
    fireEvent.change(box("Disease history"), { target: { value: "CKD stage 3" } });
    await act(async () => { fireEvent.click(screen.getByText("Cancel")); });
    expect(oeData.diseaseHistory).toBe("");
    expect(setShowOePopup).toHaveBeenCalledWith(false);
  });

  it("closing with nothing typed asks nothing", async () => {
    view();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Close" })); });
    expect(ask.asked).toEqual([]);
    expect(setShowOePopup).toHaveBeenCalledWith(false);
  });

  // The physician's 15/10/2026 decision about accidental deletes: a line taken
  // off in one press can be put back.
  it("× on an entry offers Undo, which puts it back where it was", () => {
    const { again } = view({ diseaseHistory: "Known DM\nKnown HTN\nCKD" });
    fireEvent.click(screen.getByRole("button", { name: "Remove “Known HTN”" }));
    expect(oeData.diseaseHistory).toBe("Known DM\nCKD");
    again();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(oeData.diseaseHistory).toBe("Known DM\nKnown HTN\nCKD");
  });
});

