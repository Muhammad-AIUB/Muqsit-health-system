// @vitest-environment jsdom
//
// Settings → Statistics (physician's sheet, 11/11/2026): a card right after
// Payment; inside it a horizontal menu of two — Patient statistics and Disease
// statistics. Patient statistics: a chart by days (total serial and seen per day
// of a month) or by months (patients seen per month of a year), for all chambers
// or one, and five overall numbers. Disease statistics: the final diagnoses and
// how many patients have each. Every number is the server's; what is tested here
// is what is asked for, what is drawn from the answer, and what is said when the
// answer does not come.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dhakaToday } from "@/lib/opdDay";
import { monthCaption, shiftMonthKey } from "@/lib/statistics";

const mocks = vi.hoisted(() => ({
  days: vi.fn(),
  months: vi.fn(),
  overall: vi.fn(),
  diseases: vi.fn(),
  chambers: vi.fn(),
  pathname: "/settings",
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  statisticsApi: { days: mocks.days, months: mocks.months, overall: mocks.overall, diseases: mocks.diseases },
  chambersApi: { list: mocks.chambers },
}));
vi.mock("@/context/AuthContext", () => ({ useOptionalAuth: () => ({ user: { id: "doc-1" } }) }));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({ isAssistantMode: false, activeWorkstationId: null, setActiveTab: vi.fn() }) }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
// The other settings pages are not under test here.
vi.mock("./ManageAssistantsView", () => ({ default: () => null }));
vi.mock("./ProfileSettingsView", () => ({ default: () => null }));
vi.mock("./PrescriptionSettingsView", () => ({ default: () => null }));
vi.mock("./PrescriptionTemplatesView", () => ({ default: () => null }));
vi.mock("./FavouriteSettingsView", () => ({ default: () => null }));
vi.mock("./ChambersSettingsView", () => ({ default: () => null }));
vi.mock("./PaymentSettingsView", () => ({ default: () => null }));

import StatisticsView from "./StatisticsView";
import SettingsView from "./SettingsView";

vi.setConfig({ testTimeout: 30_000 });

const TODAY = dhakaToday();
const THIS_MONTH = TODAY.slice(0, 7);
const THIS_YEAR = TODAY.slice(0, 4);
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });

const CHAMBERS = [
  { id: "main", doctorId: "doc-1", name: "Main chamber", address: "", isDefault: true },
  { id: "ibn", doctorId: "doc-1", name: "Ibn Sina", address: "Dhanmondi", isDefault: false },
];

// Every day of a month, 4 booked and 3 seen on the 3rd, nobody otherwise.
const daysOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => {
    const day = `${month}-${String(i + 1).padStart(2, "0")}`;
    return i === 2 ? { day, total: 4, seen: 3 } : { day, total: 0, seen: 0 };
  });
};
const monthsOf = (year: string) =>
  Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    return i === 0 ? { month, total: 3600, seen: 3564 } : i === 6 ? { month, total: 1000, seen: 980 } : { month, total: 0, seen: 0 };
  });

const OVERALL = { totalVisits: 760, averageMonthly: 253.3, averageDaily: 10, thisMonth: 40, previousMonth: 120, firstSeenDay: "2026-09-01", days: 76, months: 3, today: TODAY };

const page = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StatisticsView onBack={vi.fn()} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  mocks.pathname = "/settings";
  mocks.days.mockReset().mockImplementation(async (month: string) => ({ month, days: daysOf(month) }));
  mocks.months.mockReset().mockImplementation(async (year: string) => ({ year, months: monthsOf(year) }));
  mocks.overall.mockReset().mockResolvedValue(OVERALL);
  mocks.diseases.mockReset().mockResolvedValue({ diagnoses: [{ name: "HTN", patients: 12 }, { name: "DM", patients: 8 }, { name: "Cirrhosis", patients: 3 }] });
  mocks.chambers.mockReset().mockResolvedValue(CHAMBERS);
});
afterEach(cleanup);

