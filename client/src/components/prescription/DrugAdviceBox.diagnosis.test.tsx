// @vitest-environment jsdom
//
// ⚕️ The Special advice box, opened from a FINAL DIAGNOSIS (physician's sheet,
// 15/10/2026, item 4 — the picture shows the box with "Instruction: Pregnant").
// One scope: the advice belongs to that diagnosis as written. Saved once, it
// joins Advice whenever the diagnosis is written again; a tick outside Edit is
// this visit's, as for a medicine. Every word is the doctor's own.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DrugAdviceBox from "./DrugAdviceBox";
import { diagnosisKey, diagnosisOwner, offKey } from "@/lib/rxDrugAdvice";
import { itKeepsTheKeyboard } from "@/test/dialogKeyboard";

const store = vi.hoisted(() => ({
  savedDrugAdvice: [] as unknown[],
  rxAdviceOff: [] as string[],
  setRxAdviceOff: vi.fn(),
  can: () => true,
}));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => store }));
const save = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/hooks/useDrugAdvice", () => ({ useSaveDrugAdvice: () => ({ mutateAsync: save, isPending: false }) }));

afterEach(() => { cleanup(); save.mockClear(); store.setRxAdviceOff.mockClear(); store.savedDrugAdvice = []; });

const box = (onClose: () => void = vi.fn()) => <DrugAdviceBox diagnosis="Pregnant" onClose={onClose} />;

describe("DrugAdviceBox — for a final diagnosis", () => {
  itKeepsTheKeyboard({ label: "Special advice", render: box });

  it("names the diagnosis as its Instruction, offers no medicine/group choice, and says when there is no advice", () => {
    render(box());
    const dialog = screen.getByRole("dialog", { name: "Special advice" });
    expect(dialog.textContent).toContain("Pregnant");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByText("No advice for this diagnosis yet.")).toBeTruthy();
  });

  it("⚕️ saves what the doctor wrote, under the diagnosis", async () => {
    const onClose = vi.fn();
    render(box(onClose));
    fireEvent.click(screen.getByRole("button", { name: "+ Add Advice" }));
    fireEvent.change(screen.getByPlaceholderText("Write the advice…"), { target: { value: "Take folic acid daily" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    expect(save).toHaveBeenCalledWith({ scope: "diagnosis", label: "Pregnant", lines: ["Take folic acid daily"] });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the advice saved for it, and a tick outside Edit is this visit's, for this diagnosis", () => {
    store.savedDrugAdvice = [{ id: "d1", scope: "diagnosis", key: diagnosisKey("Pregnant"), label: "Pregnant", lines: ["Take folic acid daily"] }];
    render(box());
    expect(screen.getByText("Take folic acid daily")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    const update = store.setRxAdviceOff.mock.calls[0][0] as (p: string[]) => string[];
    expect(update([])).toEqual([offKey(diagnosisOwner("Pregnant"), "Take folic acid daily")]);
  });
});
