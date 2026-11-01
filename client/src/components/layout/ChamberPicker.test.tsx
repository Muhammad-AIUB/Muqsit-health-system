// @vitest-environment jsdom
//
// "My Chamber" (physician's sheet 28/10/2026, item 8). The choice decides which
// chamber's OPD list and print settings every request is about, so: it is kept
// per user and per practice, a list of one chamber is never shown under the
// other's name, and a chamber removed elsewhere is said, not silently replaced.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({ list: vi.fn(), header: vi.fn() }));
vi.mock("@/lib/api", () => ({ chambersApi: { list: api.list }, setActiveChamberId: api.header }));
const tell = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@/lib/dialogs", () => ({ tell }));
const who = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null, ws: null as string | null }));
vi.mock("@/context/AuthContext", () => ({ useOptionalAuth: () => ({ user: who.user }) }));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({ activeWorkstationId: who.ws }) }));

import ChamberPicker, { ChamberSync } from "./ChamberPicker";
import { getChamber, pickChamber, setChamber } from "@/lib/chamber";

const LIST = [
  { id: "main", doctorId: "u1", name: "Main chamber", address: "", isDefault: true },
  { id: "ibn", doctorId: "u1", name: "Ibn Sina", address: "Kalyanpur", isDefault: false },
];

let qc: QueryClient;
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.list.mockReset().mockResolvedValue(LIST);
  api.header.mockReset();
  tell.mockClear();
  who.user = { id: "u1" };
  who.ws = null;
  window.localStorage.clear();
  setChamber(null);
});
afterEach(cleanup);

describe("pickChamber", () => {
  it("none chosen is the default; a chosen one that is gone is the default, marked stale", () => {
    expect(pickChamber(LIST, null)).toEqual({ chamber: LIST[0], stale: false });
    expect(pickChamber(LIST, "ibn")).toEqual({ chamber: LIST[1], stale: false });
    expect(pickChamber(LIST, "gone")).toEqual({ chamber: LIST[0], stale: true });
    expect(pickChamber(undefined, "ibn")).toEqual({ chamber: null, stale: false });
  });
});

describe("My Chamber", () => {
  it("lists the chambers, and choosing one sends it with every request and remembers it for this user and practice", async () => {
    render(<><ChamberSync /><ChamberPicker /></>, { wrapper: wrap });
    await flush();
    const select = screen.getByLabelText("My Chamber") as HTMLSelectElement;
    expect(select.value).toBe("main");
    fireEvent.change(select, { target: { value: "ibn" } });
    expect(getChamber()).toBe("ibn");
    expect(api.header).toHaveBeenLastCalledWith("ibn");
    expect(window.localStorage.getItem("mhs_chamber:u1:u1")).toBe("ibn");
    // the main chamber is no header at all
    fireEvent.change(select, { target: { value: "main" } });
    expect(getChamber()).toBeNull();
    expect(window.localStorage.getItem("mhs_chamber:u1:u1")).toBeNull();
  });

  it("restores this user's choice for THIS practice only", async () => {
    window.localStorage.setItem("mhs_chamber:u1:u1", "ibn");
    window.localStorage.setItem("mhs_chamber:u1:docB", "other");
    render(<ChamberSync />, { wrapper: wrap });
    await flush();
    expect(getChamber()).toBe("ibn");
  });

  it("drops the cached OPD list when the chamber changes, so one chamber's list is never shown as another's", async () => {
    render(<ChamberSync />, { wrapper: wrap });
    await flush();
    qc.setQueryData(["opd"], [{ name: "Labaid patient" }]);
    act(() => setChamber("ibn"));
    await flush();
    expect(qc.getQueryData(["opd"])).toBeUndefined();
  });

  it("a chosen chamber that was removed elsewhere goes back to the main chamber, and says so", async () => {
    window.localStorage.setItem("mhs_chamber:u1:u1", "removed-one");
    render(<ChamberSync />, { wrapper: wrap });
    await flush();
    expect(getChamber()).toBeNull();
    expect(tell).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(tell.mock.calls[0])).toMatch(/Main chamber/);
    expect(window.localStorage.getItem("mhs_chamber:u1:u1")).toBeNull();
  });

  it("a list that did not load says so, and the choice cannot be changed", async () => {
    api.list.mockRejectedValue(new Error("offline"));
    render(<ChamberPicker />, { wrapper: wrap });
    await flush();
    const select = screen.getByLabelText("My Chamber") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(screen.getByText("Chambers did not load")).toBeTruthy();
  });

  it("renders nothing and asks nothing when no one is signed in", async () => {
    who.user = null;
    render(<ChamberPicker />, { wrapper: wrap });
    await flush();
    expect(screen.queryByLabelText("My Chamber")).toBeNull();
    expect(api.list).not.toHaveBeenCalled();
  });
});
