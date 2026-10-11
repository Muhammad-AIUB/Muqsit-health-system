// @vitest-environment jsdom
//
// The ℞ pad's ••• box. What reaches the Advice section is pinned in
// lib/rxDrugAdvice.test.ts and the dots in MedicinePad.advice.test.tsx; this
// pins the box as a popup: the keyboard stays in it, and Escape goes through
// the same "unsaved advice?" question as its × does.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DrugAdviceBox from "./DrugAdviceBox";
import { itKeepsTheKeyboard } from "@/test/dialogKeyboard";

// ONE store object, as the real context hands out: the box re-reads its saved
// lines whenever `savedDrugAdvice` or `rxAdviceOff` changes identity, so a mock
// that built fresh arrays on every call would re-render it for ever.
const store = vi.hoisted(() => ({
  savedDrugAdvice: [] as never[],
  rxAdviceOff: [] as string[],
  setRxAdviceOff: () => {},
  can: () => true,
}));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => store }));
vi.mock("@/hooks/useDrugAdvice", () => ({
  useSaveDrugAdvice: () => ({ mutateAsync: async () => undefined, isPending: false }),
}));

afterEach(cleanup);

const box = (onClose: () => void) => <DrugAdviceBox drug="Tablet. Napa 500 mg" generic="Paracetamol" onClose={onClose} />;

describe("DrugAdviceBox — the keyboard stays in the box", () => {
  itKeepsTheKeyboard({ label: "Special advice", render: box });
});

describe("DrugAdviceBox — Escape asks before it throws typed advice away", () => {
  const typeALine = () => {
    fireEvent.click(screen.getByRole("button", { name: "+ Add Advice" }));
    const inputs = screen.getByRole("dialog", { name: "Special advice" }).querySelectorAll<HTMLInputElement>("input[type=text]");
    fireEvent.change(inputs[inputs.length - 1], { target: { value: "Take with a full glass of water" } });
  };

  it("⚕️ the first Escape keeps the box open and says there are unsaved changes", () => {
    const onClose = vi.fn();
    render(box(onClose));
    typeALine();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Unsaved/)).toBeTruthy();
    // The line is still there to be saved.
    expect(screen.getByDisplayValue("Take with a full glass of water")).toBeTruthy();
  });

  it("a second Escape is the doctor's answer: discard", () => {
    const onClose = vi.fn();
    render(box(onClose));
    typeALine();
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
