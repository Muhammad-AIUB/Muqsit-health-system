// ⚕️ "Total monthly approximate cost", priced from the medicine chart
// (physician's decision, 2026-10-14: "take from medicine chart — but remember
// like Sergel 20 and Sergel 40 mg is not same"). A wrong number here is a
// number a patient plans their month by. So only what can be read WHOLE is
// priced: a tablet, capsule or suppository the chart prices by the unit, a dose
// written as counts (1+0+1), a duration in days, weeks or months — and every
// medicine that is not priced is counted and named, never left out silently.
// The brands are made up; the prices are written in the chart's own shapes.

import { describe, expect, it } from "vitest";
import {
  dosesPerDay, durationDays, monthlyCost, MONTH_DAYS, readChartRows, unitPrice, unpricedReason, type ChartRow,
} from "@/lib/monthlyCost";
import type { RxItem } from "@/types";

const row = (brandName: string, dosageForm: string | null, strength: string | null, priceRaw: string | null): ChartRow =>
  ({ brandName, dosageForm, strength, priceRaw });

const CHART: ChartRow[] = [
  row("Zzprice", "Tablet", "20 mg", "Unit Price: ৳ 7.00 (3 x 10: ৳ 210.00)"),
  row("Zzprice", "Tablet", "40 mg", "Unit Price: ৳ 11.00 (2 x 10: ৳ 220.00)"),
  row("Zzprice", "Syrup", "10 mg/5 ml", "100 ml bottle: ৳ 85.00"),
  row("Zzcap", "Capsule (Enteric Coated)", "20 mg", "Unit Price: ৳ 5.00 (10 x 10: ৳ 500.00)"),
  row("Zzcap", "Capsule (Enteric Coated)", "40 mg", "Unit Price: ৳ 1,150.00 (2 x 7: ৳ 16,100.00)"),
  row("Zztwo", "Tablet", "10 mg", "Unit Price: ৳ 2.50 (100's pack: ৳ 250.00)"),
  row("Zztwo", "Tablet", "10 mg", "Unit Price: ৳ 2.00 (10 x 10: ৳ 200.00)"),
  row("Zzsame", "Tablet", "5 mg", "Unit Price: ৳ 3.00 (10 x 10: ৳ 300.00)"),
  row("Zzsame", "Tablet", "5 mg", "Unit Price: ৳ 3.00 (5 x 10: ৳ 150.00)"),
  row("Zznone", "Tablet", "1 mg", "Price not available."),
  row("Zzinj", "IV Injection", "1 gm/vial", "Unit Price: ৳ 300.00"),
  row("Zzform", "Tablet", "500 mg", "Unit Price: ৳ 1.20 (50 x 10: ৳ 600.00)"),
  row("Zzform", "Suppository", "500 mg", "Unit Price: ৳ 6.00 (2 x 5: ৳ 60.00)"),
  row("Zzsupp", "Suppository", "250 mg", "Unit Price: ৳ 4.00 (2 x 5: ৳ 40.00)"),
  // A brand's second pack, as the chart's import stores it: the brand alone,
  // with no form and no strength (the source leaves them blank on that row).
  row("Zzbare", "Tablet", "10 mg", "Unit Price: ৳ 3.00 (10 x 10: ৳ 300.00)"),
  row("Zzbare", null, null, "Unit Price: ৳ 4.00 (5 x 10: ৳ 200.00)"),
  row("Zzbaresame", "Tablet", "10 mg", "Unit Price: ৳ 3.00 (10 x 10: ৳ 300.00)"),
  row("Zzbaresame", null, null, "Unit Price: ৳ 3.00 (5 x 10: ৳ 150.00)"),
  row("Zzbarebottle", "Tablet", "5 mg", "Unit Price: ৳ 2.00 (10 x 10: ৳ 200.00)"),
  row("Zzbarebottle", null, null, "100 ml bottle: ৳ 50.00"),
];

const line = (drug: string, dose: string, duration: string, over: Partial<RxItem> = {}): RxItem =>
  ({ drug, dose, instruction: "After meal", duration, isCont: false, ...over });
const taper = (dose: string, duration: string): RxItem => ({ drug: "", dose, instruction: "", duration, isCont: true });
const note = (text: string): RxItem => ({ drug: text, dose: "", instruction: "", duration: "", isNote: true });

const cost = (items: RxItem[]) => monthlyCost(items, CHART);
const only = (items: RxItem[]) => cost(items).lines[0];

