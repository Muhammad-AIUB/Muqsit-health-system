// @vitest-environment jsdom
// The chart is asked once per list, only while it is open, and a failed answer
// is a failure (shown as stored), never "no generic" for every medicine.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const byBrand = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ medicinesApi: { byBrand } }));
import { useDrugHistoryGenerics } from "./useDrugHistoryGenerics";

let qc: QueryClient;
function wrap() {
  qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
const LABELS = ["Tablet. Napa 500 mg", "Tablet Napa 1000 mg", "Capsule. Sergel 20 mg"];

beforeEach(() => { byBrand.mockReset(); });
afterEach(() => { cleanup(); qc?.clear(); });

describe("useDrugHistoryGenerics", () => {
  it("asks nothing while the list is closed", () => {
    renderHook(() => useDrugHistoryGenerics(LABELS, false), { wrapper: wrap() });
    expect(byBrand).not.toHaveBeenCalled();
  });

  it("asks ONCE for the first word of every brand, and answers each label", async () => {
    byBrand.mockResolvedValue({ rows: [{ brandName: "Napa", genericName: "Paracetamol", dosageForm: "Tablet", strength: "500 mg", priceRaw: null }] });
    const { result } = renderHook(() => useDrugHistoryGenerics(LABELS, true), { wrapper: wrap() });
    expect(result.current.state).toBe("asking");
    expect(result.current.answer("Tablet. Napa 500 mg")).toBeNull();
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(byBrand).toHaveBeenCalledTimes(1);
    // As the monthly-cost box asks: each brand's first word, read two ways (`brandWordsOf`).
    expect(byBrand.mock.calls[0][0]).toEqual(expect.arrayContaining(["napa", "sergel"]));
    expect(result.current.answer("Tablet. Napa 500 mg")).toMatchObject({ kind: "generic", shown: "Tablet. Paracetamol 500 mg" });
    expect(result.current.answer("Capsule. Sergel 20 mg")).toEqual({ kind: "none" });
  });

  it("offline / a failed lookup: 'failed', and no label is answered", async () => {
    byBrand.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    const { result } = renderHook(() => useDrugHistoryGenerics(LABELS, true), { wrapper: wrap() });
    await waitFor(() => expect(result.current.state).toBe("failed"));
    expect(byBrand).toHaveBeenCalledTimes(3); // two quiet retries
    expect(result.current.answer("Tablet. Napa 500 mg")).toBeNull();
  });

  it("an answer that is not the chart is a failure, not an empty chart", async () => {
    byBrand.mockResolvedValue("<html>Wi-Fi sign in</html>");
    const { result } = renderHook(() => useDrugHistoryGenerics(LABELS, true), { wrapper: wrap() });
    await waitFor(() => expect(result.current.state).toBe("failed"));
    expect(result.current.answer("Tablet. Napa 500 mg")).toBeNull();
  });

  it("no medicine: nothing asked", () => {
    const { result } = renderHook(() => useDrugHistoryGenerics([], true), { wrapper: wrap() });
    expect(result.current.state).toBe("none");
    expect(byBrand).not.toHaveBeenCalled();
  });
});
