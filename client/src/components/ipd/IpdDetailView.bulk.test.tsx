// @vitest-environment jsdom
//
// The + beside ℞ on the IPD sheet (physician, 24/11/2026): "Add Bulk Medicine",
// as on the OPD pad, but its list shows what was ordered on the WARD first. The
// lines it adds go in before the pad's typing line and touch nothing else.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { IpdAdmission, IpdClinical } from "@/lib/api";
import type { RxItem } from "@/types";

const bulk = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock("@/components/prescription/BulkMedicineButton", () => ({
  default: (p: Record<string, unknown>) => { bulk.props = p; return <span data-testid="bulk" />; },
}));
vi.mock("@/hooks/useIpd", () => ({
  useUpdateIpd: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useIpdEvents: () => ({ data: [] }),
  useAddIpdEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useWards", () => ({ useWards: () => ({ data: [] }) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "doc-test-1" } }) }));
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    investigation: [], setInvestigation: vi.fn(), invImages: {}, setInvImages: vi.fn(),
    setShowInvPopup: vi.fn(), beginInvBorrow: vi.fn(), endInvBorrow: vi.fn(), activeWorkstationId: "ws-1",
  }),
}));
// The pad shows its rows as text, so what the append did can be read.
vi.mock("@/components/prescription/MedicinePad", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/prescription/MedicinePad")>()),
  default: ({ rows }: { rows: { drug: string; dose: string; continuation: boolean }[] }) => (
    <div data-testid="pad">{rows.map((r) => `${r.continuation ? ">>>" : r.drug}|${r.dose}`).join(" ; ")}</div>
  ),
}));
vi.mock("@/components/prescription/RxAlerts", () => ({ default: () => null }));
vi.mock("./AnalogueSheetPanel", () => ({ default: () => null }));
vi.mock("@/components/common/ExpandableField", () => ({ default: () => null }));
vi.mock("@/components/investigation/InvestigationFindingsField", () => ({ default: () => null }));

import IpdDetailView from "./IpdDetailView";

vi.setConfig({ testTimeout: 30_000 });
afterEach(cleanup);

const admission = (rxItems: RxItem[]): IpdAdmission => ({
  id: "adm1", patientId: null, bed: "B-3", name: "Patient", hospitalId: null, roomNo: null, wardNo: null, wardId: null,
  floorBuilding: null, mobile: null, age: null, sex: null, diagnosis: null, status: "Stable",
  clinical: { rxItems } as unknown as IpdClinical, admittedAt: "2026-09-07T04:00:00.000Z",
});
const napa: RxItem = { drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "" };
const append = (items: RxItem[]) => act(() => { (bulk.props!.onAppend as (i: RxItem[]) => void)(items); });
const pad = () => screen.getByTestId("pad").textContent;

describe("IPD ℞ — the + (Add Bulk Medicine)", () => {
  it("is there beside ℞, asks for the WARD's list, and is this admission's", () => {
    render(<IpdDetailView admission={admission([napa])} onBack={() => {}} />);
    expect(screen.getByTestId("bulk")).toBeTruthy();
    expect(bulk.props).toMatchObject({ scope: "ipd", patientId: "adm1", workstationId: "ws-1", allowed: true });
    expect(bulk.props!.existing).toEqual([expect.objectContaining({ drug: "Tablet. Napa 500 mg" })]);
  });

  it("adds the ticked lines before the pad's typing line, taper and all", () => {
    render(<IpdDetailView admission={admission([napa])} onBack={() => {}} />);
    append([
      { drug: "Tablet. Prednisolone 10 mg", dose: "2+0+0", duration: "3 days", instruction: "After meal", isCont: false },
      { drug: "", dose: "1+0+0", duration: "3 days", instruction: "", isCont: true },
    ]);
    expect(pad()).toBe("Tablet. Napa 500 mg|1+1+1 ; Tablet. Prednisolone 10 mg|2+0+0 ; >>>|1+0+0 ; |");
  });

  it("works on an empty sheet and leaves the typing line last", () => {
    render(<IpdDetailView admission={admission([])} onBack={() => {}} />);
    append([napa]);
    expect(pad()).toBe("Tablet. Napa 500 mg|1+1+1 ; |");
  });
});