describe("Settings — the Statistics card", () => {
  it("comes right after Payment", () => {
    render(<QueryClientProvider client={new QueryClient()}><SettingsView /></QueryClientProvider>);
    const titles = Array.from(document.querySelectorAll(".card-press")).map((c) => c.textContent ?? "");
    const payment = titles.findIndex((t) => t.startsWith("Payment"));
    expect(titles[payment + 1]).toMatch(/^Statistics/);
  });

  it("/settings/statistics opens it", async () => {
    mocks.pathname = "/settings/statistics";
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SettingsView /></QueryClientProvider>);
    expect(await screen.findByRole("tablist", { name: "Statistics" })).toBeTruthy();
    await flush();
  });
});

describe("the horizontal menu", () => {
  it("has Patient statistics and Disease statistics, and opens on Patient statistics", async () => {
    page();
    const tabs = within(screen.getByRole("tablist", { name: "Statistics" })).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Patient statistics", "Disease statistics"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    await flush();
    expect(mocks.diseases).not.toHaveBeenCalled(); // not asked for until it is opened
  });

  it("Disease statistics opens its own page and leaves the patient numbers", async () => {
    page();
    await flush();
    fireEvent.click(screen.getByRole("tab", { name: "Disease statistics" }));
    await flush();
    expect(screen.getByRole("tab", { name: "Disease statistics" }).getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector("[data-stats-chart]")).toBeNull();
    expect(screen.getByText("Final diagnosis")).toBeTruthy();
  });
});

describe("Patient statistics — by days", () => {
  it("opens on this month for all chambers, and draws every day of it", async () => {
    page();
    await flush();
    expect(mocks.days).toHaveBeenCalledWith(THIS_MONTH, "all");
    expect(mocks.overall).toHaveBeenCalledWith("all");
    const chart = document.querySelector('[data-stats-chart="days"]')!;
    expect(chart).toBeTruthy();
    const bars = chart.querySelectorAll("[data-bar]");
    expect(bars.length).toBe(daysOf(THIS_MONTH).length);
    // the 3rd: a light bar for the 4 booked and a dark one for the 3 seen, the dark one shorter
    const third = chart.querySelector(`[data-bar="${THIS_MONTH}-03"]`)!;
    const total = Number(third.querySelector('[data-kind="total"]')!.getAttribute("height"));
    const seen = Number(third.querySelector('[data-kind="seen"]')!.getAttribute("height"));
    expect(total).toBeGreaterThan(seen);
    expect(seen / total).toBeCloseTo(3 / 4, 5);
    // a day with nobody has bars of no height, and still a tooltip
    const first = chart.querySelector(`[data-bar="${THIS_MONTH}-01"]`)!;
    expect(Number(first.querySelector('[data-kind="total"]')!.getAttribute("height"))).toBe(0);
    expect(first.querySelector("title")!.textContent).toMatch(/0 total serial, 0 seen/);
    expect(third.querySelector("title")!.textContent).toMatch(/4 total serial, 3 seen/);
  });

  it("says the month, and the totals of what is drawn", async () => {
    page();
    await flush();
    expect(screen.getByText("Total serial:", { exact: false }).closest("[data-stats-summary]")!.textContent).toBe("Total serial: 4Seen: 3");
    expect(document.querySelector("[data-stats-period]")!.textContent).toMatch(/^[A-Z][a-z]+ \d{4}$/);
  });

  it("the arrows move one month; the answer is asked for that month and named by it", async () => {
    page();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    await flush();
    const prev = shiftMonthKey(THIS_MONTH, -1);
    expect(mocks.days).toHaveBeenLastCalledWith(prev, "all");
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    await flush();
    expect(mocks.days).toHaveBeenLastCalledWith(shiftMonthKey(THIS_MONTH, 1), "all");
  });

  it("the light bar is the total serial and the dark bar the seen patients, and the legend says so", async () => {
    page();
    await flush();
    const legend = document.querySelector("[data-stats-legend]")!;
    expect(legend.textContent).toBe("Total serialSeen patients");
  });
});

