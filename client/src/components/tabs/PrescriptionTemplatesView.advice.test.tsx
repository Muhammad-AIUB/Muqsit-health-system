// @vitest-environment jsdom
//
// OPD templates carry Advice and Advised tests (physician, 24/11/2026), written
// with the same fields as the main prescription so the same suggestions show.
// IPD and custom templates stay medicines-only.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  templates: [] as unknown[],
  save: vi.fn(),
}));
vi.mock("@/hooks/useTemplates", () => ({
  useTemplates: () => ({ data: state.templates }),
  useDeleteTemplate: () => ({ mutate: vi.fn() }),
  useSaveTemplate: () => ({ mutate: state.save, isPending: false }),
}));
vi.mock("@/components/prescription/MedicinePad", () => ({ default: () => <div data-testid="pad" /> }));
vi.mock("@/lib/rxRows", () => ({
  rowsFromRxItems: () => [],
  rxItemsFromRows: () => [{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "" }],
  unwritableRows: () => [],
}));
// A stand-in that shows the field's label, its lines, and a way to add one.
vi.mock("@/components/common/ExpandableField", () => ({
  default: (p: { label: string; items: string[]; setItems: (v: string[]) => void; learnedSource?: string }) => (
    <div data-testid={`field-${p.label}`} data-learned={p.learnedSource ?? ""}>
      <span>{p.items.join("|")}</span>
      <button onClick={() => p.setItems([...p.items, `new ${p.label}`])}>add to {p.label}</button>
    </div>
  ),
}));
vi.mock("@/components/investigation/InvestigationDirectory", () => ({ default: () => null }));
vi.mock("@/components/investigation/InvestigationGroups", () => ({ default: () => null }));

import PrescriptionTemplatesView from "./PrescriptionTemplatesView";

beforeEach(() => { state.templates = []; state.save.mockClear(); });
afterEach(cleanup);

const openBlank = (category: string) => {
  render(<PrescriptionTemplatesView onBack={() => {}} />);
  fireEvent.click(screen.getByText(category));
  fireEvent.click(screen.getByText("Blank"));
};

describe("template editor — Advice and Advised tests", () => {
  it("an OPD template has both fields, Advice with the doctor's learned suggestions like the main prescription", () => {
    openBlank("OPD templates");
    expect(screen.getByTestId("field-Advice").getAttribute("data-learned")).toBe("advice");
    expect(screen.getByTestId("field-Advised tests / investigation")).toBeTruthy();
  });

  it("IPD and custom templates stay medicines-only", () => {
    openBlank("IPD templates");
    expect(screen.queryByTestId("field-Advice")).toBeNull();
    cleanup();
    openBlank("Customized templates");
    expect(screen.queryByTestId("field-Advised tests / investigation")).toBeNull();
  });

  it("Save sends the advice and the tests with the medicines", () => {
    openBlank("OPD templates");
    fireEvent.change(screen.getByLabelText("Name of the template"), { target: { value: "AVH" } });
    fireEvent.click(screen.getByText("add to Advice"));
    fireEvent.click(screen.getByText("add to Advised tests / investigation"));
    fireEvent.click(screen.getByText("Save"));
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(state.save.mock.calls[0][0]).toMatchObject({
      category: "opd", name: "AVH",
      advice: ["new Advice"], adviceTest: ["new Advised tests / investigation"],
    });
  });

  it("an existing template opens with its saved advice and tests", () => {
    state.templates = [{ id: "t1", category: "opd", name: "Old", items: [], advice: ["Rest"], adviceTest: ["CBC"], order: 0, createdAt: "", updatedAt: "" }];
    render(<PrescriptionTemplatesView onBack={() => {}} />);
    fireEvent.click(screen.getByText("OPD templates"));
    fireEvent.click(screen.getByTitle("0 medicine(s)"));
    expect(screen.getByTestId("field-Advice").textContent).toContain("Rest");
    expect(screen.getByTestId("field-Advised tests / investigation").textContent).toContain("CBC");
  });

  it("⚕️ an IPD template save never carries advice", () => {
    openBlank("IPD templates");
    fireEvent.change(screen.getByLabelText("Name of the template"), { target: { value: "Ward" } });
    fireEvent.click(screen.getByText("Save"));
    expect(state.save.mock.calls[0][0]).not.toHaveProperty("advice");
  });
});
