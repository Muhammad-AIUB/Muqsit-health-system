// @vitest-environment jsdom
//
// A learned-suggestion reply that lands AFTER its query was cleared must be
// dropped. With the ℞ pad's 3-letter gate (lib/rxSuggest.ts) every 3→2 letter
// edit clears the query, and a reply still in flight for the longer text used
// to fill the list back in — "Your usual: Metformin" under "Pa".

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const pending: { resolve: (v: unknown) => void }[] = [];
const deferred = () => new Promise((resolve) => pending.push({ resolve }));
vi.mock("@/lib/api", () => ({
  rxHabitsApi: { list: () => deferred() },
  doctorPhrasesApi: { list: () => deferred() },
}));

import { useRxHabits } from "./useRxHabits";
import { useDoctorPhrases } from "./useDoctorPhrases";

afterEach(() => { cleanup(); pending.length = 0; vi.useRealTimers(); });

describe("a reply for a cleared query is dropped", () => {
  it("useRxHabits", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ q }) => useRxHabits(q), { initialProps: { q: "Met" } });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(pending).toHaveLength(1);
    rerender({ q: "" });
    await act(async () => { pending[0].resolve([{ key: "met", items: [{ id: "1" }], hiddenCount: 0 }]); });
    expect(result.current.groups).toEqual([]);
  });

  it("useDoctorPhrases", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ on }) => useDoctorPhrases("rxNote", "bed", on), { initialProps: { on: true } });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(pending).toHaveLength(1);
    rerender({ on: false });
    await act(async () => { pending[0].resolve([{ id: "1", text: "bed rest", patientCount: 3 }]); });
    expect(result.current.phrases).toEqual([]);
  });
});
