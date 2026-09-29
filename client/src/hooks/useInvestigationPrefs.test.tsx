// @vitest-environment jsdom
//
// ⚕️ Favourites and unit preferences are saved WHOLE (the server replaces the
// stored value). A save built on the `[]` / `{}` stand-in of a profile that
// never loaded would wipe the doctor's real list, so it is refused until the
// profile is in the cache.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ me: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, usersApi: { me: api.me, update: api.update } };
});

import { useInvestigationPrefs, useSaveFavourites, useSaveUnitPrefs } from "./useInvestigationPrefs";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => { cleanup(); api.me.mockReset(); api.update.mockReset(); });

describe("saving favourites / unit prefs before the profile has loaded (G8)", () => {
  it("refuses both writes when the profile failed to load", async () => {
    api.me.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(
      () => ({ prefs: useInvestigationPrefs(), fav: useSaveFavourites(), units: useSaveUnitPrefs() }),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(result.current.prefs.isLoading).toBe(false));
    expect(result.current.prefs.loaded).toBe(false);
    await act(async () => { await result.current.fav.mutateAsync(["CBC"]).catch(() => {}); });
    await act(async () => { await result.current.units.mutateAsync({ k: "u2" }).catch(() => {}); });
    expect(api.update).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.fav.isError).toBe(true));
  });

  it("saves once the profile is loaded", async () => {
    api.me.mockResolvedValue({ favouriteInvestigations: ["Hb"], investigationUnitPrefs: {} });
    api.update.mockResolvedValue({});
    const { result } = renderHook(
      () => ({ prefs: useInvestigationPrefs(), fav: useSaveFavourites() }),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(result.current.prefs.loaded).toBe(true));
    await act(async () => { await result.current.fav.mutateAsync(["Hb", "CBC"]); });
    expect(api.update).toHaveBeenCalledWith({ favouriteInvestigations: ["Hb", "CBC"] });
  });
});
