// @vitest-environment jsdom
//
// The OPD queue on a doctor's screen. Reception's marks are made on another
// device, so today's queue is read again by itself; any other day is not. And a
// tick shows at once but is put back when the server does not take it.

import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OpdVisit } from "@/lib/api";

const list = vi.fn();
const setPresence = vi.fn();
vi.mock("@/lib/api", () => ({
  opdApi: {
    list: (d?: string) => list(d),
    setPresence: (id: string, input: unknown) => setPresence(id, input),
  },
}));

import { OPD_POLL_MS, useOpdQueue, useSetOpdPresence } from "./useOpd";
import { dhakaToday } from "@/lib/opdDay";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}

const visit = (over: Partial<OpdVisit>): OpdVisit => ({
  id: "v1", patientId: null, name: "N", phone: null, age: null, gender: null, type: "New", token: "T-01",
  status: "waiting", rxStatus: null, queueDate: "2026-10-28", position: 1,
  presentAt: null, criticallyIll: false, urgent: false, createdAt: "2026-10-28T03:00:00.000Z", ...over,
} as OpdVisit);

afterEach(() => { cleanup(); list.mockReset(); setPresence.mockReset(); });

describe("useOpdQueue — reading again by itself", () => {
  const optionsOf = (qc: QueryClient) => qc.getQueryCache().getAll()[0].observers[0].options;

  it("polls today's queue, and not in a background tab", async () => {
    list.mockResolvedValue([]);
    const { qc, wrapper } = setup();
    renderHook(() => useOpdQueue(dhakaToday()), { wrapper });
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(optionsOf(qc).refetchInterval).toBe(OPD_POLL_MS);
    expect(optionsOf(qc).refetchIntervalInBackground).toBe(false);
  });

  it("does not poll another day", async () => {
    list.mockResolvedValue([]);
    const { qc, wrapper } = setup();
    renderHook(() => useOpdQueue("2000-01-01"), { wrapper });
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(optionsOf(qc).refetchInterval).toBe(false);
  });
});

describe("useSetOpdPresence", () => {
  const DAY = "2026-10-28";
  const key = ["opd", "day", DAY];
  const seed = (qc: QueryClient, rows: OpdVisit[]) => qc.setQueryData(key, rows);

  it("puts the list back to what it was when the server does not take the tick", async () => {
    const { qc, wrapper } = setup();
    const before = [visit({ id: "a" }), visit({ id: "b", urgent: true })];
    seed(qc, before);
    list.mockResolvedValue(before);
    setPresence.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useSetOpdPresence(DAY), { wrapper });
    await act(async () => { await result.current.mutateAsync({ id: "a", urgent: true, present: true }).catch(() => undefined); });
    expect(qc.getQueryData(key)).toEqual(before);
  });

  it("keeps a Present time that is already there, clears it on un-tick, and a flag changes only itself", async () => {
    const { qc, wrapper } = setup();
    const at = "2026-10-28T04:00:00.000Z";
    const rows = [visit({ id: "a", presentAt: at }), visit({ id: "b" })];
    seed(qc, rows);
    // The server never answers, so what is read is the optimistic write.
    setPresence.mockReturnValue(new Promise(() => undefined));
    list.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useSetOpdPresence(DAY), { wrapper });
    const rowsNow = () => qc.getQueryData<OpdVisit[]>(key)!;

    act(() => { result.current.mutate({ id: "a", present: true }); });
    await waitFor(() => expect(setPresence).toHaveBeenCalledTimes(1));
    expect(rowsNow()[0].presentAt).toBe(at);

    act(() => { result.current.mutate({ id: "a", present: false }); });
    await waitFor(() => expect(rowsNow()[0].presentAt).toBeNull());

    act(() => { result.current.mutate({ id: "b", criticallyIll: true }); });
    await waitFor(() => expect(rowsNow()[1].criticallyIll).toBe(true));
    expect(rowsNow()[1]).toEqual({ ...rows[1], criticallyIll: true });
    expect(rowsNow()[1].urgent).toBe(false);
    expect(rowsNow()[1].presentAt).toBeNull();
  });
});
