// @vitest-environment jsdom
//
// Settings → Chambers (physician's sheet 28/10/2026, item 8): add, rename, edit
// the address, remove with a question — the main chamber cannot be removed;
// an assistant sees the list read-only.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<object>()), chambersApi: api }));
const dialogs = vi.hoisted(() => ({ confirm: vi.fn(), tell: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/dialogs", () => ({ confirmAction: dialogs.confirm, tell: dialogs.tell }));
const ctx = vi.hoisted(() => ({ isAssistantMode: false }));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({ ...ctx, activeWorkstationId: null }) }));
vi.mock("@/context/AuthContext", () => ({ useOptionalAuth: () => ({ user: { id: "u1" } }) }));

import ChambersSettingsView from "./ChambersSettingsView";

const LIST = [
  { id: "main", doctorId: "u1", name: "Main chamber", address: "Labaid", isDefault: true },
  { id: "ibn", doctorId: "u1", name: "Ibn Sina", address: "Kalyanpur", isDefault: false },
];
const wrap = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  api.list.mockResolvedValue(LIST);
  dialogs.confirm.mockReset();
  dialogs.tell.mockClear();
  ctx.isAssistantMode = false;
});
afterEach(cleanup);

describe("Settings → Chambers", () => {
  it("lists the chambers; the main one has no Remove", async () => {
    render(<ChambersSettingsView onBack={() => {}} />, { wrapper: wrap });
    await flush();
    expect(screen.getByDisplayValue("Main chamber")).toBeTruthy();
    expect(screen.getByDisplayValue("Kalyanpur")).toBeTruthy();
    expect(screen.queryByLabelText("Remove Main chamber")).toBeNull();
    expect(screen.getByLabelText("Remove Ibn Sina")).toBeTruthy();
  });

  it("adds a chamber with its name and address", async () => {
    api.create.mockResolvedValue({ id: "new" });
    render(<ChambersSettingsView onBack={() => {}} />, { wrapper: wrap });
    await flush();
    const boxes = screen.getAllByRole("textbox");
    fireEvent.change(boxes[boxes.length - 2], { target: { value: "Popular" } });
    fireEvent.change(boxes[boxes.length - 1], { target: { value: "Shantinagar" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add chamber" })); });
    expect(api.create).toHaveBeenCalledWith({ name: "Popular", address: "Shantinagar" });
  });

  it("renames and edits the address — sent only on Save", async () => {
    api.update.mockResolvedValue({});
    render(<ChambersSettingsView onBack={() => {}} />, { wrapper: wrap });
    await flush();
    fireEvent.change(screen.getByDisplayValue("Ibn Sina"), { target: { value: "Ibn Sina Hospital" } });
    expect(api.update).not.toHaveBeenCalled();
    const saves = screen.getAllByText("Save");
    await act(async () => { fireEvent.click(saves[1]); });
    expect(api.update).toHaveBeenCalledWith("ibn", { name: "Ibn Sina Hospital" });
  });

  it("asks before removing, and removes nothing when the answer is no", async () => {
    dialogs.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    api.remove.mockResolvedValue({ id: "ibn" });
    render(<ChambersSettingsView onBack={() => {}} />, { wrapper: wrap });
    await flush();
    await act(async () => { fireEvent.click(screen.getByLabelText("Remove Ibn Sina")); });
    expect(api.remove).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByLabelText("Remove Ibn Sina")); });
    expect(api.remove).toHaveBeenCalledWith("ibn");
  });

  it("an assistant sees the list read-only", async () => {
    ctx.isAssistantMode = true;
    render(<ChambersSettingsView onBack={() => {}} />, { wrapper: wrap });
    await flush();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getByText("Kalyanpur")).toBeTruthy();
    expect(screen.getByText(/Only the practice doctor can add or change chambers/)).toBeTruthy();
  });

  it("a list that did not load says so, with Try again", async () => {
    api.list.mockRejectedValue(new Error("offline"));
    render(<ChambersSettingsView onBack={() => {}} />, { wrapper: wrap });
    await flush();
    expect(screen.getByText("Could not load your chambers.")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});
