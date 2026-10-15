// @vitest-environment jsdom
//
// ⚕️ ••• beside each Final diagnosis (physician's sheet, 15/10/2026, item 4:
// "Final Diagnosis er prottektar pashe advice add kora jabe osudh er moto
// kore"). The same ••• the ℞ pad has beside a medicine, left of the line; it
// opens the Special advice box for that diagnosis, and turns green once advice
// is saved for it. Opt-in (`lineAdvice`): only Final diagnosis passes it.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ExpandableField from "./ExpandableField";
import { C } from "@/theme";

vi.mock("@/hooks/useFieldRecents", () => ({ useFieldRecents: () => ({ getRecents: () => [], addRecents: vi.fn() }) }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }) }));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({ canEditLabel: () => true, can: () => true, currentPatientId: "A" }) }));

afterEach(cleanup);

const dots = (text: string) => screen.getByRole("button", { name: `Special advice for ${text}` });

describe("ExpandableField — ••• advice beside each line", () => {
  it("puts ••• beside every line, and opens the box for the line pressed", () => {
    const open = vi.fn();
    render(<ExpandableField label="Final diagnosis" items={["Pregnant", "CHB", "URTI"]} setItems={vi.fn()} inlineEdit lineAdvice={{ has: () => false, open }} />);
    expect(screen.getAllByRole("button", { name: /^Special advice for / })).toHaveLength(3);
    fireEvent.click(dots("CHB"));
    expect(open).toHaveBeenCalledWith("CHB");
  });

  it("stands left of the line, as on the ℞ pad", () => {
    render(<ExpandableField label="Final diagnosis" items={["Pregnant"]} setItems={vi.fn()} lineAdvice={{ has: () => false, open: vi.fn() }} />);
    const row = dots("Pregnant").parentElement!;
    const texts = Array.from(row.children).map((c) => c.textContent);
    expect(texts.indexOf("•••")).toBeLessThan(texts.indexOf("Pregnant"));
  });

  it("turns green where advice is saved", () => {
    render(<ExpandableField label="Final diagnosis" items={["Pregnant", "CHB"]} setItems={vi.fn()} lineAdvice={{ has: (d) => d === "Pregnant", open: vi.fn() }} />);
    expect(dots("Pregnant").getAttribute("data-has-advice")).toBe("yes");
    expect(dots("Pregnant").style.color).toBe(C.ok[400]);
    expect(dots("CHB").getAttribute("data-has-advice")).toBeNull();
  });

  it("steps aside while the lines are being edited", () => {
    render(<ExpandableField label="Final diagnosis" items={["Pregnant"]} setItems={vi.fn()} inlineEdit lineAdvice={{ has: () => false, open: vi.fn() }} />);
    fireEvent.click(screen.getByText("✎ Edit"));
    expect(screen.queryAllByRole("button", { name: /^Special advice for / })).toHaveLength(0);
  });

  it("a field that did not opt in has none", () => {
    render(<ExpandableField label="Chief complaints" items={["Fever"]} setItems={vi.fn()} inlineEdit />);
    expect(screen.queryAllByRole("button", { name: /^Special advice for / })).toHaveLength(0);
  });
});
