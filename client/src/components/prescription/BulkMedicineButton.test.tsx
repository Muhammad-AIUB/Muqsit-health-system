// @vitest-environment jsdom
//
// The + beside the ℞ mark: what it opens, what it hands the pad, and — ⚕️ the
// rule that matters most here — that the box it opened is ONE patient's. Ticks
// made over one patient's pad must never be added to the next patient's
// prescription. The server is replaced; every medicine is made up.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const all = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  rxHabitsApi: { all, list: vi.fn(), setFlags: vi.fn() },
}));

import BulkMedicineButton from "./BulkMedicineButton";
import type { RxItem } from "@/types";

const NAPA = { id: "h1", drugLabel: "Tablet. Napa 500 mg", generic: "Paracetamol", dose: "1+1+1", food: "After meal", duration: "5 days", contLines: [], patientCount: 30 };
const SERGEL = { id: "h2", drugLabel: "Capsule. Sergel 20 mg", dose: "1+0+1", food: "Before meal", duration: "14 days", contLines: [], patientCount: 22 };

let qc: QueryClient;
beforeEach(() => {
  all.mockReset();
  all.mockResolvedValue({ medicines: [NAPA, SERGEL], truncated: false });
  qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
});
afterEach(cleanup);

interface Over { patientId?: string | null; allowed?: boolean; existing?: RxItem[]; workstationId?: string | null }
const mount = (over: Over = {}) => {
  const onAppend = vi.fn();
  const tree = (o: Over) => (
    <QueryClientProvider client={qc}>
      <BulkMedicineButton
        patientId={"patientId" in o ? o.patientId ?? null : "patient_a"}
        workstationId={o.workstationId ?? null}
        allowed={o.allowed ?? true}
        existing={o.existing ?? []}
        onAppend={onAppend}
      />
    </QueryClientProvider>
  );
  const view = render(tree(over));
  return { onAppend, rerender: (o: Over) => view.rerender(tree({ ...over, ...o })) };
};
const plus = () => screen.getByRole("button", { name: "Add Bulk Medicine" }) as HTMLButtonElement;
const box = () => screen.getByRole("dialog", { name: "Add Bulk Medicine" });
const noBox = () => expect(screen.queryByRole("dialog")).toBeNull();
const said = () => screen.getByRole("status", { name: "Add Bulk Medicine result" }).textContent;
const openBox = async () => {
  fireEvent.click(plus());
  await waitFor(() => expect(within(box()).getAllByRole("checkbox").length).toBeGreaterThan(0));
};
const tick = (name: string) => fireEvent.click(within(box()).getByRole("checkbox", { name: new RegExp(name) }));
const add = () => fireEvent.click(within(box()).getByRole("button", { name: /^Add \(/ }));

describe("BulkMedicineButton — the + beside the ℞ mark", () => {
  it("is a + that says what it is, to a pointer and to a screen reader", () => {
    mount();
    expect(plus().textContent).toBe("+");
    expect(plus().title).toBe("Add Bulk Medicine");
    expect(plus().disabled).toBe(false);
  });

  it("asks the server for nothing until it is pressed", async () => {
    mount();
    await new Promise((r) => setTimeout(r, 20));
    expect(all).not.toHaveBeenCalled();
    noBox();
    await openBox();
    expect(all).toHaveBeenCalledTimes(1);
  });

  it("⚕️ hands the pad the ticked medicines, and says what was added", async () => {
    const { onAppend } = mount();
    await openBox();
    tick("Napa");
    tick("Sergel");
    add();
    expect(onAppend).toHaveBeenCalledTimes(1);
    expect((onAppend.mock.calls[0][0] as RxItem[]).map((it) => [it.drug, it.dose, it.instruction, it.duration, it.generic])).toEqual([
      ["Tablet. Napa 500 mg", "1+1+1", "After meal", "5 days", "Paracetamol"],
      ["Capsule. Sergel 20 mg", "1+0+1", "Before meal", "14 days", undefined],
    ]);
    noBox();
    expect(said()).toBe("2 added");
  });

  it("a line already on the pad is not handed over again, and the result says so", async () => {
    const { onAppend } = mount({ existing: [{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "After meal" }] });
    await openBox();
    tick("Napa");
    tick("Sergel");
    add();
    expect((onAppend.mock.calls[0][0] as RxItem[]).map((it) => it.drug)).toEqual(["Capsule. Sergel 20 mg"]);
    expect(said()).toBe("1 added · 1 already on ℞");
  });

  it("the result is about the last press: pressing + again takes it away", async () => {
    mount();
    await openBox();
    tick("Napa");
    add();
    expect(said()).toBe("1 added");
    fireEvent.click(plus());
    expect(said()).toBe("");
  });

  it("closing the box without adding hands the pad nothing and says nothing", async () => {
    const { onAppend } = mount();
    await openBox();
    tick("Napa");
    fireEvent.click(within(box()).getByRole("button", { name: "Cancel" }));
    noBox();
    expect(onAppend).not.toHaveBeenCalled();
    expect(said()).toBe("");
  });

  it("⚕️ the box is ONE patient's: when the editor moves to another patient it closes, ticks and all", async () => {
    // Another device picked the next patient (device mirroring), or the patient
    // chosen from the queue finished loading: the pad under the box is now
    // somebody else's.
    const { onAppend, rerender } = mount({ patientId: "patient_a" });
    await openBox();
    tick("Napa");
    rerender({ patientId: "patient_b" });
    noBox();
    expect(onAppend).not.toHaveBeenCalled();

    // Opened again, for the patient now in the editor, it starts clean.
    await openBox();
    expect(within(box()).getAllByRole("checkbox").every((c) => !(c as HTMLInputElement).checked)).toBe(true);
    expect(within(box()).getByRole("button", { name: "Add" }).hasAttribute("disabled")).toBe(true);
  });

  it("⚕️ it does not come back open when the editor returns to the first patient", async () => {
    const { rerender } = mount({ patientId: "patient_a" });
    await openBox();
    rerender({ patientId: "patient_b" });
    noBox();
    rerender({ patientId: "patient_a" });
    noBox();
  });

  it("⚕️ what was said about one patient's pad is not shown over the next patient's", async () => {
    const { rerender } = mount({ patientId: "patient_a" });
    await openBox();
    tick("Napa");
    add();
    expect(said()).toBe("1 added");
    rerender({ patientId: "patient_b" });
    expect(said()).toBe("");
    rerender({ patientId: "patient_a" });
    expect(said()).toBe("");
  });

  it("the box closes when the editor is cleared (no patient)", async () => {
    const { rerender } = mount({ patientId: "patient_a" });
    await openBox();
    rerender({ patientId: null });
    noBox();
  });

  it("an assistant without the pad's own key sees the + greyed, with the reason, and it opens nothing", async () => {
    mount({ allowed: false });
    expect(plus().disabled).toBe(true);
    expect(plus().title).toBe("View only — you don't have access to edit medicines");
    fireEvent.click(plus());
    noBox();
    expect(all).not.toHaveBeenCalled();
  });

  it("⚕️ a box that is open closes if the permission is taken away under it", async () => {
    const { onAppend, rerender } = mount({ allowed: true });
    await openBox();
    tick("Napa");
    rerender({ allowed: false });
    noBox();
    expect(onAppend).not.toHaveBeenCalled();
    // …and it does not come back by itself when the permission does.
    rerender({ allowed: true });
    noBox();
  });
});
