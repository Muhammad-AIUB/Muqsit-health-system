// @vitest-environment jsdom
//
// The O/E line prints on the prescription, so BP is written exactly as typed:
// a blank diastolic must never become an invented "/0".

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
const setOnExamination = vi.fn();
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    showOePopup: true, setShowOePopup: vi.fn(), oeData, setOeData: vi.fn(),
    setOnExamination, setPtWeight: vi.fn(),
  }),
}));

afterEach(() => { cleanup(); setOnExamination.mockReset(); oeData = blankOe; });

const saved = (oe: Partial<OeData>): string[] => {
  oeData = { ...blankOe, ...oe };
  render(<OePopup />);
  fireEvent.click(screen.getByText("Save examination"));
  return setOnExamination.mock.calls[0][0];
};

describe("OePopup — BP line", () => {
  it("⚕️ systolic only: no invented diastolic 0", () => {
    const lines = saved({ sbp: "120" });
    expect(lines).toContain("BP: 120 mmHg");
    expect(lines.join("|")).not.toContain("/0");
  });

  it("both typed: systolic/diastolic as typed", () => {
    expect(saved({ sbp: "120", dbp: "80" })).toContain("BP: 120/80 mmHg");
  });

  it("keeps the value exactly as typed", () => {
    expect(saved({ sbp: "120.0", dbp: "80" })).toContain("BP: 120.0/80 mmHg");
  });

  it("no systolic: no BP line", () => {
    expect(saved({ dbp: "80" }).some((l) => l.startsWith("BP:"))).toBe(false);
  });
});