describe("unitPrice — the chart's price of ONE unit, read whole, or nothing", () => {
  it.each([
    ["Unit Price: ৳ 7.00 (3 x 10: ৳ 210.00)", 7],
    ["Unit Price: ৳ 1,150.00 (2 x 7: ৳ 16,100.00)", 1150],
    ["Unit Price: ৳ 3.00 (100's pack: ৳ 300.00)", 3],
    ["Unit Price: ৳ 4.00", 4],
    ["Unit Price: ৳ 12", 12],
    ["Unit Price: ৳ 0.38 (50 x 10: ৳ 190.00)", 0.38],
    ["  Unit Price: ৳ 4.00  ", 4],
  ])("%s → %s", (raw, taka) => {
    expect(unitPrice(raw)).toBe(taka);
  });

  it.each([
    "70 ml bottle: ৳ 125.47",
    "3 gm tube: ৳ 45.17",
    "250 mg vial: ৳ 400.00",
    "Price not available.",
    "Not for sale",
    "Each device: ৳ 4,000.00",
    "",
    "Unit Price: ৳ 1,15.00",
    "Unit Price: ৳ 1.2.0",
    "Unit Price: ৳ -3.00",
    "Unit Price: $ 3.00",
    "Unit Price: ৳ 3.00 and more",
    "Unit Price: ৳ ৩.০০",
  ])("⚕️ %j is not a unit price: nothing", (raw) => {
    expect(unitPrice(raw)).toBeNull();
  });

  it("never throws", () => {
    expect(unitPrice(null)).toBeNull();
    expect(unitPrice(undefined as unknown as string)).toBeNull();
  });
});

describe("dosesPerDay — a dose written as counts, read whole", () => {
  it.each([
    ["1+0+1", 2],
    ["1 + 0 + 1", 2],
    ["1+1+1+1", 4],
    ["0+0+1", 1],
    ["2+0+0", 2],
    ["1/2+0+1/2", 1],
    ["½+0+½", 1],
    ["0.5+0+0.5", 1],
    ["1+0", 1],
    ["0+0+0", 0],
  ])("%s → %s a day", (dose, n) => {
    expect(dosesPerDay(dose)).toBe(n);
  });

  it.each(["", "2", "1+0+1 (after food)", "1-0-1", "101", "১+০+১", "1++1", "1/0+1", "+1+1", "1+0+1+", "2 tsf+0+2 tsf", "1 + x + 1"])(
    "⚕️ %j is not read: nothing", (dose) => {
      expect(dosesPerDay(dose)).toBeNull();
    },
  );
});

describe("durationDays — days, weeks or months, or Continue", () => {
  it.each([
    ["5 days", 5],
    ["1 day", 1],
    ["5days", 5],
    ["2 week", 14],
    ["2 weeks", 14],
    ["1 month", 30],
    ["3 months", 90],
    ["7 দিন", 7],
    ["2 সপ্তাহ", 14],
    ["1 মাস", 30],
    [" 5 Days ", 5],
  ])("%s → %s days", (written, days) => {
    expect(durationDays(written)).toBe(days);
  });

  it("Continue is the rest of the month", () => {
    expect(durationDays("Continue")).toBe("continue");
    expect(durationDays("continue")).toBe("continue");
  });

  it.each(["", "SOS", "5", "0 days", "1.5 month", "5 days then stop", "until review", "চলবে", "৭ দিন"])("⚕️ %j is not read: nothing", (written) => {
    expect(durationDays(written)).toBeNull();
  });
});

