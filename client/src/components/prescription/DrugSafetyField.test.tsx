// @vitest-environment jsdom
//
// ⚕️ "H/O drug hypersensitivity and High-Alert Medication" (physician's sheet,
// 31/10/2026). Pinned: the physician's wording of a line, one entry at a time
// with "+" (a medicine and its two questions, or a written line), the generic
// from the catalogue and never guessed, ✕ only inside ✎ Edit, a soft removal
// with Undo, and a list that could not be loaded SAID — never an empty one.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DrugSafetyEntry, MedicineHit } from "@/lib/api";

const store = vi.hoisted(() => ({ currentPatientId: "P1" as string | null, activeWorkstationId: null as string | null }));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => store }));

const api = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), drugSafetyApi: api }));

const hits = vi.hoisted(() => ({ results: [] as MedicineHit[] }));
vi.mock("@/hooks/useMedicineSearch", () => ({
  useMedicineSearch: (q: string) => ({ results: q.trim().length >= 2 ? hits.results : [], isLoading: false }),
}));

const dialogs = vi.hoisted(() => ({ tell: vi.fn(async () => {}), confirmAction: vi.fn(async () => true) }));
vi.mock("@/lib/dialogs", () => dialogs);

import DrugSafetyField from "./DrugSafetyField";
import { ApiError } from "@/lib/api";

const entry = (over: Partial<DrugSafetyEntry>): DrugSafetyEntry => ({
  id: "e1", kind: "drug", brand: "Napa", generic: "Paracetamol", hypersensitive: true, highAlert: false,
  text: "", createdByName: "Dr. One", createdAt: "2026-10-31T00:00:00Z", updatedAt: "2026-10-31T00:00:00Z", editable: true,
  ...over,
});
const napaHit: MedicineHit = { id: "m1", brandName: "Napa", genericName: "Paracetamol", dosageForm: "Tablet", strength: "500 mg", company: null, priceRaw: null };

function mount(canEdit = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><DrugSafetyField canEdit={canEdit} /></QueryClientProvider>);
}
const lines = () => screen.queryAllByTestId("drug-safety-line").map((n) => n.textContent);
const addBtn = () => screen.getByRole("button", { name: "Add to H/O drug hypersensitivity and High-Alert Medication" });

beforeEach(() => {
  store.currentPatientId = "P1";
  hits.results = [napaHit];
  for (const f of Object.values(api)) f.mockReset();
  dialogs.tell.mockClear();
  dialogs.confirmAction.mockClear();
});
afterEach(cleanup);

