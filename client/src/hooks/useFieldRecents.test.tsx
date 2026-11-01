// @vitest-environment jsdom
//
// ⚕️ Physician's sheet, 31/10/2026: "Reset hobe na … amr age joto … likhsi sob
// thakbe". Until then a field kept its last 12 lines, and the 13th pushed the
// oldest out — for Note, Plan, Provisional diagnosis and Associated illness the
// only memory of what the doctor wrote. A new line now joins the list without
// pushing anything out.
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ me: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/api", () => ({ usersApi: { me: api.me, update: api.update } }));

import { RECENT_LIMIT, useFieldRecents } from "./useFieldRecents";

afterEach(() => { cleanup(); api.me.mockReset(); api.update.mockReset(); });

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe("useFieldRecents — nothing the doctor wrote is pushed out", () => {
  it("a field with 40 lines keeps all 40 when a 41st is added", async () => {
    const old = Array.from({ length: 40 }, (_, i) => `Plan ${i + 1}`);
    api.me.mockResolvedValue({ fieldRecents: { Plan: old, Note: ["n"] } });
    api.update.mockResolvedValue({});
    const { result } = renderHook(() => useFieldRecents(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.addRecents("Plan", ["Plan new"]));
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    const sent = api.update.mock.calls[0][0].fieldRecents;
    expect(sent.Plan).toEqual(["Plan new", ...old]);
    expect(sent.Note).toEqual(["n"]); // the other fields ride along untouched
  });

  it("the bound is far beyond any real list", () => {
    expect(RECENT_LIMIT).toBeGreaterThanOrEqual(1000);
  });
});
