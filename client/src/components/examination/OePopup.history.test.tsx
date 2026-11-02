// @vitest-environment jsdom
//
// ⚕️ Physician's sheet, 28/10/2026, item 7: Disease history and Surgical /
// intervention history MOVED from this popup to the prescription sidebar's
// History row (`PatientHistoryField`). The popup no longer edits them — but a
// visit parked before the move may still carry them in `oeData`, and nothing
// typed then may be lost: they are shown read-only and still written into the
// visit's On-examination lines on Save, as before.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import OePopup from "./OePopup";
import type { OeData } from "@/types";

const blankOe: OeData = {
  age: "", dob: "", heightCm: "", heightFt: "", heightIn: "", weightLb: "", weightKg: "",
  sbp: "", dbp: "", pulse: "", pulseNote: "", rr: "", spo2: "", anaemia: "", jaundice: "",
  ascites: "", auscHeart: "", auscLung: "", specialNote: "", diseaseHistory: "", surgicalHistory: "",
};

let oeData: OeData = blankOe;
const setShowOePopup = vi.fn();
const setOnExamination = vi.fn();
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    showOePopup: true, setShowOePopup, oeData, currentPatientId: "A",
    setOeData: (u: OeData | ((p: OeData) => OeData)) => { oeData = typeof u === "function" ? u(oeData) : u; },
    setOnExamination, setPtWeight: vi.fn(),
  }),
}));

afterEach(() => { cleanup(); setOnExamination.mockReset(); setShowOePopup.mockClear(); oeData = blankOe; });

const view = (oe: Partial<OeData> = {}) => {
  oeData = { ...blankOe, ...oe };
  return render(<OePopup />);
};

describe("On examination — Disease / Surgical history moved to the sidebar", () => {
  it("has no history boxes any more: one fact, one place to write it", () => {
    view();
    expect(screen.queryByLabelText("Disease history")).toBeNull();
    expect(screen.queryByLabelText("Surgical / intervention history")).toBeNull();
    expect(screen.queryByRole("button", { name: /add disease history/i })).toBeNull();
    expect(screen.queryByTestId("oe-legacy-history")).toBeNull();
  });

  it("closes at once — there is nothing half-typed of its own to ask about", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setShowOePopup).toHaveBeenCalledWith(false);
  });

  it("a visit parked before the move keeps its history: shown read-only, and written on Save as before", () => {
    view({ pulse: "78", diseaseHistory: "DM 01/01/2010\nHTN", surgicalHistory: "H/O cholecystectomy 15/01/2024" });
    const legacy = screen.getByTestId("oe-legacy-history");
    expect(legacy.textContent).toContain("Disease Hx: DM 01/01/2010");
    expect(legacy.textContent).toContain("Disease Hx: HTN");
    expect(legacy.textContent).toContain("Surgical Hx: H/O cholecystectomy 15/01/2024");
    expect(legacy.querySelector("input, button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save examination" }));
    expect(setOnExamination).toHaveBeenCalledWith([
      "Pulse: 78 b/m",
      "Disease Hx: DM 01/01/2010",
      "Disease Hx: HTN",
      "Surgical Hx: H/O cholecystectomy 15/01/2024",
    ]);
  });
});
