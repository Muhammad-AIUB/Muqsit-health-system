// @vitest-environment jsdom
//
// A template key that partly failed to upload keeps ONLY the failures: the old
// code kept the whole key, so the next session re-posted the templates that had
// already reached the server — duplicates in the doctor's template list.

import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const ptGet = vi.fn();
const ptUpdate = vi.fn();
vi.mock("@/lib/api", () => ({
  templatesApi: { create: (...a: unknown[]) => create(...a) },
  prescriptionLayoutApi: { update: vi.fn() },
  patientsApi: { get: (...a: unknown[]) => ptGet(...a), update: (...a: unknown[]) => ptUpdate(...a) },
}));

import { migrateLocalDataToServer } from "./migrateLocalData";

const KEY = "mhs_rx_templates_opd";

beforeEach(() => {
  localStorage.clear();
  create.mockReset();
});

describe("template migration retry", () => {
  it("drops each template that persisted, keeps only the failure", async () => {
    localStorage.setItem(KEY, JSON.stringify([{ name: "A" }, { name: "B" }, { name: "C" }]));
    create.mockImplementation(async (t: { name: string }) => {
      if (t.name === "B") throw new Error("network");
      return { id: t.name };
    });

    await migrateLocalDataToServer("u1");
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([{ name: "B" }]);
    expect(localStorage.getItem("mhs_local_migrated_v1_u1")).toBeNull();

    // Next session: only B is re-sent.
    create.mockReset();
    create.mockResolvedValue({ id: "x" });
    await migrateLocalDataToServer("u1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ name: "B" });
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

// The legacy health-monitoring dates are merged UNDER the server map: the key
// can wait weeks on a shared PC, and a whole-value write of the old copy would
// erase durations edited on another device since.
describe("health-monitoring dates migration", () => {
  it("keeps server entries and only fills drugs the server has no dates for", async () => {
    localStorage.setItem("mhs_hm_dates_p1", JSON.stringify({
      Napa: { sf: "01/01/2026", upto: "05/01/2026" },
      Seclo: { sf: "02/01/2026", upto: "09/01/2026" },
    }));
    ptGet.mockResolvedValue({ id: "p1", hmDrugDates: { Napa: { sf: "10/03/2026", upto: "20/03/2026" } } });
    ptUpdate.mockResolvedValue({});

    await migrateLocalDataToServer("doc1");

    expect(ptUpdate).toHaveBeenCalledWith("p1", {
      hmDrugDates: {
        Napa: { sf: "10/03/2026", upto: "20/03/2026" },
        Seclo: { sf: "02/01/2026", upto: "09/01/2026" },
      },
    });
    expect(localStorage.getItem("mhs_hm_dates_p1")).toBeNull();
  });
});
