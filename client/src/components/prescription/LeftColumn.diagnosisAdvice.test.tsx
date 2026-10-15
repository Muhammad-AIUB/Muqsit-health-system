// @vitest-environment jsdom
//
// ⚕️ The OPD sidebar gives ••• to FINAL DIAGNOSIS and to nothing else
// (physician's sheet, 15/10/2026, item 4), and the ••• opens the Special
// advice box for the diagnosis it stands beside.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { diagnosisKey } from "@/lib/rxDrugAdvice";

const store = vi.hoisted(() => ({
  leftFields: [] as { label: string; items: string[]; set: () => void }[],
  allFieldValues: "",
  setShowInvPopup: () => {},
  setShowOePopup: () => {},
  invImages: {},
  canEditLabel: () => true,
  can: () => true,
  hiddenInvestigation: [],
  setHiddenInvestigation: () => {},
  hideDrugHistory: false,
  setHideDrugHistory: () => {},
  savedDrugAdvice: [] as unknown[],
  rxAdviceOff: [] as string[],
  setRxAdviceOff: () => {},
  currentPatientId: "A",
}));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => store }));
vi.mock("@/hooks/useActivity", () => ({ useActivityLog: () => vi.fn() }));
vi.mock("@/hooks/usePreviousDiagnoses", () => ({ usePreviousDiagnoses: () => [] }));
vi.mock("@/hooks/useFieldRecents", () => ({ useFieldRecents: () => ({ getRecents: () => [], addRecents: vi.fn() }) }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }) }));
vi.mock("@/hooks/useDrugAdvice", () => ({ useSaveDrugAdvice: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/components/prescription/PersonalNote", () => ({ PersonalNoteSection: () => null }));

import LeftColumn from "./LeftColumn";

afterEach(() => { cleanup(); store.savedDrugAdvice = []; });

const fields = () => [
  { label: "Chief complaints", items: ["Fever"], set: () => {} },
  { label: "Provisional diagnosis", items: ["Viral fever"], set: () => {} },
  { label: "Final diagnosis", items: ["Pregnant", "URTI"], set: () => {} },
];

describe("LeftColumn — ••• advice on Final diagnosis", () => {
  it("only the Final diagnosis lines carry •••", () => {
    store.leftFields = fields();
    render(<LeftColumn />);
    const all = screen.getAllByRole("button", { name: /^Special advice for / }).map((b) => b.getAttribute("aria-label"));
    expect(all).toEqual(["Special advice for Pregnant", "Special advice for URTI"]);
  });

  it("opens the Special advice box for that diagnosis", () => {
    store.leftFields = fields();
    render(<LeftColumn />);
    fireEvent.click(screen.getByRole("button", { name: "Special advice for URTI" }));
    const dialog = screen.getByRole("dialog", { name: "Special advice" });
    expect(dialog.textContent).toContain("URTI");
    expect(dialog.textContent).toContain("No advice for this diagnosis yet.");
  });

  it("is green where this doctor has saved advice for the diagnosis", () => {
    store.leftFields = fields();
    store.savedDrugAdvice = [{ id: "d1", scope: "diagnosis", key: diagnosisKey("pregnant"), label: "Pregnant", lines: ["Take folic acid daily"] }];
    render(<LeftColumn />);
    expect(screen.getByRole("button", { name: "Special advice for Pregnant" }).getAttribute("data-has-advice")).toBe("yes");
    expect(screen.getByRole("button", { name: "Special advice for URTI" }).getAttribute("data-has-advice")).toBeNull();
  });
});