describe("monthlyCost — a medicine's month, priced", () => {
  it("doses a day × days × the unit price", () => {
    expect(only([line("Tablet. Zzprice 20 mg", "1+0+1", "5 days")])).toEqual({ label: "Tablet. Zzprice 20 mg", taka: 2 * 5 * 7 });
  });

  it(`a month is ${MONTH_DAYS} days: a longer course is priced for ${MONTH_DAYS}, Continue too`, () => {
    expect(only([line("Tablet. Zzprice 20 mg", "1+0+0", "3 months")]).taka).toBe(30 * 7);
    expect(only([line("Tablet. Zzprice 20 mg", "1+0+0", "Continue")]).taka).toBe(30 * 7);
    expect(only([line("Tablet. Zzprice 20 mg", "1+0+0", "2 weeks")]).taka).toBe(14 * 7);
  });

  // ⚕️ The physician's own example: two strengths of one medicine are two
  // medicines, at two prices.
  it("⚕️ each strength at its own price — Zzcap 20 mg is never priced as Zzcap 40 mg", () => {
    const out = cost([
      line("Capsule (Enteric Coated). Zzcap 20 mg", "1+0+1", "Continue"),
      line("Capsule (Enteric Coated). Zzcap 40 mg", "1+0+0", "7 days"),
    ]);
    expect(out.lines.map((l) => l.taka)).toEqual([2 * 30 * 5, 7 * 1150]);
    expect(out.total).toBe(2 * 30 * 5 + 7 * 1150);
  });

  it("the medicine is found however its label was typed — and without its form, when only one form has that strength", () => {
    expect(only([line("tab zzprice 20mg", "1+0+0", "5 days")]).taka).toBe(5 * 7);
    expect(only([line("Zzprice 40 mg", "1+0+0", "5 days")]).taka).toBe(5 * 11);
    expect(only([line("Zzsupp 250 mg", "0+0+1", "3 days")]).taka).toBe(3 * 4);
  });

  it("⚕️ without its form, where the chart has that strength in two forms, it is not priced", () => {
    expect(only([line("Zzform 500 mg", "1+0+1", "5 days")])).toEqual({ label: "Zzform 500 mg", unpriced: "several" });
    expect(only([line("Tablet. Zzform 500 mg", "1+0+1", "5 days")]).taka).toBeCloseTo(2 * 5 * 1.2);
  });

  it("one medicine at two prices in the chart is not priced; at one price twice it is", () => {
    expect(only([line("Tablet. Zztwo 10 mg", "1+0+0", "5 days")]).unpriced).toBe("several");
    expect(only([line("Tablet. Zzsame 5 mg", "1+0+0", "5 days")]).taka).toBe(15);
  });

  // ⚕️ The second pack of a brand is stored with no form and no strength, so it
  // cannot be told which medicine of the brand it is a pack of (review, before
  // release). A unit price there that differs from the medicine's own leaves
  // the medicine not priced; one that agrees, or a pack priced by the bottle,
  // changes nothing.
  it("⚕️ a pack of the brand stored with no form or strength, at another unit price: not priced", () => {
    expect(only([line("Tablet. Zzbare 10 mg", "1+0+0", "5 days")]).unpriced).toBe("several");
    expect(only([line("Tablet. Zzbaresame 10 mg", "1+0+0", "5 days")]).taka).toBe(15);
    expect(only([line("Tablet. Zzbarebottle 5 mg", "1+0+0", "5 days")]).taka).toBe(10);
  });

  // ⚕️ The food cell may say how OFTEN, not only when: "once a week" under a
  // dose of 1+0+0 is four tablets a month, not thirty (review, before
  // release). Only a cell that is blank or says when to take it beside a meal
  // is read as "every day"; anything else leaves the medicine not priced.
  describe("the food instruction", () => {
    it.each(["", "After meal", "after meal", "Before meal", "With food", "2 hr before meal", "1hr after meal", "2 hr before or after meal", " AFTER  MEAL "])(
      "%j says when, not how often: priced", (food) => {
        expect(only([line("Tablet. Zzprice 20 mg", "1+0+0", "5 days", { instruction: food })]).taka).toBe(35);
      },
    );

    it.each(["After meal, once a week", "once weekly", "Alternate day", "on alternate days", "খাবার পরে", "After meal.", "empty stomach"])(
      "⚕️ %j may say how often: not priced", (food) => {
        expect(only([line("Tablet. Zzprice 20 mg", "1+0+0", "Continue", { instruction: food })]).unpriced).toBe("instruction");
      },
    );

    it("…on a tapering line as well", () => {
      expect(only([line("Tablet. Zzprice 20 mg", "1+0+0", "5 days"), { ...taper("1+0+0", "Continue"), instruction: "once a week" }]).unpriced).toBe("instruction");
    });
  });

  it.each([
    ["not in the chart", line("Tablet. Zzunknown 5 mg", "1+0+0", "5 days"), "not-in-chart"],
    ["another strength than the chart has", line("Tablet. Zzprice 30 mg", "1+0+0", "5 days"), "not-in-chart"],
    ["no price in the chart", line("Tablet. Zznone 1 mg", "1+0+0", "5 days"), "no-price"],
    ["a syrup: the chart prices the bottle", line("Syrup. Zzprice 10 mg/5 ml", "1+1+1", "5 days"), "per-pack"],
    ["an injection, even at a unit price", line("IV Injection. Zzinj 1 gm/vial", "1+0+1", "5 days"), "per-pack"],
    ["a dose that is not counts", line("Tablet. Zzprice 20 mg", "1 if fever", "5 days"), "dose"],
    ["no dose yet", line("Tablet. Zzprice 20 mg", "", "5 days"), "dose"],
    ["no duration yet", line("Tablet. Zzprice 20 mg", "1+0+1", ""), "duration"],
    ["a duration that is not read", line("Tablet. Zzprice 20 mg", "1+0+1", "until review"), "duration"],
  ])("⚕️ %s: not priced, and said why", (_what, item, reason) => {
    const out = cost([item]);
    expect(out.lines).toEqual([{ label: item.drug, unpriced: reason }]);
    expect(out.total).toBe(0);
  });

  it("a medicine not priced takes nothing from the ones that are", () => {
    const out = cost([line("Tablet. Zzprice 20 mg", "1+0+0", "5 days"), line("Syrup. Zzprice 10 mg/5 ml", "1+1+1", "5 days")]);
    expect(out.total).toBe(35);
    expect(out.lines.map((l) => l.unpriced ?? "priced")).toEqual(["priced", "per-pack"]);
  });

  // ⚕️ A tapering line is the same medicine at the next dose, after the line
  // above it: the month runs through them in order.
  describe("a medicine with tapering lines", () => {
    it("is priced line after line", () => {
      const out = only([line("Tablet. Zzprice 20 mg", "2+0+0", "5 days"), taper("1+0+0", "5 days"), taper("0.5+0+0", "Continue")]);
      expect(out.taka).toBe((2 * 5 + 1 * 5 + 0.5 * 20) * 7);
    });

    it(`stops at ${MONTH_DAYS} days`, () => {
      expect(only([line("Tablet. Zzprice 20 mg", "2+0+0", "20 days"), taper("1+0+0", "20 days")]).taka).toBe((2 * 20 + 1 * 10) * 7);
    });

    it("⚕️ a tapering line that cannot be read, inside the month, leaves the medicine not priced", () => {
      expect(only([line("Tablet. Zzprice 20 mg", "2+0+0", "5 days"), taper("1+0+0", "")]).unpriced).toBe("duration");
      expect(only([line("Tablet. Zzprice 20 mg", "2+0+0", "5 days"), taper("as before", "5 days")]).unpriced).toBe("dose");
    });

    it("…after the month it does not matter", () => {
      expect(only([line("Tablet. Zzprice 20 mg", "1+0+0", "Continue"), taper("as before", "")]).taka).toBe(30 * 7);
    });

    it("a tapering line saved before the mark existed — no drug name — is read as one", () => {
      const legacy: RxItem = { drug: "", dose: "1+0+0", instruction: "", duration: "5 days" };
      expect(only([line("Tablet. Zzprice 20 mg", "2+0+0", "5 days"), legacy]).taka).toBe(15 * 7);
    });
  });

  it("a note is not a medicine's line: never priced, never counted", () => {
    const out = cost([note("Tablet. Zzprice 20 mg"), note("bed rest"), line("Tablet. Zzprice 20 mg", "1+0+0", "5 days")]);
    expect(out.lines).toEqual([{ label: "Tablet. Zzprice 20 mg", taka: 35 }]);
  });

  it("an empty pad costs nothing and names nothing; blank lines are not medicines", () => {
    expect(cost([])).toEqual({ total: 0, lines: [] });
    expect(cost([line("", "", ""), line("   ", "1+0+1", "5 days")])).toEqual({ total: 0, lines: [] });
  });

  it("never throws on what is not a pad or a chart", () => {
    expect(() => monthlyCost(undefined as unknown as RxItem[], CHART)).not.toThrow();
    expect(() => monthlyCost([null as unknown as RxItem], CHART)).not.toThrow();
    expect(monthlyCost([line("Tablet. Zzprice 20 mg", "1+0+0", "5 days")], []).lines[0].unpriced).toBe("not-in-chart");
  });
});

describe("readChartRows — the server's answer, read without trusting it", () => {
  it("reads the rows", () => {
    expect(readChartRows({ rows: [CHART[0]] })).toEqual([CHART[0]]);
  });

  it("skips a row it cannot read, and keeps the rest", () => {
    expect(readChartRows({ rows: [CHART[0], { brandName: 7 }, null, "x"] })).toEqual([CHART[0]]);
  });

  it.each([null, undefined, "", 7, [], {}, { rows: "no" }, "<html>Sign in</html>"])("%j is not the chart: null", (body) => {
    expect(readChartRows(body)).toBeNull();
  });
});

describe("unpricedReason — said in the doctor's words", () => {
  it.each(["not-in-chart", "no-price", "per-pack", "several", "dose", "duration", "instruction"] as const)("%s has words", (r) => {
    expect(unpricedReason(r).length).toBeGreaterThan(10);
  });
});