describe("DrugSafetyField — reading", () => {
  it("writes each entry as the physician did, marked, one line per question ticked", async () => {
    api.list.mockResolvedValue([
      entry({ hypersensitive: true, highAlert: true }),
      entry({ id: "e2", kind: "text", brand: "", generic: null, hypersensitive: false, text: "Patient is hypersensitive to sulphar containing drug" }),
      entry({ id: "e3", brand: "Unlisted", generic: null, hypersensitive: false, highAlert: true }),
    ]);
    mount();
    await waitFor(() => expect(lines()).toHaveLength(4));
    expect(lines()).toEqual([
      "Hypersensitive to NAPA(Paracetamol)",
      "High-alert drug: NAPA(Paracetamol)",
      "Patient is hypersensitive to sulphar containing drug",
      "High-alert drug: UNLISTED",
    ]);
  });

  it("has no ⊘ Hide, and no ✕ while the list is being read", async () => {
    api.list.mockResolvedValue([entry({})]);
    mount();
    await waitFor(() => expect(lines()).toHaveLength(1));
    expect(screen.queryByRole("button", { name: /hide/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  });

  it("says a list that could not be loaded, with Try again — never shows it empty, and offers no +", async () => {
    api.list.mockRejectedValue(new Error("network"));
    mount();
    await screen.findByText("Could not load this patient's drug hypersensitivity / high-alert list.", undefined, { timeout: 5000 }); // after its one quiet retry
    expect(lines()).toEqual([]);
    expect((addBtn() as HTMLButtonElement).disabled).toBe(true);
    api.list.mockResolvedValue([entry({})]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(lines()).toEqual(["Hypersensitive to NAPA(Paracetamol)"]));
  });

  it("an answer that is not the list is a failure, not an empty list", async () => {
    api.list.mockResolvedValue("<html>Wi-Fi sign in</html>");
    mount();
    await screen.findByText("Could not load this patient's drug hypersensitivity / high-alert list.", undefined, { timeout: 5000 }); // after its one quiet retry
  });

  it("without the key the list is still shown, with no + and no ✎ Edit", async () => {
    api.list.mockResolvedValue([entry({})]);
    mount(false);
    await waitFor(() => expect(lines()).toHaveLength(1));
    expect(screen.queryByRole("button", { name: /^Add to / })).toBeNull();
    expect(screen.queryByRole("button", { name: "✎ Edit" })).toBeNull();
  });
});

describe("DrugSafetyField — + adds one entry at a time", () => {
  it("a medicine picked from the list: its generic is the catalogue's, and nothing is sent with no question ticked", async () => {
    api.list.mockResolvedValue([]);
    api.add.mockResolvedValue(entry({}));
    mount();
    await waitFor(() => expect((addBtn() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(addBtn());
    fireEvent.change(screen.getByLabelText("Medicine"), { target: { value: "napa" } });
    fireEvent.click(await screen.findByRole("button", { name: /^Napa.*Tablet.*500 mg.*Paracetamol/ }));
    expect(screen.getByTestId("drug-safety-picked").textContent).toBe("NAPA(Paracetamol)");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert").textContent).toBe("Tick at least one of the two questions.");
    expect(api.add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Is the patient hypersensitive to this drug?"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add" })); });
    expect(api.add).toHaveBeenCalledWith("P1", { kind: "drug", brand: "Napa", generic: "Paracetamol", hypersensitive: true, highAlert: false });
  });

  it("a medicine used as typed carries NO generic", async () => {
    api.list.mockResolvedValue([]);
    api.add.mockResolvedValue(entry({}));
    hits.results = [];
    mount();
    await waitFor(() => expect((addBtn() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(addBtn());
    fireEvent.change(screen.getByLabelText("Medicine"), { target: { value: "Zzyxol" } });
    fireEvent.click(screen.getByRole("button", { name: /Use “Zzyxol” as typed/ }));
    fireEvent.click(screen.getByLabelText("Is it a high-alert medication?"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add" })); });
    expect(api.add).toHaveBeenCalledWith("P1", { kind: "drug", brand: "Zzyxol", hypersensitive: false, highAlert: true });
  });

  it("a written line is sent as typed, and stays in its box when the server refuses it", async () => {
    api.list.mockResolvedValue([]);
    api.add.mockRejectedValueOnce(new ApiError(409, "This line is already on the list."));
    mount();
    await waitFor(() => expect((addBtn() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(addBtn());
    fireEvent.click(screen.getByRole("button", { name: "Write a line" }));
    const box = screen.getByLabelText("Line") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "Patient is hypersensitive to sulphar containing drug" } });
    await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); });
    expect(api.add).toHaveBeenCalledWith("P1", { kind: "text", text: "Patient is hypersensitive to sulphar containing drug" });
    expect(dialogs.tell).toHaveBeenCalledWith(expect.objectContaining({ title: "The entry was not added.", body: "This line is already on the list." }));
    expect((screen.getByLabelText("Line") as HTMLInputElement).value).toBe("Patient is hypersensitive to sulphar containing drug");
  });

  it("Cancel with something typed asks before discarding it", async () => {
    api.list.mockResolvedValue([]);
    dialogs.confirmAction.mockResolvedValueOnce(false);
    mount();
    await waitFor(() => expect((addBtn() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(addBtn());
    fireEvent.change(screen.getByLabelText("Medicine"), { target: { value: "nap" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cancel" })); });
    expect(dialogs.confirmAction).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: "Discard", danger: true }));
    expect((screen.getByLabelText("Medicine") as HTMLInputElement).value).toBe("nap");
  });
});

describe("DrugSafetyField — ✎ Edit", () => {
  it("shows ✕ only inside ✎ Edit; removing is the server's soft removal, and Undo puts it back", async () => {
    api.list.mockResolvedValue([entry({})]);
    api.remove.mockResolvedValue({ id: "e1" });
    api.restore.mockResolvedValue(entry({}));
    mount();
    await waitFor(() => expect(lines()).toHaveLength(1));
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "✎ Edit" }));
    api.list.mockResolvedValue([]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: 'Remove "NAPA(Paracetamol)"' })); });
    expect(api.remove).toHaveBeenCalledWith("P1", "e1");
    expect(screen.getByRole("status").textContent).toContain("Removed “Hypersensitive to NAPA(Paracetamol)”");
    api.list.mockResolvedValue([entry({})]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Undo" })); });
    expect(api.restore).toHaveBeenCalledWith("P1", "e1");
  });

  it("changes a medicine's ticks, and will not untick the last one", async () => {
    api.list.mockResolvedValue([entry({ hypersensitive: true, highAlert: false })]);
    api.update.mockResolvedValue(entry({ highAlert: true }));
    mount();
    await waitFor(() => expect(lines()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "✎ Edit" }));
    fireEvent.click(screen.getByLabelText("Is the patient hypersensitive to this drug?"));
    expect(dialogs.tell).toHaveBeenCalledWith(expect.objectContaining({ title: "Tick at least one." }));
    expect(api.update).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByLabelText("Is it a high-alert medication?")); });
    expect(api.update).toHaveBeenCalledWith("P1", "e1", { highAlert: true });
  });

  it("corrects a written line in place; a blanked box is a mis-key, not a removal", async () => {
    api.list.mockResolvedValue([entry({ kind: "text", brand: "", generic: null, hypersensitive: false, text: "Sulpha allergy" })]);
    api.update.mockResolvedValue(entry({}));
    mount();
    await waitFor(() => expect(lines()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "✎ Edit" }));
    const box = screen.getByLabelText("Edit this line") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "  " } });
    fireEvent.blur(box);
    expect(api.update).not.toHaveBeenCalled();
    expect(box.value).toBe("Sulpha allergy");
    fireEvent.change(box, { target: { value: "Sulphonamide allergy" } });
    await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); });
    expect(api.update).toHaveBeenCalledWith("P1", "e1", { text: "Sulphonamide allergy" });
  });

  it("offers ✎ Edit only for what this practice may change", async () => {
    api.list.mockResolvedValue([entry({ editable: false })]);
    mount();
    await waitFor(() => expect(lines()).toHaveLength(1));
    expect(screen.queryByRole("button", { name: "✎ Edit" })).toBeNull();
  });
});
