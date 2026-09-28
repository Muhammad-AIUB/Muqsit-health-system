// @vitest-environment jsdom
//
// The server REPLACES fieldRecents / investigationGroups with whatever is sent,
// and both hooks send the whole collection. Built on the empty stand-in used
// while /users/me is loading (or after it failed), a save would wipe every
// other field's recents / every saved investigation group. Pinned: nothing is
// sent until the profile has loaded.

import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const me = vi.fn();
const update = vi.fn();
vi.mock("@/lib/api", () => ({ usersApi: { me: () => me(), update: (b: unknown) => update(b) } }));

import { useFieldRecents } from "./useFieldRecents";
import { useInvestigationPrefs, useSaveInvestigationGroups } from "./useInvestigationPrefs";

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => { cleanup(); me.mockReset(); update.mockReset(); });

describe("useFieldRecents", () => {
  it("addRecents does nothing while the profile is loading", () => {
    me.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useFieldRecents(), { wrapper: wrapper() });
    expect(result.current.loaded).toBe(false);
    act(() => result.current.addRecents("Chief complaint", ["Fever"]));
    expect(update).not.toHaveBeenCalled();
  });

  it("addRecents does nothing when the profile failed to load", async () => {
    me.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useFieldRecents(), { wrapper: wrapper() });
    await waitFor(() => expect(me).toHaveBeenCalled());
    await act(async () => {});
    act(() => result.current.addRecents("Chief complaint", ["Fever"]));
    expect(update).not.toHaveBeenCalled();
  });

  it("once loaded, saves the new entry together with every other field's recents", async () => {
    me.mockResolvedValue({ fieldRecents: { "Chief complaint": ["Cough"], "Advice": ["Rest"] } });
    update.mockResolvedValue({});
    const { result } = renderHook(() => useFieldRecents(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.addRecents("Chief complaint", ["Fever"]));
    await waitFor(() => expect(update).toHaveBeenCalledWith({
      fieldRecents: { "Chief complaint": ["Fever", "Cough"], "Advice": ["Rest"] },
    }));
  });
});

describe("useSaveInvestigationGroups", () => {
  // A failed load (a still-pending one would also be refused, but the
  // mutation's onSettled refetch would then wait on that pending request).
  it("refuses to save when the profile did not load", async () => {
    me.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => ({ prefs: useInvestigationPrefs(), save: useSaveInvestigationGroups() }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.prefs.isLoading).toBe(false));
    expect(result.current.prefs.loaded).toBe(false);
    await expect(result.current.save.mutateAsync([{ name: "DM", tests: ["FBS"] }])).rejects.toThrow(/not loaded/);
    expect(update).not.toHaveBeenCalled();
  });

  it("saves once the profile has loaded", async () => {
    me.mockResolvedValue({ investigationGroups: [{ name: "DM", tests: ["FBS"] }] });
    update.mockResolvedValue({ investigationGroups: [] });
    const { result } = renderHook(() => ({ prefs: useInvestigationPrefs(), save: useSaveInvestigationGroups() }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.prefs.loaded).toBe(true));
    const next = [...result.current.prefs.groups, { name: "Anaemia", tests: ["CBC"] }];
    await act(async () => { await result.current.save.mutateAsync(next); });
    expect(update).toHaveBeenCalledWith({ investigationGroups: next });
  });
});
