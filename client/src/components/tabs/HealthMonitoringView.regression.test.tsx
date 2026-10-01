// @vitest-environment jsdom
//
// Regression for 82101b6 — "HealthMonitoring … ignore late results for a
// previous patient" (the ROLLBACK of a failed duration save).
//
// A duration override is saved optimistically and rolled back if the server
// refuses it. The rollback used to run unconditionally: a save for patient A
// that failed slowly — after the doctor had opened patient B — wrote A's
// override map into B's chart. B's next edit would then PATCH A's overrides
// onto B's record (the server takes whole-value writes on that column). The fix
// rolls back only while the failed write's patient is still on screen.
//
// The real component, a real QueryClient and the real `lib/api.ts`; only the
// network is the stub. The override maps are synthetic keys and dates.

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HealthMonitoringView from "./HealthMonitoringView";
import { deferred, installApiStub, type ApiStub } from "@/test/apiStub";
import { makePatient } from "@/test/fixtures";
import type { DrugDateMap } from "@/lib/hmDates";

// A jsdom render of these screens takes seconds on the dev machine; the
// default 5 s is the failure mode there, not the code.
vi.setConfig({ testTimeout: 30_000 });

let ctx: { currentPatientId: string | null };
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({ drugHistory: [], investigationSummary: [], activeWorkstationId: null, isAssistantMode: false, ...ctx }),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "doc-test-1" } }) }));
const logActivity = vi.fn();
vi.mock("@/hooks/useActivity", () => ({ useActivityLog: () => logActivity }));

// The chart is a stand-in that exposes what it was handed.
type ChartProps = {
  drugDates: DrugDateMap; symptomDates: DrugDateMap; saveError: string | null; canEdit: boolean;
  onSaveDrugDates: (next: DrugDateMap, note: string) => void;
  onSaveSymptomDates: (next: DrugDateMap, note: string) => void;
};
let chart: ChartProps;
vi.mock("./HealthTrendsChart", () => ({ default: (p: ChartProps) => { chart = p; return null; } }));

const A_STORED: DrugDateMap = { "Drug of A": { sf: "01/01/2026", upto: "01/02/2026" } };
const A_EDITED: DrugDateMap = { "Drug of A": { sf: "01/01/2026", upto: "01/03/2026" } };
const B_STORED: DrugDateMap = { "Drug of B": { sf: "05/05/2026", upto: "06/06/2026" } };

let api: ApiStub;
let qc: QueryClient;
const view = () => (
  <QueryClientProvider client={qc}><HealthMonitoringView /></QueryClientProvider>
);
const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

beforeEach(() => {
  api = installApiStub();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  logActivity.mockReset();
  api.on("GET", "/prescriptions?patientId=A", { json: [] })
    .on("GET", "/patients/A", { json: makePatient({ id: "A", hmDrugDates: A_STORED, hmSymptomDates: A_STORED }) });
});
afterEach(() => {
  cleanup();
  qc.clear();
  api.restore();
});

const openA = async () => {
  ctx = { currentPatientId: "A" };
  const r = render(view(), { wrapper });
  await waitFor(() => expect(chart.drugDates).toEqual(A_STORED));
  return r;
};
const openB = async (rerender: (ui: React.ReactElement) => void) => {
  api.on("GET", "/prescriptions?patientId=B", { json: [] })
    .on("GET", "/patients/B", { json: makePatient({ id: "B", hmDrugDates: B_STORED, hmSymptomDates: B_STORED }) });
  ctx = { currentPatientId: "B" };
  rerender(view());
  await waitFor(() => expect(chart.drugDates).toEqual(B_STORED));
};

describe("82101b6: a duration save that fails after the doctor moved to another patient", () => {
  it("⚕️ does not put patient A's overrides into patient B's chart (medicines)", async () => {
    const { rerender } = await openA();
    const gate = deferred();
    api.on("PATCH", "/patients/A", { status: 500, json: { message: "boom" }, after: gate.promise })
      .on("GET", "/patients/A", { json: makePatient({ id: "A", hmDrugDates: A_STORED }) }); // refetch of A's record, if it happens
    act(() => chart.onSaveDrugDates(A_EDITED, "moved"));
    expect(chart.drugDates).toEqual(A_EDITED); // optimistic

    await openB(rerender);
    await act(async () => { gate.release(); });
    // The failed save has fully settled (its onError has run) before we look.
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(api.callsTo("PATCH", "/patients/A")).toHaveLength(1);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(chart.drugDates).toEqual(B_STORED);
    expect(chart.saveError).toBeNull(); // and no failure message about A over B's chart
    expect(logActivity).not.toHaveBeenCalled();
    api.restore({ check: false }); // the refetch of A is allowed, not required
    api = installApiStub();
  });

  it("⚕️ the same for symptom durations", async () => {
    const { rerender } = await openA();
    const gate = deferred();
    api.on("PATCH", "/patients/A", { status: 500, json: { message: "boom" }, after: gate.promise })
      .on("GET", "/patients/A", { json: makePatient({ id: "A", hmSymptomDates: A_STORED }) });
    act(() => chart.onSaveSymptomDates(A_EDITED, "moved"));
    await openB(rerender);
    await act(async () => { gate.release(); });
    // The failed save has fully settled (its onError has run) before we look.
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(api.callsTo("PATCH", "/patients/A")).toHaveLength(1);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(chart.symptomDates).toEqual(B_STORED);
    expect(chart.saveError).toBeNull();
    api.restore({ check: false });
    api = installApiStub();
  });

  it("the write itself went to the patient it was made on, with that patient's map", async () => {
    await openA();
    api.on("PATCH", "/patients/A", { json: makePatient({ id: "A", hmDrugDates: A_EDITED, hmSymptomDates: A_STORED }) });
    act(() => chart.onSaveDrugDates(A_EDITED, "moved"));
    await waitFor(() => expect(logActivity).toHaveBeenCalledWith("Health monitoring", "moved", "saved"));
    expect(api.callsTo("PATCH", "/patients/A")[0].body).toEqual({ hmDrugDates: A_EDITED });
    expect(chart.drugDates).toEqual(A_EDITED);
  });
});

describe("a duration save that fails while its patient is still on screen", () => {
  it("is rolled back to what is stored, said out loud, and not logged as saved", async () => {
    await openA();
    api.on("PATCH", "/patients/A", { status: 500, json: { message: "boom" } });
    act(() => chart.onSaveDrugDates(A_EDITED, "moved"));
    await waitFor(() => expect(chart.saveError).toMatch(/Could not save that duration/));
    expect(chart.drugDates).toEqual(A_STORED);
    expect(logActivity).not.toHaveBeenCalled();
  });
});
