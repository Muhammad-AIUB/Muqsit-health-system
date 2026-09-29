// @vitest-environment jsdom
//
// Privilege: an assistant with NO grants has no access. The per-assistant
// editor used to pre-tick the doctor's default keys in that case and Save was
// always enabled, so opening the editor and pressing Save re-granted access
// the doctor had revoked. The editor must show exactly what is stored, and
// Save must stay disabled until something actually changes.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mutateUpdate = vi.fn();
let assistants: Array<Record<string, unknown>> = [];

vi.mock("@/hooks/useAssistants", () => ({
  useAssistants: () => ({ data: assistants }),
  useAssistantDefaults: () => ({ data: { permissions: ["rx.chiefComplaints", "rx.history"] } }),
  useAssistantSearch: () => ({ data: [] }),
  useAddAssistant: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAssistant: () => ({ mutate: mutateUpdate, isPending: false }),
  useRemoveAssistant: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAssistantDefaults: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("./IpdTeamSection", () => ({ default: () => null }));

import ManageAssistantsView from "./ManageAssistantsView";

const assistant = (permissions: string[]) => ({
  id: "a1", name: "Rahim Uddin", status: "active", permissions,
  email: "", mobile: "",
});

// The Default access grid below uses the same labels; the per-assistant
// editor renders first.
const checkbox = (label: string) =>
  screen.getAllByLabelText(label)[0] as HTMLInputElement;
// The Default access section has its own Save; the per-assistant one is first.
const saveBtn = () => screen.getAllByRole("button", { name: "Save" })[0] as HTMLButtonElement;

afterEach(cleanup);
beforeEach(() => { mutateUpdate.mockReset(); });

describe("ManageAssistantsView per-assistant permission editor", () => {
  it("does not pre-tick the defaults for an assistant with no grants", () => {
    assistants = [assistant([])];
    render(<ManageAssistantsView onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit permissions" }));
    expect(checkbox("Chief complaints").checked).toBe(false);
    expect(checkbox("History").checked).toBe(false);
  });

  it("keeps Save disabled until the draft differs from what is stored", () => {
    assistants = [assistant([])];
    render(<ManageAssistantsView onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit permissions" }));
    expect(saveBtn().disabled).toBe(true);
    fireEvent.click(saveBtn());
    expect(mutateUpdate).not.toHaveBeenCalled();

    fireEvent.click(checkbox("History"));
    expect(saveBtn().disabled).toBe(false);
    fireEvent.click(checkbox("History"));
    expect(saveBtn().disabled).toBe(true);
  });

  it("seeds the draft from the stored grants exactly", () => {
    assistants = [assistant(["rx.medicines"])];
    render(<ManageAssistantsView onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit permissions" }));
    expect(checkbox("Medicines (Rx)").checked).toBe(true);
    expect(checkbox("Chief complaints").checked).toBe(false);
  });

  it("Reset to default is the explicit pre-tick, and then Save sends it", () => {
    assistants = [assistant([])];
    render(<ManageAssistantsView onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit permissions" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(checkbox("Chief complaints").checked).toBe(true);
    expect(saveBtn().disabled).toBe(false);
    fireEvent.click(saveBtn());
    expect(mutateUpdate).toHaveBeenCalledTimes(1);
    const arg = mutateUpdate.mock.calls[0][0] as { id: string; input: { permissions: string[] } };
    expect(arg.id).toBe("a1");
    expect([...arg.input.permissions].sort()).toEqual(["rx.chiefComplaints", "rx.history"]);
  });
});
