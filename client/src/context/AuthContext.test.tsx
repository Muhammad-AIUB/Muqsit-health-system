// @vitest-environment jsdom
//
// Signing out (or losing the session) must forget the previous account: its
// React Query cache (patients, OPD queue, IPD list, workstations, profile) and
// the X-Workstation header. Otherwise the next doctor on this tab sees the last
// doctor's records and every request carries the last doctor's workstation.

import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const setActiveWorkstationId = vi.fn();
let failAuth: (() => void) | null = null;
vi.mock("@/lib/api", () => ({
  ApiError: class extends Error { status = 0; },
  setActiveWorkstationId: (id: string | null) => setActiveWorkstationId(id),
  onAuthFailure: (fn: () => void) => { failAuth = fn; return () => { failAuth = null; }; },
  authApi: {
    me: () => Promise.resolve({ id: "A", name: "Dr A" }),
    logout: () => Promise.resolve(),
    login: () => Promise.resolve({ user: { id: "B", name: "Dr B" } }),
  },
}));

import { AuthProvider, useAuth } from "./AuthContext";

function setup() {
  const qc = new QueryClient();
  qc.setQueryData(["patients"], [{ id: "p1", name: "Doctor A's patient" }]);
  qc.setQueryData(["workstations"], [{ doctorId: "A" }]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}><AuthProvider>{children}</AuthProvider></QueryClientProvider>
  );
  return { qc, ...renderHook(() => useAuth(), { wrapper }) };
}

afterEach(() => { cleanup(); setActiveWorkstationId.mockReset(); failAuth = null; });

describe("AuthProvider forgets the previous account", () => {
  it("on logout", async () => {
    const { qc, result } = setup();
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.logout(); });
    expect(qc.getQueryData(["patients"])).toBeUndefined();
    expect(qc.getQueryData(["workstations"])).toBeUndefined();
    expect(setActiveWorkstationId).toHaveBeenCalledWith(null);
    expect(result.current.user).toBeNull();
  });

  it("on session loss (refresh failed)", async () => {
    const { qc, result } = setup();
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => failAuth!());
    expect(qc.getQueryData(["patients"])).toBeUndefined();
    expect(setActiveWorkstationId).toHaveBeenCalledWith(null);
    expect(result.current.user).toBeNull();
  });

  it("on login, before the new user takes effect", async () => {
    const { qc, result } = setup();
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.login("b", "pw", false); });
    expect(qc.getQueryData(["patients"])).toBeUndefined();
    expect(setActiveWorkstationId).toHaveBeenCalledWith(null);
    expect(result.current.user).toMatchObject({ id: "B" });
  });
});