describe("Patient statistics — by months", () => {
  it("By months asks for the year, and draws the twelve months with the seen number above each bar", async () => {
    page();
    await flush();
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "months" } });
    await flush();
    expect(mocks.months).toHaveBeenCalledWith(THIS_YEAR, "all");
    const chart = document.querySelector('[data-stats-chart="months"]')!;
    expect(chart.querySelectorAll("[data-bar]").length).toBe(12);
    const values = Array.from(chart.querySelectorAll('[data-kind="value"]')).map((v) => v.textContent);
    expect(values).toEqual(["3564", "980"]);
    expect(chart.querySelectorAll('[data-kind="total"]').length).toBe(0); // one bar a month: the patients seen
    expect(document.querySelector("[data-stats-period]")!.textContent).toBe(THIS_YEAR);
    expect(document.querySelector("[data-stats-legend]")!.textContent).toBe("Seen patients");
  });

  it("the arrows move one year", async () => {
    page();
    await flush();
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "months" } });
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Previous year" }));
    await flush();
    expect(mocks.months).toHaveBeenLastCalledWith(String(Number(THIS_YEAR) - 1), "all");
    expect(document.querySelector("[data-stats-period]")!.textContent).toBe(String(Number(THIS_YEAR) - 1));
  });

  it("⚕️ never shows one period under another's name: while the next month is on its way there is no chart, not last month's", async () => {
    let release: (v: unknown) => void = () => {};
    page();
    await flush();
    mocks.days.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    await flush();
    expect(document.querySelector('[data-stats-chart="days"]')).toBeNull();
    expect(screen.getByText("Loading numbers…")).toBeTruthy();
    const prev = shiftMonthKey(THIS_MONTH, -1);
    await act(async () => { release({ month: prev, days: daysOf(prev) }); });
    await flush();
    expect(document.querySelector('[data-stats-chart="days"]')).toBeTruthy();
    expect(document.querySelector("[data-stats-period]")!.textContent).toBe(monthCaption(prev));
  });
});

describe("Patient statistics — the chamber", () => {
  it("All chamber total first, then each chamber; choosing one asks for THAT chamber, in the chart and in the overall numbers", async () => {
    page();
    await flush();
    const select = screen.getByLabelText("Chamber") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => [o.value, o.textContent])).toEqual([["all", "All chamber total"], ["main", "Main chamber"], ["ibn", "Ibn Sina"]]);
    expect(select.value).toBe("all");
    fireEvent.change(select, { target: { value: "ibn" } });
    await flush();
    expect(mocks.days).toHaveBeenLastCalledWith(THIS_MONTH, "ibn");
    expect(mocks.overall).toHaveBeenLastCalledWith("ibn");
  });

  it("when the chambers cannot be loaded the total is still there, and it says so", async () => {
    mocks.chambers.mockReset().mockRejectedValue(new Error("down"));
    page();
    await flush();
    const select = screen.getByLabelText("Chamber") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["all"]);
    expect(screen.getByText(/Chambers did not load/)).toBeTruthy();
    expect(mocks.days).toHaveBeenCalledWith(THIS_MONTH, "all");
  });
});

describe("Patient statistics — the overall numbers", () => {
  it("Total visit, Average monthly, Average daily, This month (up to today), Previous month — and no other", async () => {
    page();
    await flush();
    const cards = Array.from(document.querySelectorAll("[data-stat]")).map((c) => [c.getAttribute("data-stat"), c.querySelector("div")!.textContent, c.querySelector("[data-stat-value]")!.textContent]);
    expect(cards).toEqual([
      ["total", "Total visit", "760"],
      ["monthly", "Average monthly visits", "253.3"],
      ["daily", "Average daily visits", "10.0"],
      ["thisMonth", "This month's visit (up to today)", "40"],
      ["previousMonth", "Previous month visit", "120"],
    ]);
  });

  it("says what the averages are taken over, and which months the two month cards are", async () => {
    page();
    await flush();
    expect(screen.getByText("Over 3 calendar months")).toBeTruthy();
    expect(screen.getByText("Over 76 calendar days")).toBeTruthy();
    expect(screen.getByText("Seen patients since 01/09/2026")).toBeTruthy();
    // named from the SERVER's today, not the PC's clock
    mocks.overall.mockResolvedValue({ ...OVERALL, today: "2026-03-31", thisMonth: 2, previousMonth: 1 });
    cleanup();
    page();
    await flush();
    expect(screen.getByText("March 2026")).toBeTruthy();
    expect(screen.getByText("February 2026")).toBeTruthy();
  });

  it("nobody seen yet: 0 for the counts and a dash — never 0 — for the averages", async () => {
    mocks.overall.mockResolvedValue({ ...OVERALL, totalVisits: 0, averageMonthly: null, averageDaily: null, thisMonth: 0, previousMonth: 0, firstSeenDay: null, days: 0, months: 0 });
    page();
    await flush();
    const value = (id: string) => document.querySelector(`[data-stat="${id}"] [data-stat-value]`)!.textContent;
    expect([value("total"), value("monthly"), value("daily"), value("thisMonth"), value("previousMonth")]).toEqual(["0", "—", "—", "0", "0"]);
    expect(screen.getAllByText("No visit seen yet").length).toBe(2);
  });

  it("says that Seen is Completed in the OPD queue, and that only queued patients are counted", async () => {
    page();
    await flush();
    expect(screen.getByText(/Seen = Completed in the OPD queue/)).toBeTruthy();
    expect(screen.getByText(/Only patients put on the OPD queue are counted/)).toBeTruthy();
  });
});

