// @vitest-environment jsdom
//
// ⚕️ Physician's sheet, 31/10/2026: "Osudh ba disease a advice a amr onno
// disease ba osudh er lekha advice add kora edit korte parbo". In the ••• box
// the doctor can take a line he saved for ANOTHER medicine or diagnosis into
// this one, and correct any line in place. The other entry is never written.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const store = vi.hoisted(() => ({
  savedDrugAdvice: [
    { id: "1", scope: "medicine", key: "napa", label: "Tablet. Napa 500 mg", lines: ["After food"] },
    { id: "2", scope: "medicine", key: "seclo", label: "Capsule. Seclo 20 mg", lines: ["Take before meal", "after FOOD"] },
    { id: "3", scope: "diagnosis", key: "dengue", label: "Dengue", lines: ["Drink ORS"] },
  ] as unknown[],
  rxAdviceOff: [] as string[],
  setRxAdviceOff: () => {},
  can: (() => true) as () => boolean,
}));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => store }));
const save = vi.hoisted(() => ({ mutateAsync: vi.fn(async () => undefined) }));
vi.mock("@/hooks/useDrugAdvice", () => ({ useSaveDrugAdvice: () => ({ mutateAsync: save.mutateAsync, isPending: false }) }));
vi.mock("@/lib/rxDrugAdvice", async (orig) => {
  const actual = await orig<typeof import("@/lib/rxDrugAdvice")>();
  // Napa's own entry is the one this box shows; the rest are "other".
  return { ...actual, savedAdviceFor: () => ({ medicine: (store.savedDrugAdvice as never[])[0], generic: null }) };
});

import DrugAdviceBox from "./DrugAdviceBox";

afterEach(() => { cleanup(); save.mutateAsync.mockClear(); store.can = () => true; });

const open = () => render(<DrugAdviceBox drug="Tablet. Napa 500 mg" generic="Paracetamol" onClose={vi.fn()} />);

describe("DrugAdviceBox — advice written for other medicines and diagnoses", () => {
  it("offers each other line once, and not the lines this box already holds", () => {
    open();
    const chips = within(screen.getByTestId("other-advice")).getAllByRole("button").map((b) => b.textContent);
    expect(chips).toEqual(["Take before meal", "Drink ORS"]); // "after FOOD" reads as Napa's own "After food"
  });

  it("a press copies the line into THIS box, in Edit, and Save stores only this box", async () => {
    open();
    fireEvent.click(within(screen.getByTestId("other-advice")).getByText("Drink ORS"));
    expect(screen.getByDisplayValue("Drink ORS")).toBeTruthy();
    // Taken once, it is no longer offered.
    expect(within(screen.getByTestId("other-advice")).queryByText("Drink ORS")).toBeNull();
    fireEvent.change(screen.getByDisplayValue("Drink ORS"), { target: { value: "Drink ORS after each loose stool" } });
    await fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(save.mutateAsync).toHaveBeenCalledTimes(1));
    expect(save.mutateAsync).toHaveBeenCalledWith({ scope: "medicine", label: "Tablet. Napa 500 mg", lines: ["After food", "Drink ORS after each loose stool"] });
  });

  it("pressing a line's words opens it for editing in place", () => {
    open();
    expect(screen.queryByDisplayValue("After food")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "After food" }));
    expect(screen.getByDisplayValue("After food")).toBeTruthy();
  });

  it("an assistant without the advice key is offered nothing and edits nothing", () => {
    store.can = () => false;
    open();
    expect(screen.queryByTestId("other-advice")).toBeNull();
    expect(screen.queryByRole("button", { name: "After food" })).toBeNull();
    expect(screen.getByText("After food")).toBeTruthy();
  });
});
