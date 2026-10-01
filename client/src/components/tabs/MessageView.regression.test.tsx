// @vitest-environment jsdom
//
// Regression for 82101b6 — "PatientChat draft and attachment reset per patient"
// (the MessageView half: `<PatientChat key={selected.id} …>`).
//
// The supervising doctor's page reuses ONE chat panel for whichever patient is
// selected. Without the key React keeps the same instance across a switch, so
// anything it holds — a half-typed note, an attached photo — is carried into
// the next patient's team thread, and Send posts it there. PatientChat has its
// own guard (pinned in PatientChat.test.tsx); this pins the second lock, at the
// place the instance is reused.

import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MessageView from "./MessageView";

// A jsdom render of these screens takes seconds on the dev machine; the
// default 5 s is the failure mode there, not the code.
vi.setConfig({ testTimeout: 30_000 });

const patient = (id: string, name: string) => ({
  id, name, dob: null, age: null, ageAsOfYear: null, sex: null, mobile: null, hospitalId: null, ownerName: "Dr Owner",
});
vi.mock("@/hooks/useChat", () => ({
  useSupervisedPatients: () => ({ data: [patient("A", "Patient A"), patient("B", "Patient B")], isLoading: false }),
}));

// A stand-in chat that holds a draft the way the real one does, and has NO
// reset of its own — so only a remount can clear it.
let mounts = 0;
vi.mock("@/components/prescription/PatientChat", () => ({
  default: function ChatStub({ patientId }: { patientId: string }) {
    const [draft, setDraft] = useState("");
    useState(() => { mounts += 1; return 0; });
    return (
      <div>
        <span data-testid="thread">{patientId}</span>
        <input aria-label="draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
      </div>
    );
  },
}));

afterEach(() => { cleanup(); mounts = 0; });

describe("82101b6: the supervised-patients chat is a fresh panel per patient", () => {
  it("⚕️ a note typed for patient A is gone when patient B is opened", () => {
    render(<MessageView />);
    fireEvent.click(screen.getByText("Patient A"));
    fireEvent.change(screen.getByLabelText("draft"), { target: { value: "note meant for A" } });
    expect((screen.getByLabelText("draft") as HTMLInputElement).value).toBe("note meant for A");

    fireEvent.click(screen.getByText("Patient B"));
    expect(screen.getByTestId("thread").textContent).toBe("B");
    expect((screen.getByLabelText("draft") as HTMLInputElement).value).toBe("");
    expect(mounts).toBe(2); // a new instance, not the old one handed a new id
  });

  it("re-selecting the same patient keeps what was typed", () => {
    render(<MessageView />);
    fireEvent.click(screen.getByText("Patient A"));
    fireEvent.change(screen.getByLabelText("draft"), { target: { value: "still typing" } });
    fireEvent.click(screen.getAllByText("Patient A")[0]); // the list row (the name is also the panel heading)
    expect((screen.getByLabelText("draft") as HTMLInputElement).value).toBe("still typing");
    expect(mounts).toBe(1);
  });
});
