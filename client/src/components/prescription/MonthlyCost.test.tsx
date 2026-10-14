// @vitest-environment jsdom
//
// ⚕️ The "Total monthly approximate cost" box on the prescription header,
// priced from the medicine chart through the real hook and the real rules
// (`lib/monthlyCost.ts`); only the server is replaced. What it has to hold: a
// number only for what the chart prices, every medicine it could not price
// counted and named, and a chart that could not be reached never shown as a
// total. The brands are made up; the prices are in the chart's own shapes.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// The box is drawn after the chart answers; under the whole suite a wait can
// outlast the 1 s `waitFor` gives by default with nothing wrong in the code.
configure({ asyncUtilTimeout: 10_000 });

const byBrand = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  medicinesApi: { search: vi.fn(), byBrand },
}));
const tell = vi.hoisted(() => vi.fn());
vi.mock("@/lib/dialogs", async (original) => ({ ...(await original<typeof import("@/lib/dialogs")>()), tell }));

import MonthlyCost from "./MonthlyCost";
import type { RxItem } from "@/types";

const CHART = {
  rows: [
    { brandName: "Zzcap", dosageForm: "Capsule (Enteric Coated)", strength: "20 mg", priceRaw: "Unit Price: ৳ 5.00 (10 x 10: ৳ 500.00)" },
    { brandName: "Zzcap", dosageForm: "Capsule (Enteric Coated)", strength: "40 mg", priceRaw: "Unit Price: ৳ 1,150.00 (2 x 7: ৳ 16,100.00)" },
    { brandName: "Zzsyp", dosageForm: "Syrup", strength: "10 mg/5 ml", priceRaw: "100 ml bottle: ৳ 85.00" },
  ],
};

const line = (drug: string, dose: string, duration: string): RxItem => ({ drug, dose, instruction: "After meal", duration, isCont: false });
const ZZCAP20 = line("Capsule (Enteric Coated). Zzcap 20 mg", "1+0+1", "Continue"); // 2 × 30 × 5 = 300
const ZZCAP40 = line("Capsule (Enteric Coated). Zzcap 40 mg", "1+0+0", "7 days"); // 7 × 1150 = 8,050
const ZZSYP = line("Syrup. Zzsyp 10 mg/5 ml", "1+1+1", "5 days");

let client: QueryClient;
const wrap = (ui: ReactElement) => <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
const box = () => screen.getByTestId("monthly-cost");

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
  byBrand.mockReset();
  tell.mockReset();
});
afterEach(() => {
  cleanup();
  client.clear();
});

describe("MonthlyCost", () => {
  it("an empty pad costs nothing, and the chart is not asked", () => {
    render(wrap(<MonthlyCost items={[]} mobile={false} />));
    expect(box().textContent).toBe("৳0.0");
    expect(byBrand).not.toHaveBeenCalled();
  });

  it("⚕️ prices each strength at its own price — 20 mg is never priced as 40 mg", async () => {
    byBrand.mockResolvedValue(CHART);
    render(wrap(<MonthlyCost items={[ZZCAP20, ZZCAP40]} mobile={false} />));
    await waitFor(() => expect(box().textContent).toBe("৳8,350.0"));
    expect(byBrand).toHaveBeenCalledTimes(1);
    expect(byBrand.mock.calls[0][0]).toEqual(["zzcap"]);
  });

  it("⚕️ a medicine it cannot price is counted beside the total, and named with the reason when asked", async () => {
    byBrand.mockResolvedValue(CHART);
    render(wrap(<MonthlyCost items={[ZZCAP20, ZZSYP]} mobile={false} />));
    const more = await screen.findByRole("button", { name: /1 not priced/ });
    expect(box().textContent).toBe("৳300.0· 1 not priced");
    fireEvent.click(more);
    expect(tell).toHaveBeenCalledTimes(1);
    const { title, body } = tell.mock.calls[0][0] as { title: string; body: string };
    expect(title).toBe("1 medicine is not in the total");
    expect(body).toContain("Syrup. Zzsyp 10 mg/5 ml — the medicine chart prices it by the pack (a bottle, a vial, a tube), not by the dose");
    expect(body).toContain("৳300.0 is the cost of the other 1.");
  });

  it("with nothing it can price, the total is not shown as a cost", async () => {
    byBrand.mockResolvedValue(CHART);
    render(wrap(<MonthlyCost items={[ZZSYP]} mobile={false} />));
    await screen.findByRole("button", { name: /1 not priced/ });
    expect(box().textContent).toBe("৳—· 1 not priced");
  });

  it("⚕️ a chart that could not be reached is never a total: it says so, and Try again asks again", async () => {
    byBrand.mockRejectedValue(new Error("Failed to fetch"));
    render(wrap(<MonthlyCost items={[ZZCAP20]} mobile={false} />));
    const again = await screen.findByRole("button", { name: /Prices not loaded/ });
    expect(box().textContent).toBe("৳—· Prices not loaded");
    const before = byBrand.mock.calls.length;
    byBrand.mockResolvedValue(CHART);
    fireEvent.click(again);
    await waitFor(() => expect(box().textContent).toBe("৳300.0"));
    expect(byBrand.mock.calls.length).toBeGreaterThan(before);
  });

  it("an answer that is not the chart is a failure, not an empty chart", async () => {
    byBrand.mockResolvedValue("<html>Sign in to the network</html>");
    render(wrap(<MonthlyCost items={[ZZCAP20]} mobile={false} />));
    await screen.findByRole("button", { name: /Prices not loaded/ });
  });

  it("a medicine written on the pad is asked for and priced — the earlier ones keep their price meanwhile", async () => {
    byBrand.mockResolvedValue(CHART);
    const { rerender } = render(wrap(<MonthlyCost items={[ZZCAP20]} mobile={false} />));
    await waitFor(() => expect(box().textContent).toBe("৳300.0"));
    let answer: (v: unknown) => void = () => undefined;
    byBrand.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    rerender(wrap(<MonthlyCost items={[ZZCAP20, line("Tablet. Zznew 5 mg", "1+0+0", "5 days")]} mobile={false} />));
    await waitFor(() => expect(byBrand.mock.calls.at(-1)?.[0]).toEqual(["zzcap", "zznew"]));
    expect(box().textContent).toBe("৳300.0…");
    answer({ rows: [...CHART.rows, { brandName: "Zznew", dosageForm: "Tablet", strength: "5 mg", priceRaw: "Unit Price: ৳ 2.00" }] });
    await waitFor(() => expect(box().textContent).toBe("৳310.0"));
  });
});