describe("when the numbers do not come", () => {
  it("a failed chart says what did not load and asks again in place, leaving the overall numbers alone", async () => {
    mocks.days.mockReset().mockRejectedValueOnce(new Error("503")).mockImplementation(async (month: string) => ({ month, days: daysOf(month) }));
    page();
    await flush();
    expect(screen.getByText("Could not load the patient numbers.")).toBeTruthy();
    expect(document.querySelector("[data-stat]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();
    expect(document.querySelector('[data-stats-chart="days"]')).toBeTruthy();
    expect(screen.queryByText("Could not load the patient numbers.")).toBeNull();
  });

  it("an answer that is not the numbers — an empty body, a sign-in page — is a failure, never 'nobody came'", async () => {
    mocks.days.mockReset().mockResolvedValue("<html>sign in</html>");
    mocks.overall.mockReset().mockResolvedValue({});
    page();
    await flush();
    expect(screen.getByText("Could not load the patient numbers.")).toBeTruthy();
    expect(screen.getByText("Could not load the overall numbers.")).toBeTruthy();
    expect(document.querySelector("[data-stats-chart]")).toBeNull();
    expect(document.querySelector("[data-stat]")).toBeNull();
  });
});

describe("Disease statistics", () => {
  const open = async () => {
    page();
    await flush();
    fireEvent.click(screen.getByRole("tab", { name: "Disease statistics" }));
    await flush();
  };

  it("lists each final diagnosis with its number of patients, in the order the server gives", async () => {
    await open();
    const rows = Array.from(document.querySelectorAll("[data-disease]")).map((r) => [r.getAttribute("data-disease"), r.querySelector("[data-disease-count]")!.textContent]);
    expect(rows).toEqual([["HTN", "12"], ["DM", "8"], ["Cirrhosis", "3"]]);
    expect(screen.getByText(/how many different patients have it/)).toBeTruthy();
  });

  it("shows a diagnosis whole and as written, however long, and takes no chamber", async () => {
    const long = "Decompensated chronic liver disease (Child-Pugh B) with ascites, on diuretics";
    mocks.diseases.mockResolvedValue({ diagnoses: [{ name: long, patients: 2 }] });
    await open();
    expect(screen.getByText(long)).toBeTruthy();
    expect(mocks.diseases).toHaveBeenCalledWith();
  });

  it("no final diagnosis yet is said in words", async () => {
    mocks.diseases.mockResolvedValue({ diagnoses: [] });
    await open();
    expect(screen.getByText("No Final diagnosis has been written on a prescription yet.")).toBeTruthy();
  });

  it("a failure says so and asks again — never 'no diseases'", async () => {
    mocks.diseases.mockReset().mockRejectedValueOnce(new Error("503")).mockResolvedValue({ diagnoses: [{ name: "DM", patients: 1 }] });
    await open();
    expect(screen.getByText("Could not load the disease numbers.")).toBeTruthy();
    expect(screen.queryByText("No Final diagnosis has been written on a prescription yet.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();
    expect(document.querySelectorAll("[data-disease]").length).toBe(1);
  });

  it("an answer that is not the list is a failure too", async () => {
    mocks.diseases.mockResolvedValue({ diagnoses: "none" });
    await open();
    expect(screen.getByText("Could not load the disease numbers.")).toBeTruthy();
  });
});
