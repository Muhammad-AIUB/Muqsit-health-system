// @vitest-environment jsdom
//
// ⚕️ "Previous complaints" is the LAST visit's chief complaints. Saving today's
// visit refetches the patient's prescriptions, which makes today's the newest;
// the field must not then be re-seeded with today's complaints (wiping the
// doctor's notes, and recording the wrong "previous" on a second save).

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import PreviousComplaintsField from "./PreviousComplaintsField";
import { encodePc } from "@/lib/previousComplaints";

let patientId: string | null = "A";
let query: { data: unknown; isLoading: boolean } = { data: undefined, isLoading: true };
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({ currentPatientId: patientId }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => query }));

afterEach(() => { cleanup(); patientId = "A"; query = { data: undefined, isLoading: true }; });

const lastVisit = { createdAt: "2026-09-01T10:00:00Z", chiefComplaints: ["Fever"] };
const today = { createdAt: "2026-09-29T10:00:00Z", chiefComplaints: ["Cough"] };

let latest: string[] = [];
function Host({ initial = [] as string[] }) {
  const [items, setItems] = useState(initial);
  latest = items;
  return <PreviousComplaintsField items={items} setItems={setItems} />;
}

describe("PreviousComplaintsField", () => {
  it("seeds from the most recent past visit on first load", () => {
    const { rerender } = render(<Host />);
    query = { data: [lastVisit], isLoading: false };
    rerender(<Host />);
    expect(latest).toEqual([encodePc("Fever", "")]);
  });

  it("keeps the previous complaints and the doctor's note after today's save refetches", () => {
    const { rerender } = render(<Host initial={[encodePc("Fever", "better now")]} />);
    query = { data: [lastVisit], isLoading: false };
    rerender(<Host />);
    expect(latest).toEqual([encodePc("Fever", "better now")]);
    query = { data: [lastVisit, today], isLoading: false };
    rerender(<Host />);
    expect(latest).toEqual([encodePc("Fever", "better now")]);
  });

  it("seeds again when another patient is opened", () => {
    const { rerender } = render(<Host />);
    query = { data: [lastVisit], isLoading: false };
    rerender(<Host />);
    patientId = "B";
    query = { data: undefined, isLoading: true };
    rerender(<Host />);
    query = { data: [{ createdAt: "2026-08-01T10:00:00Z", chiefComplaints: ["Back pain"] }], isLoading: false };
    rerender(<Host />);
    expect(latest).toEqual([encodePc("Back pain", "")]);
  });
});
